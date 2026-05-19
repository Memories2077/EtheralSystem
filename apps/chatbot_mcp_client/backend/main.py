import asyncio
import os
import json
import re
import logging
from collections import Counter
from contextlib import AsyncExitStack
from typing import Optional, List, Dict, Any, AsyncGenerator, Union, cast

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, SecretStr
import requests
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager


from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

from langchain_mcp_adapters.tools import load_mcp_tools
from langchain.agents import create_agent
from langchain_core.runnables import Runnable

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from langchain.tools import tool
from langgraph_sdk import get_client
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage

from dotenv import load_dotenv
load_dotenv()

# Import centralized configuration
from config import config as llm_config
import database
from shared import create_mcp_server_tool, stream_langgraph_build, extract_create_mcp_tool_call, normalize_request_context
from metaclaw_client import MetaClawClient
from mcp_tool_invocation import McpToolInvocationTracker, record_mcp_tool_invocation_event
from mcp_server_filtering import ACTIVE_GENERATED_MCP_STATUSES, filter_active_mcp_server_payload
from research_metrics import (
    content_hash,
    duration_since_ms,
    monotonic_ms,
    record_research_event,
)

StandardAgent = Runnable[Any, Any]
AgentLike = Union[StandardAgent, MetaClawClient]

# For local development, read the port from config
backend_port = llm_config.backend_port

# Setup logging
logger = logging.getLogger(__name__)

class CustomEncoder(json.JSONEncoder):
    def default(self, o):
        if hasattr(o, "content"):
            return {"type": o.__class__.__name__, "content": getattr(o, "content")}
        return super().default(o)

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]
    provider: Optional[str] = "gemini"
    model: Optional[str] = "gemini-2.5-flash"
    temperature: Optional[float] = 0.0
    mcpServers: Optional[List[str]] = []
    sessionId: Optional[str] = None
    buildRequestId: Optional[str] = None
    traceId: Optional[str] = None
    experimentId: Optional[str] = None
    userId: Optional[str] = None
    workspaceId: Optional[str] = None
    email: Optional[str] = None
    memoryScope: Optional[str] = None

class McpMetadataRequest(BaseModel):
    url: str
    traceId: Optional[str] = None
    experimentId: Optional[str] = None
    sessionId: Optional[str] = None
    buildRequestId: Optional[str] = None
    serverId: Optional[str] = None

class AgentState:
    def __init__(self):
        self.agent: Optional[AgentLike] = None
        self.metaclaw_client: Optional[MetaClawClient] = None
        self.mcp_connections: Dict[str, Dict[str, Any]] = {} # URL -> {"stack": AsyncExitStack, "tools": List}
        self.exit_stacks: List[AsyncExitStack] = [] # Legacy field
        self.current_provider: Optional[str] = None
        self.current_model: Optional[str] = None
        self.current_mcp_urls: List[str] = []
        self.current_mcp_failures: List[str] = []
        self.current_mcp_tool_count: int = 0
        self.current_agent_expects_dict: bool = False
        self.current_temperature: Optional[float] = None
        self.lock = asyncio.Lock()

state = AgentState()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Connect to MongoDB
    try:
        await database.MongoDB.connect()
    except Exception as e:
        logger.warning(f"MongoDB connection failed: {e}")

    yield

    # Shutdown: Close everything
    logger.info("Shutting down: Releasing all persistent MCP links...")
    for url, conn in state.mcp_connections.items():
        try:
            await conn["stack"].aclose()
        except Exception:
            pass
    
    await database.MongoDB.disconnect()
    logger.info("Shutdown complete.")

app = FastAPI(lifespan=lifespan)

allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:9002").split(",")
allowed_origins = [origin.strip() for origin in allowed_origins if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------ #
# Helper Utilities                                                     #
# ------------------------------------------------------------------ #

def resolve_docker_url(url: str) -> str:
    """If running in Docker, resolve localhost to the internal container names."""
    if os.path.exists('/.dockerenv'):
        if "localhost:8080" in url or "127.0.0.1:8080" in url:
            return url.replace("localhost:8080", "docker-manager:8080").replace("127.0.0.1:8080", "docker-manager:8080")
        elif "localhost" in url or "127.0.0.1" in url:
            return url.replace("localhost", "host.docker.internal").replace("127.0.0.1", "host.docker.internal")
    return url


def sse_event(payload: Dict[str, Any]) -> str:
    return f"data: {json.dumps(payload)}\n\n"

def sse_content(content: str) -> str:
    return sse_event({"type": "content", "content": content})

def sse_error(error: str) -> str:
    return sse_event({"type": "error", "error": error})

def sse_status(message: str) -> str:
    return sse_event({"type": "status", "message": message})

def sse_done() -> str:
    return f"data: {json.dumps({'type': 'done'})}\n\ndata: [DONE]\n\n"


def active_mcp_tool_names(agent_state: AgentState, mcp_urls: Optional[List[str]]) -> List[str]:
    target_urls = [resolve_docker_url(str(url)) for url in (mcp_urls or []) if url]
    if not target_urls:
        target_urls = agent_state.current_mcp_urls
    names: List[str] = []
    for url in target_urls:
        conn = agent_state.mcp_connections.get(url)
        if not conn:
            continue
        for tool_item in conn.get("tools", []):
            name = str(getattr(tool_item, "name", "") or "").strip()
            if name:
                names.append(name)
    return names

# ------------------------------------------------------------------ #
# Agent Factory (Keep-Alive Implementation)                            #
# ------------------------------------------------------------------ #

async def get_or_create_agent(
    provider: str,
    model_name: str,
    mcp_urls: Optional[List[str]],
    temperature: float
) -> AgentLike:
    if mcp_urls is None:
        mcp_urls = []
    
    # Normalize and filter URLs
    target_urls = [resolve_docker_url(str(url)) for url in mcp_urls if url]

    async with state.lock:
        # 1. Check if we can reuse the current agent
        urls_changed = sorted(state.current_mcp_urls) != sorted(target_urls)
        config_changed = (
            state.current_provider != provider or 
            state.current_model != model_name or 
            state.current_temperature != temperature
        )

        if state.agent and not config_changed and not urls_changed:
            return state.agent

        logger.info(f"Syncing agent: {provider} | {model_name} | URLs: {len(target_urls)}")

        # 2. Sync MCP Connections
        current_connected = set(state.mcp_connections.keys())
        target_set = set(target_urls)
        
        # Close obsolete
        for url in (current_connected - target_set):
            logger.info(f"Closing obsolete link: {url}")
            conn = state.mcp_connections.pop(url, {})
            if "stack" in conn:
                try: await conn["stack"].aclose()
                except Exception: pass
        
        # Connect new
        new_failures = []
        for url in (target_set - current_connected):
            max_retries = llm_config.mcp_connection_retries
            connected = False
            for attempt in range(max_retries):
                stack = AsyncExitStack()
                try:
                    logger.info(f"Connecting to {url} (Attempt {attempt+1})...")
                    async with asyncio.timeout(llm_config.mcp_connection_timeout + llm_config.mcp_initialization_timeout):
                        streams = await stack.enter_async_context(streamable_http_client(url))
                        read, write, _ = streams
                        session = await stack.enter_async_context(ClientSession(read, write))
                        init_result = await session.initialize()
                        server_name = init_result.serverInfo.name if hasattr(init_result, "serverInfo") else "Connected Server"
                        tools = await load_mcp_tools(session)
                        
                        state.mcp_connections[url] = {"stack": stack, "tools": tools, "name": server_name}
                        connected = True
                        logger.info(f"✅ Neural link established: {url}")
                        break
                except Exception as e:
                    await stack.aclose()
                    logger.warning(f"Connection failed to {url}: {e}")
                    if attempt < max_retries - 1: await asyncio.sleep(llm_config.mcp_retry_delay)
            
            if not connected:
                new_failures.append(url)

        # 3. Aggregate Tools
        all_mcp_tools = []
        for url in target_urls:
            if url in state.mcp_connections:
                all_mcp_tools.extend(state.mcp_connections[url]["tools"])

        # 4. Create Agent
        agent: AgentLike
        if provider == "metaclaw":
            from metaclaw_client import MetaClawClient
            agent = MetaClawClient(llm_config, model_name=model_name)
            agent.mcp_tools = all_mcp_tools
            agent_expects_dict = False
        elif provider == "gemini":
            llm = ChatGoogleGenerativeAI(model=model_name, temperature=temperature, api_key=llm_config.gemini_api_key)
            agent = create_agent(llm, all_mcp_tools) if all_mcp_tools else llm
            agent_expects_dict = bool(all_mcp_tools)
        else: # groq
            groq_api_key = SecretStr(llm_config.groq_api_key) if llm_config.groq_api_key else None
            llm = cast(Any, ChatGroq)(model=model_name, temperature=temperature, api_key=groq_api_key)
            agent = create_agent(llm, all_mcp_tools) if all_mcp_tools else llm
            agent_expects_dict = bool(all_mcp_tools)

        # 5. Update state
        state.agent = agent
        state.current_provider = provider
        state.current_model = model_name
        state.current_mcp_urls = target_urls.copy()
        state.current_mcp_failures = new_failures
        state.current_mcp_tool_count = len(all_mcp_tools)
        state.current_agent_expects_dict = agent_expects_dict
        state.current_temperature = temperature
        
        return agent

# ------------------------------------------------------------------ #
# API Endpoints                                                        #
# ------------------------------------------------------------------ #

@app.get("/health")
async def health_check():
    try:
        requested_provider = llm_config.default_provider
        effective_provider = llm_config.get_effective_provider(requested_provider)
        configured_fallbacks = llm_config.get_configured_fallbacks()
        return {
            "status": "healthy",
            "service": "backend",
            "metaclawEnabled": llm_config.is_metaclaw_enabled(),
            "effectiveProvider": effective_provider,
            "configuredFallbacks": configured_fallbacks,
            "langgraphApiUrl": llm_config.langgraph_api_url,
            "mcpGenUrl": llm_config.mcp_gen_base_url,
        }
    except Exception as e:
        return {"status": "unhealthy", "service": "backend", "detail": str(e)}

@app.post("/mcp/metadata")
async def get_mcp_metadata(request: McpMetadataRequest):
    start_ms = monotonic_ms()
    original_url = request.url.strip() if request.url else ""
    if not original_url:
        raise HTTPException(status_code=400, detail="URL is required")
    event_context = {
        "traceId": request.traceId,
        "experimentId": request.experimentId,
        "sessionId": request.sessionId,
        "buildRequestId": request.buildRequestId,
        "serverId": request.serverId,
    }

    url = resolve_docker_url(original_url)
    if url in state.mcp_connections:
        conn = state.mcp_connections[url]
        tools_list = [
            {
                "name": getattr(tool_item, "name", "unknown"),
                "description": getattr(tool_item, "description", "") or "",
            }
            for tool_item in conn.get("tools", [])
        ]
        response_payload = {
            "name": conn.get("name") or "Connected Server",
            "url": original_url,
            "status": "connected",
            "tools": tools_list,
        }
        await record_research_event(
            service="chatbot-backend",
            stage="runtime",
            event_name="mcp_metadata_checked",
            status="success",
            duration_ms=duration_since_ms(start_ms),
            context=event_context,
            metrics={
                "mcp_initialize_success": True,
                "mcp_tool_count": len(tools_list),
                "cached_connection": True,
            },
            tags={"url_hash": content_hash(original_url)},
        )
        return response_payload

    stack = AsyncExitStack()
    try:
        streams = await asyncio.wait_for(
            stack.enter_async_context(streamable_http_client(url)),
            timeout=llm_config.mcp_connection_timeout,
        )
        read, write, _ = streams
        session = await stack.enter_async_context(ClientSession(read, write))
        init_result = await asyncio.wait_for(
            session.initialize(),
            timeout=llm_config.mcp_initialization_timeout,
        )
        server_name = init_result.serverInfo.name if hasattr(init_result, "serverInfo") else "Unknown Server"
        tools = await asyncio.wait_for(
            load_mcp_tools(session),
            timeout=llm_config.mcp_initialization_timeout,
        )
        tools_list = [
            {
                "name": getattr(tool_item, "name", "unknown"),
                "description": getattr(tool_item, "description", "") or "",
            }
            for tool_item in tools
        ]

        async with state.lock:
            old_conn = state.mcp_connections.get(url)
            if old_conn and old_conn.get("stack") is not stack:
                try:
                    await old_conn["stack"].aclose()
                except Exception as close_err:
                    logger.debug(f"Could not close replaced MCP connection for {url}: {close_err}")
            state.mcp_connections[url] = {"stack": stack, "tools": tools, "name": server_name}
            state.agent = None

        await record_research_event(
            service="chatbot-backend",
            stage="runtime",
            event_name="mcp_metadata_checked",
            status="success",
            duration_ms=duration_since_ms(start_ms),
            context=event_context,
            metrics={
                "mcp_initialize_success": True,
                "mcp_list_tools_latency_ms": duration_since_ms(start_ms),
                "mcp_tool_count": len(tools_list),
                "cached_connection": False,
            },
            tags={"url_hash": content_hash(original_url)},
        )
        return {"name": server_name, "url": original_url, "status": "connected", "tools": tools_list}
    except asyncio.TimeoutError as e:
        await stack.aclose()
        logger.error(f"Timed out fetching metadata for {url}: {e}", exc_info=True)
        await record_research_event(
            service="chatbot-backend",
            stage="runtime",
            event_name="mcp_metadata_checked",
            status="timeout",
            duration_ms=duration_since_ms(start_ms),
            error_code="timeout",
            context=event_context,
            metrics={"mcp_initialize_success": False},
            tags={"url_hash": content_hash(original_url)},
        )
        return {
            "name": original_url.split("/")[-1] or "External Server",
            "url": original_url,
            "status": "error",
            "errorCode": "timeout",
            "detail": "Timed out while connecting to or initializing the MCP server.",
        }
    except ValueError as e:
        await stack.aclose()
        logger.error(f"Unsupported MCP transport or invalid URL for {url}: {e}", exc_info=True)
        await record_research_event(
            service="chatbot-backend",
            stage="runtime",
            event_name="mcp_metadata_checked",
            status="failure",
            duration_ms=duration_since_ms(start_ms),
            error_code="unsupported_transport",
            context=event_context,
            metrics={"mcp_initialize_success": False},
            tags={"url_hash": content_hash(original_url)},
        )
        return {
            "name": original_url.split("/")[-1] or "External Server",
            "url": original_url,
            "status": "error",
            "errorCode": "unsupported_transport",
            "detail": str(e),
        }
    except Exception as e:
        await stack.aclose()
        error_text = str(e)
        error_code = "initialization_error" if "initialize" in error_text.lower() else "connect_error"
        logger.error(f"Failed to fetch metadata for {url}: {e}", exc_info=True)
        await record_research_event(
            service="chatbot-backend",
            stage="runtime",
            event_name="mcp_metadata_checked",
            status="failure",
            duration_ms=duration_since_ms(start_ms),
            error_code=error_code,
            context=event_context,
            metrics={"mcp_initialize_success": False},
            tags={"url_hash": content_hash(original_url)},
        )
        return {
            "name": original_url.split("/")[-1] or "External Server",
            "url": original_url,
            "status": "error",
            "errorCode": error_code,
            "detail": error_text,
        }

@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
    try:
        prov = "metaclaw" if llm_config.is_metaclaw_enabled() else (request.provider or "gemini")
        model = llm_config.metaclaw_model if prov == "metaclaw" else (request.model or "gemini-2.5-flash")
        request_context = normalize_request_context({
            "sessionId": request.sessionId,
            "buildRequestId": request.buildRequestId,
            "traceId": request.traceId,
            "experimentId": request.experimentId,
            "userId": request.userId,
            "workspaceId": request.workspaceId,
            "email": request.email,
            "memoryScope": request.memoryScope,
        })
        
        agent = await get_or_create_agent(prov, model, request.mcpServers, request.temperature or 0.0)

        if isinstance(agent, MetaClawClient):
            async def metaclaw_stream():
                async for sse in agent.chat(
                    messages=[{"role": m.role, "content": m.content} for m in request.messages],
                    temperature=request.temperature or 0.0,
                    langgraph_url=llm_config.langgraph_api_url,
                    mcp_urls=request.mcpServers,
                    request_context=request_context,
                ):
                    if "__use_standard_agent__" in sse:
                        # Handoff logic (simplified for brevity)
                        async for std_sse in _stream_standard_agent_response(
                            request,
                            [{"role": m.role, "content": m.content} for m in request.messages],
                            request.mcpServers,
                            request.temperature or 0.0,
                            state,
                            request_context=request_context,
                            provider=prov,
                            model=model,
                        ):
                            yield std_sse
                        return
                    yield sse
            return StreamingResponse(_instrument_chat_stream(metaclaw_stream(), request, request_context, prov, model, state), media_type="text/event-stream")

        standard_stream = _stream_standard_agent_response(
            request,
            [{"role": m.role, "content": m.content} for m in request.messages],
            request.mcpServers,
            request.temperature or 0.0,
            state,
            agent,
            request_context=request_context,
            provider=prov,
            model=model,
        )
        return StreamingResponse(_instrument_chat_stream(standard_stream, request, request_context, prov, model, state), media_type="text/event-stream")

    except Exception as e:
        logger.exception("Chat error")
        raise HTTPException(status_code=500, detail=str(e))


def _count_sse_payload(sse: str, counter: Counter) -> None:
    for line in sse.splitlines():
        if not line.startswith("data:"):
            continue
        raw = line[5:].strip()
        if not raw or raw == "[DONE]":
            continue
        try:
            payload = json.loads(raw)
            if isinstance(payload, dict):
                counter[str(payload.get("type") or "content")] += 1
            else:
                counter["content"] += 1
        except Exception:
            counter["content"] += 1


async def _instrument_chat_stream(
    stream: AsyncGenerator[str, None],
    request: ChatRequest,
    request_context: Dict[str, Any],
    provider: str,
    model: str,
    state: AgentState,
) -> AsyncGenerator[str, None]:
    start_ms = monotonic_ms()
    first_sse_ms: Optional[int] = None
    counts: Counter = Counter()
    status = "success"
    error_code: Optional[str] = None
    try:
        async for sse in stream:
            if first_sse_ms is None:
                first_sse_ms = duration_since_ms(start_ms)
            _count_sse_payload(sse, counts)
            yield sse
    except Exception as exc:
        status = "failure"
        error_code = exc.__class__.__name__
        raise
    finally:
        if counts.get("error", 0) > 0 and status == "success":
            status = "failure"
            error_code = "sse_error"
        await record_research_event(
            service="chatbot-backend",
            stage="chat",
            event_name="chat_stream_completed",
            status=status,
            duration_ms=duration_since_ms(start_ms),
            error_code=error_code,
            provider=provider,
            model=model,
            context=request_context,
            metrics={
                "time_to_first_sse_ms": first_sse_ms,
                "chat_total_latency_ms": duration_since_ms(start_ms),
                "stream_chunk_count": sum(counts.values()),
                "sse_type_counts": dict(counts),
                "message_count": len(request.messages),
                "last_user_message_length": len(request.messages[-1].content) if request.messages else 0,
                "last_user_message_hash": content_hash(request.messages[-1].content) if request.messages else "",
                "mcp_url_count": len(request.mcpServers or []),
                "mcp_tool_count": state.current_mcp_tool_count,
                "mcp_connection_failure_count": len(state.current_mcp_failures),
            },
            tags={
                "route": provider,
                "temperature": request.temperature,
            },
        )

async def _stream_standard_agent_response(
    request: ChatRequest,
    messages: List[Dict[str, Any]],
    mcp_urls: Optional[List[str]],
    temp: float,
    state: AgentState,
    agent: Optional[StandardAgent] = None,
    request_context: Optional[Dict[str, Any]] = None,
    provider: Optional[str] = None,
    model: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    if agent is None:
        provider = request.provider or llm_config.default_provider
        default_model = llm_config.gemini_model if provider == "gemini" else llm_config.groq_model
        model = request.model or default_model
        created_agent = await get_or_create_agent(provider, model, mcp_urls, temp)
        if isinstance(created_agent, MetaClawClient):
            yield sse_error("MetaClaw cannot be used in the standard agent stream.")
            yield sse_done()
            return
        agent = created_agent
    
    has_tools = state.current_mcp_tool_count > 0
    agent_expects_dict = state.current_agent_expects_dict
    
    failures = state.current_mcp_failures if mcp_urls else []
    if failures:
        yield sse_status(f"> [WARNING]: Failed to connect to MCP servers: {', '.join(failures)}. Proceeding without tool support.\n\n")

    prompt = get_system_prompt(has_tools, False, mcp_urls or [], len(messages) - 1)
    langchain_msgs: List[Any] = [SystemMessage(content=prompt)]
    for m in messages:
        content = m.get("content", "")
        langchain_msgs.append(HumanMessage(content=content) if m.get("role") == "user" else AIMessage(content=content))

    stream_start_ms = monotonic_ms()
    tracker = McpToolInvocationTracker(active_mcp_tool_names(state, mcp_urls))

    try:
        full_content = ""
        agent_obj = cast(Any, agent)
        stream_input = {"messages": langchain_msgs} if agent_expects_dict else langchain_msgs
        async for chunk in agent_obj.astream(stream_input):
            tracker.observe(chunk)
            content_chunk: Any = ""
            
            if isinstance(chunk, dict):
                for key in ["messages", "agent", "model"]:
                    val = chunk.get(key)
                    if val:
                        if isinstance(val, dict) and "messages" in val:
                            msg = val["messages"][-1]
                        elif isinstance(val, list) and len(val) > 0:
                            msg = val[-1]
                        else:
                            msg = val
                        
                        msg_content = getattr(msg, "content", None)
                        if msg_content is not None:
                            content_chunk = msg_content
                            break

            if not content_chunk:
                chunk_content = getattr(chunk, "content", None)
                if chunk_content is not None:
                    content_chunk = chunk_content
                elif isinstance(chunk, str):
                    content_chunk = chunk

            if isinstance(content_chunk, list):
                parts = []
                for part in content_chunk:
                    if isinstance(part, dict):
                        parts.append(part.get("text", ""))
                    else:
                        parts.append(str(part))
                content_chunk = "".join(parts)

            if content_chunk:
                safe_chunk = str(content_chunk)
                yield sse_content(safe_chunk)
                full_content += safe_chunk

        logger.info(f"Stream completed. Total length: {len(full_content)} chars")
    except Exception as e:
        yield sse_error(str(e))
    finally:
        if has_tools and (mcp_urls or []):
            await record_mcp_tool_invocation_event(
                tracker,
                request_context=request_context,
                mcp_urls=mcp_urls or [],
                available_tool_count=state.current_mcp_tool_count,
                provider=provider or request.provider,
                model=model or request.model,
                duration_ms=duration_since_ms(stream_start_ms),
                response_text=locals().get("full_content", ""),
            )
        yield sse_done()

# ------------------------------------------------------------------ #
# MCP Generator Proxy Endpoints                                        #
# ------------------------------------------------------------------ #

@app.get("/mcp/servers")
async def list_mcp_servers():
    """Proxy mcp-gen server listing through FastAPI to avoid browser CORS/service-name assumptions."""
    try:
        response = await asyncio.to_thread(
            requests.get,
            f"{llm_config.mcp_gen_base_url}/api/mcp/servers",
            params={"statuses": ",".join(ACTIVE_GENERATED_MCP_STATUSES)},
            timeout=llm_config.default_timeout_ms / 1000,
        )
        response.raise_for_status()
        return filter_active_mcp_server_payload(response.json())
    except requests.RequestException as e:
        logger.error(f"Failed to proxy mcp-gen server list: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"mcp-gen server list unavailable: {e}")


class McpFeedbackRequest(BaseModel):
    type: str
    userId: Optional[str] = None
    comment: Optional[str] = None
    traceId: Optional[str] = None
    experimentId: Optional[str] = None
    sessionId: Optional[str] = None
    buildRequestId: Optional[str] = None


@app.post("/mcp/{server_id}/feedback")
async def submit_mcp_feedback(server_id: str, request: McpFeedbackRequest):
    """Proxy mcp-gen feedback submission through FastAPI."""
    start_ms = monotonic_ms()
    if request.type not in {"like", "dislike"}:
        raise HTTPException(status_code=400, detail="Feedback type must be 'like' or 'dislike'.")

    try:
        response = await asyncio.to_thread(
            requests.post,
            f"{llm_config.mcp_gen_base_url}/api/mcp/{server_id}/feedback",
            json=request.dict(exclude_none=True),
            timeout=llm_config.default_timeout_ms / 1000,
        )
        response.raise_for_status()
        payload = response.json()
        await record_research_event(
            service="chatbot-backend",
            stage="feedback",
            event_name="mcp_feedback_submitted",
            status="success",
            duration_ms=duration_since_ms(start_ms),
            context={
                "traceId": request.traceId,
                "experimentId": request.experimentId,
                "sessionId": request.sessionId,
                "buildRequestId": request.buildRequestId,
                "serverId": server_id,
            },
            metrics={
                "feedback_type": request.type,
                "feedback_has_comment": bool(request.comment),
                "feedback_total": payload.get("totalFeedbacks"),
            },
        )
        return payload
    except requests.RequestException as e:
        logger.error(f"Failed to proxy mcp-gen feedback for {server_id}: {e}", exc_info=True)
        await record_research_event(
            service="chatbot-backend",
            stage="feedback",
            event_name="mcp_feedback_submitted",
            status="failure",
            duration_ms=duration_since_ms(start_ms),
            error_code=e.__class__.__name__,
            context={
                "traceId": request.traceId,
                "experimentId": request.experimentId,
                "sessionId": request.sessionId,
                "buildRequestId": request.buildRequestId,
                "serverId": server_id,
            },
            metrics={"feedback_type": request.type},
        )
        raise HTTPException(status_code=502, detail=f"mcp-gen feedback unavailable: {e}")


@app.get("/mcp/{server_id}/claude-config")
async def get_mcp_claude_config(server_id: str):
    """Proxy mcp-gen's tokenized Claude config for generated-server activation."""
    try:
        response = await asyncio.to_thread(
            requests.get,
            f"{llm_config.mcp_gen_base_url}/api/mcp/{server_id}/claude-config",
            timeout=llm_config.default_timeout_ms / 1000,
        )
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        logger.error(f"Failed to proxy mcp-gen Claude config for {server_id}: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"mcp-gen Claude config unavailable: {e}")


# ------------------------------------------------------------------ #
# Gemini Executor for MCP Build                                        #
# ------------------------------------------------------------------ #

async def _execute_build_with_gemini(
    requirements: str,
    temperature: float,
    request_context: Optional[Dict[str, Any]] = None,
) -> AsyncGenerator[str, None]:
    """
    Gemini executor: receives requirements from MetaClaw proxy,
    calls create_mcp_server tool, then streams the LangGraph build.
    Falls back to direct LangGraph trigger if Gemini skips the tool call.
    """
    gemini_system = """You are an autonomous MCP server builder assistant.
The system has already determined that an MCP server should be built based on the user's request.
Your job is to execute this decision by calling the create_mcp_server tool with the provided requirements.

DO NOT ask for permission or confirmation — just execute the build immediately.
DO NOT respond with text explanations — just trigger the tool and let the system handle progress reporting."""

    gemini_msgs = [
        SystemMessage(content=gemini_system),
        HumanMessage(content=f"Build an MCP server with the following requirements:\n\n{requirements}"),
    ]

    try:
        api_key = llm_config.gemini_api_key
        if not api_key:
            raise Exception("GEMINI_API_KEY not found.")

        gemini_llm = ChatGoogleGenerativeAI(
            model=llm_config.gemini_model,
            temperature=temperature,
            max_retries=2,
            api_key=api_key,
        ).bind_tools([create_mcp_server_tool()])

        gemini_response = await gemini_llm.ainvoke(gemini_msgs)
        detected_requirements = extract_create_mcp_tool_call(gemini_response)

        build_requirements = detected_requirements if detected_requirements is not None else requirements
        logger.info(f"[Gemini Executor] Triggering LangGraph build: {build_requirements[:100]}...")

        async for sse in stream_langgraph_build(build_requirements, llm_config.langgraph_api_url, request_context):
            yield sse
    except Exception as e:
        err_msg = f"\n\n> [ERROR]: Gemini executor failed: {str(e)}\n\n"
        yield sse_content(err_msg)


def get_system_prompt(has_mcp_tools, has_create_mcp_server_tool, mcp_urls, last_turn_index):
    base = f"You are a helpful AI assistant. [Turn {last_turn_index}]. Respond in the same language as the user."
    if has_mcp_tools:
        return f"{base}\nMCP Tools are ENABLED ({', '.join(mcp_urls)}). Use them if needed."
    return f"{base}\nMCP Tools are DISABLED. Answer from internal knowledge only."
