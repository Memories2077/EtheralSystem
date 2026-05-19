"""
Shared utilities for backend modules.

This module contains common functions used across main.py and metaclaw_client.py
to avoid code duplication and ensure consistent behavior.
"""

import json
import logging
import os
import asyncio
from typing import Any, Dict, Optional, AsyncGenerator, Callable
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langchain.tools import tool
from research_metrics import duration_since_ms, monotonic_ms, new_trace_id, record_research_event

logger = logging.getLogger(__name__)

# Constants
MCP_SERVER_TOOL_NAME = "create_mcp_server"
MCP_SERVER_TOOL_DESC = "Build a custom MCP server with specific tools and resources"
USE_MCP_TOOLS_NAME = "use_mcp_tools"
USE_MCP_TOOLS_DESC = "Signals that the user wants to use the connected MCP servers/tools"
DOCKER_HOST_REPLACEMENTS = {
    "host.docker.internal": "localhost",
    "172.17.0.1": "localhost",
}
DEFAULT_MCP_TIMEOUT = 10.0
DEFAULT_USER_ID = "browser_user"
DEFAULT_WORKSPACE_ID = "default_workspace"

# Tool singleton cache
_create_mcp_server_tool_instance = None
_use_mcp_tools_tool_instance = None


# ==================== Tool Factories ====================

def create_mcp_server_tool() -> Callable:
    """
    Get or create the create_mcp_server tool (singleton pattern).
    Returns a decorated LangChain tool function.
    """
    global _create_mcp_server_tool_instance
    if _create_mcp_server_tool_instance is None:
        @tool
        async def create_mcp_server(requirements: str) -> str:
            """
            Builds a custom MCP server. Call this tool IMMEDIATELY as soon as the user provides
            technical requirements, API documentation, or a guide that implies they want a tool
            or server built.
            Do NOT ask for permission or confirmation first—assume the user wants you to generate
            the server based on their input.
            Args:
                requirements: Detailed description of the MCP server functionality and tools needed.
            """
            return f"GENERATE_MCP_SERVER_TRIGGERED:{requirements}"
        _create_mcp_server_tool_instance = create_mcp_server
    return _create_mcp_server_tool_instance


def create_use_mcp_tools_tool() -> Callable:
    """
    Get or create the use_mcp_tools tool (singleton pattern).
    Returns a decorated LangChain tool function.
    """
    global _use_mcp_tools_tool_instance
    if _use_mcp_tools_tool_instance is None:
        @tool
        async def use_mcp_tools() -> str:
            """
            Signals that the user wants to use the connected MCP servers/tools.
            Call this when the user asks to utilize existing MCP tools or sessions.
            """
            return "USE_MCP_TOOLS_TRIGGERED"
        _use_mcp_tools_tool_instance = use_mcp_tools
    return _use_mcp_tools_tool_instance


# ==================== Tool Extraction ====================

def extract_create_mcp_tool_call(response: Any) -> Optional[str]:
    """
    Extract create_mcp_server tool call from MetaClaw response.
    Returns requirements string if found, None otherwise.
    """
    tool_calls = []

    if hasattr(response, "tool_calls") and response.tool_calls:
        tool_calls = response.tool_calls
    elif hasattr(response, "additional_kwargs"):
        raw = response.additional_kwargs.get("tool_calls", [])
        for tc in raw:
            func = tc.get("function", {}) if isinstance(tc, dict) else {}
            name = func.get("name", "")
            if name == "create_mcp_server":
                args_raw = func.get("arguments", "{}")
                try:
                    args = json.loads(args_raw) if isinstance(args_raw, str) else args_raw
                except Exception:
                    args = {}
                return args.get("requirements", "") if isinstance(args, dict) else ""
        return None

    for tc in tool_calls:
        tc_name = tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", "")
        if tc_name == "create_mcp_server":
            tc_args = tc.get("args") if isinstance(tc, dict) else getattr(tc, "args", {})
            if isinstance(tc_args, str):
                try:
                    tc_args = json.loads(tc_args)
                except Exception:
                    tc_args = {}
            return tc_args.get("requirements", "") if isinstance(tc_args, dict) else ""

    return None


def extract_use_mcp_tool_call(response: Any) -> bool:
    """Check if response contains a use_mcp_tools tool call."""
    tool_calls = []
    if hasattr(response, "tool_calls") and response.tool_calls:
        tool_calls = response.tool_calls
    elif hasattr(response, "additional_kwargs"):
        raw = response.additional_kwargs.get("tool_calls", [])
        for tc in raw:
            func = tc.get("function", {}) if isinstance(tc, dict) else {}
            name = func.get("name", "")
            if name == "use_mcp_tools":
                return True
        return False
    for tc in tool_calls:
        tc_name = tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", "")
        if tc_name == "use_mcp_tools":
            return True
    return False


# ==================== URL Normalization ====================

def normalize_docker_urls_in_dict(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize Docker-specific hostnames to localhost for local development.
    Returns a new dict without mutating the input.
    """
    result: Dict[str, Any] = {}
    for key, value in data.items():
        if isinstance(value, str):
            new_value = value
            for docker_host, local_host in DOCKER_HOST_REPLACEMENTS.items():
                if docker_host in new_value:
                    new_value = new_value.replace(docker_host, local_host)
                    logger.debug(f"Normalized {key}: {value} -> {new_value}")
            result[key] = new_value
        elif isinstance(value, dict):
            result[key] = normalize_docker_urls_in_dict(value)
        elif isinstance(value, list):
            normalized_list = []
            for item in value:
                if isinstance(item, str):
                    new_item = item
                    for docker_host, local_host in DOCKER_HOST_REPLACEMENTS.items():
                        if docker_host in new_item:
                            new_item = new_item.replace(docker_host, local_host)
                    normalized_list.append(new_item)
                elif isinstance(item, dict):
                    normalized_list.append(normalize_docker_urls_in_dict(item))
                else:
                    normalized_list.append(item)
            result[key] = normalized_list
        else:
            result[key] = value
    return result


# ==================== Request Context ====================

def _normalize_bool_string(value: Any, default: str = "") -> str:
    if value is None or value == "":
        return default
    if isinstance(value, bool):
        return "true" if value else "false"
    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return "true"
    if normalized in {"0", "false", "no", "off"}:
        return "false"
    return default


def _normalize_skill_selection_variant(value: Any, dynamic_skill_selection: str) -> str:
    if dynamic_skill_selection == "true":
        return "dynamic"
    if dynamic_skill_selection == "false":
        return "static"
    normalized = str(value or "").strip().lower()
    if normalized in {"dynamic", "hybrid"}:
        return "dynamic"
    if normalized in {"static", "control"}:
        return "static"
    return "dynamic" if dynamic_skill_selection == "true" else "static"


def normalize_request_context(context: Optional[Dict[str, Any]] = None) -> Dict[str, str]:
    """Return a stable cross-service context for MetaClaw/LangGraph/mcp-gen."""
    raw = context or {}

    def clean(key: str, default: str = "") -> str:
        value = raw.get(key, default)
        return str(value or default).strip()

    session_id = clean("sessionId") or clean("session_id") or "chat-session"
    build_request_id = clean("buildRequestId") or clean("build_request_id")
    trace_id = clean("traceId") or clean("trace_id") or build_request_id or new_trace_id()
    experiment_id = clean("experimentId") or clean("experiment_id") or os.getenv("RESEARCH_EXPERIMENT_ID", "local-dev")
    user_id = clean("userId") or clean("user_id") or DEFAULT_USER_ID
    workspace_id = clean("workspaceId") or clean("workspace_id") or DEFAULT_WORKSPACE_ID
    email = clean("email") or f"{user_id}@local"
    memory_scope = clean("memoryScope") or clean("memory_scope") or f"user:{user_id}|workspace:{workspace_id}"
    rag_enabled = _normalize_bool_string(
        raw.get("ragEnabled", raw.get("rag_enabled")),
        _normalize_bool_string(os.getenv("RAG_ENABLED"), "true"),
    )
    dynamic_skill_selection = _normalize_bool_string(
        raw.get("dynamicSkillSelection", raw.get("dynamic_skill_selection")),
        _normalize_bool_string(os.getenv("DYNAMIC_SKILL_SELECTION"), "false"),
    )
    skill_selection_variant = _normalize_skill_selection_variant(
        clean("skillSelectionVariant")
        or clean("skill_selection_variant")
        or os.getenv("SKILL_SELECTION_VARIANT", ""),
        dynamic_skill_selection,
    )
    variant_id = (
        clean("variantId")
        or clean("variant_id")
        or f"{skill_selection_variant}-rag-{'on' if rag_enabled == 'true' else 'off'}"
    )

    return {
        "traceId": trace_id,
        "experimentId": experiment_id,
        "sessionId": session_id,
        "buildRequestId": build_request_id,
        "userId": user_id,
        "workspaceId": workspace_id,
        "email": email,
        "memoryScope": memory_scope,
        "ragEnabled": rag_enabled,
        "dynamicSkillSelection": dynamic_skill_selection,
        "skillSelectionVariant": skill_selection_variant,
        "variantId": variant_id,
    }


def build_metaclaw_headers(
    context: Optional[Dict[str, Any]] = None,
    *,
    turn_type: str,
    session_done: bool = False,
) -> Dict[str, str]:
    """Build MetaClaw memory/session headers from normalized request context."""
    normalized = normalize_request_context(context)
    headers = {
        "X-Session-Id": normalized["sessionId"],
        "X-Turn-Type": turn_type,
        "X-Session-Done": "true" if session_done else "false",
        "X-Memory-Scope": normalized["memoryScope"],
        "X-User-Id": normalized["userId"],
        "X-Workspace-Id": normalized["workspaceId"],
        "X-Trace-Id": normalized["traceId"],
        "X-Experiment-Id": normalized["experimentId"],
    }
    return {key: value for key, value in headers.items() if value}


def _extract_json_payload(text: str) -> Optional[Dict[str, Any]]:
    """Extract a JSON object from a streamed LangGraph message."""
    if not text:
        return None

    stripped = text.strip()
    candidates = []

    if "```json" in stripped:
        try:
            candidates.append(stripped.split("```json", 1)[1].split("```", 1)[0].strip())
        except Exception:
            pass

    if "```" in stripped:
        try:
            candidates.append(stripped.split("```", 1)[1].split("```", 1)[0].strip())
        except Exception:
            pass

    start = stripped.find("{")
    end = stripped.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidates.append(stripped[start : end + 1])

    candidates.append(stripped)
    for candidate in candidates:
        try:
            payload = json.loads(candidate)
            if isinstance(payload, dict):
                return payload
        except Exception:
            continue
    return None


def _extract_mcp_server_url(payload: Dict[str, Any]) -> str:
    """Pull the tokenized streamable MCP URL from a Claude/mcp-remote config."""
    config = payload.get("config") or payload.get("claudeConfig") or {}
    if not isinstance(config, dict):
        return ""

    servers = config.get("mcpServers", {})
    if not isinstance(servers, dict):
        return ""

    for server_config in servers.values():
        if not isinstance(server_config, dict):
            continue
        args = server_config.get("args", [])
        if not isinstance(args, list):
            continue
        for arg in args:
            if isinstance(arg, str) and (arg.startswith("http://") or arg.startswith("https://")):
                return arg
    return ""


def build_mcp_complete_payload(result: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Create the structured SSE completion event expected by the frontend."""
    normalized_result = normalize_docker_urls_in_dict(result or {})
    server_id = str(normalized_result.get("serverId") or "").strip()
    status = str(normalized_result.get("status") or "unknown").strip()
    mcp_server_url = _extract_mcp_server_url(normalized_result)
    payload: Dict[str, Any] = {
        "type": "mcp_build_complete",
        "status": status,
        "message": (
            f"MCP Server {server_id} is {status}."
            if server_id
            else "MCP server build stream completed."
        ),
    }
    if server_id:
        payload["serverId"] = server_id
    if normalized_result.get("publicUrl"):
        payload["publicUrl"] = normalized_result["publicUrl"]
    if mcp_server_url:
        payload["mcpServerUrl"] = mcp_server_url
    if normalized_result.get("config"):
        payload["config"] = normalized_result["config"]
    if normalized_result.get("claudeConfig"):
        payload["claudeConfig"] = normalized_result["claudeConfig"]
    if normalized_result.get("buildRequestId"):
        payload["buildRequestId"] = normalized_result["buildRequestId"]
    if normalized_result.get("postCreation"):
        payload["postCreation"] = normalized_result["postCreation"]
    return payload


# ==================== LangGraph Streaming ====================

async def stream_langgraph_build(
    requirements: str,
    langgraph_url: str,
    request_context: Optional[Dict[str, Any]] = None,
) -> AsyncGenerator[str, None]:
    """
    Stream build progress from LangGraph service using the LangGraph SDK.
    Yields SSE data chunks as they arrive.
    """
    from langgraph_sdk import get_client

    # Normalize URL for Docker
    normalized_url = langgraph_url
    if "localhost" in normalized_url and os.path.exists("/.dockerenv"):
        normalized_url = normalized_url.replace("localhost", "host.docker.internal")

    start_ms = monotonic_ms()
    stream_counts = {"partial": 0, "complete": 0, "error": 0}
    yield f"data: {json.dumps({'content': chr(10) + chr(10) + '> [SYSTEM]: Building MCP Server...' + chr(10) + chr(10)})}\n\n"

    lg_client = None
    request_context = normalize_request_context(request_context)
    try:
        lg_client = get_client(url=normalized_url)
        logger.info(f"Connected to LangGraph service at {normalized_url}")
        thread = await lg_client.threads.create()

        partial_content_lengths = {}
        streamed_ids = set()
        last_msg_id = ""
        latest_build_result: Optional[Dict[str, Any]] = None

        async for lg_chunk in lg_client.runs.stream(
            thread["thread_id"],
            "agent",
            input={
                "messages": [{"role": "user", "content": requirements}],
                "raw_api_doc": requirements,
                "session_id": request_context["sessionId"],
                "build_request_id": request_context["buildRequestId"],
                "trace_id": request_context["traceId"],
                "experiment_id": request_context["experimentId"],
                "user_id": request_context["userId"],
                "workspace_id": request_context["workspaceId"],
                "email": request_context["email"],
                "memory_scope": request_context["memoryScope"],
                "rag_enabled": request_context["ragEnabled"],
                "dynamic_skill_selection": request_context["dynamicSkillSelection"],
                "skill_selection_variant": request_context["skillSelectionVariant"],
                "variant_id": request_context["variantId"],
            },
            stream_mode="messages"
        ):
            event_type = lg_chunk.event
            data = lg_chunk.data

            if event_type == "error":
                stream_counts["error"] += 1
                error_content = f"\n\n❌ LANGGRAPH ERROR:\n{json.dumps(data, indent=2)}\n\n"
                yield f"data: {json.dumps({'content': error_content})}\n\n"
                continue

            if event_type == "metadata":
                continue

            if event_type == "messages/partial" and isinstance(data, list):
                stream_counts["partial"] += 1
                for msg_chunk in data:
                    msg_id = msg_chunk.get("id")
                    content = msg_chunk.get("content", "")
                    if msg_id and isinstance(content, str):
                        if msg_id != last_msg_id:
                            if last_msg_id:
                                yield f"data: {json.dumps({'content': chr(10)})}\n\n"
                            last_msg_id = msg_id
                            partial_content_lengths[msg_id] = 0

                        streamed_ids.add(msg_id)
                        last_len = partial_content_lengths.get(msg_id, 0)
                        if len(content) > last_len:
                            new_part = content[last_len:]
                            yield f"data: {json.dumps({'content': new_part})}\n\n"
                            partial_content_lengths[msg_id] = len(content)

            elif event_type == "messages/complete" and isinstance(data, list):
                stream_counts["complete"] += 1
                for msg_chunk in data:
                    msg_id = msg_chunk.get("id")
                    content = msg_chunk.get("content", "")
                    if msg_id and isinstance(content, str):
                        parsed_result = _extract_json_payload(content)
                        if parsed_result and parsed_result.get("serverId"):
                            latest_build_result = parsed_result
                        if msg_id in streamed_ids:
                            yield f"data: {json.dumps({'content': chr(10)})}\n\n"
                        else:
                            if content:
                                yield f"data: {json.dumps({'content': f'{chr(10)}{content}{chr(10)}'})}\n\n"
                        partial_content_lengths.pop(msg_id, None)
                        streamed_ids.discard(msg_id)
                        last_msg_id = ""

        logger.info("--- LangGraph build completed ---")
        yield f"data: {json.dumps(build_mcp_complete_payload(latest_build_result))}\n\n"
        event_context = dict(request_context)
        if latest_build_result and latest_build_result.get("serverId"):
            event_context["serverId"] = latest_build_result["serverId"]
        await record_research_event(
            service="chatbot-backend",
            stage="langgraph_stream",
            event_name="langgraph_stream_completed",
            status="success" if stream_counts["error"] == 0 else "failure",
            duration_ms=duration_since_ms(start_ms),
            context=event_context,
            metrics={
                "langgraph_stream_duration_ms": duration_since_ms(start_ms),
                "langgraph_partial_event_count": stream_counts["partial"],
                "langgraph_complete_event_count": stream_counts["complete"],
                "langgraph_error_event_count": stream_counts["error"],
                "server_created": bool(latest_build_result and latest_build_result.get("serverId")),
            },
        )
        if latest_build_result and latest_build_result.get("serverId"):
            api_doc_length = len(requirements or "")
            rag_enabled = (
                request_context.get("ragEnabled")
                or os.getenv("RAG_ENABLED", "true")
            ).lower() not in {"0", "false", "no", "off"}
            await record_research_event(
                service="chatbot-backend",
                stage="orchestration",
                event_name="supervisor_routed",
                status="success",
                duration_ms=duration_since_ms(start_ms),
                context=event_context,
                metrics={
                    "retry_count": 0,
                    "history_count": 0,
                    "tool_call_count": 1,
                    "raw_api_doc_length": api_doc_length,
                },
                tags={"source": "backend_langgraph_fallback", "next_agent": "tools"},
            )
            await record_research_event(
                service="chatbot-backend",
                stage="rag",
                event_name="examiner_completed",
                status="success" if rag_enabled else "skipped",
                duration_ms=duration_since_ms(start_ms),
                context=event_context,
                metrics={
                    "api_doc_length": api_doc_length,
                    "rag_enabled": rag_enabled,
                    "rag_returned_count": 0,
                    "rag_context_item_count": 0,
                    "rag_context_chars": 0,
                },
                tags={
                    "source": "backend_langgraph_fallback",
                    **({} if rag_enabled else {"rag_disabled_reason": "RAG_ENABLED=false"}),
                },
            )
            await record_research_event(
                service="chatbot-backend",
                stage="generation",
                event_name="generator_completed",
                status="success",
                duration_ms=duration_since_ms(start_ms),
                context=event_context,
                metrics={
                    "api_doc_length": api_doc_length,
                    "rag_context_item_count": 0,
                    "tool_call_count": 1,
                    "server_created": True,
                },
                tags={"source": "backend_langgraph_fallback"},
            )

    except Exception as lg_err:
        logger.exception("LangGraph build error")
        await record_research_event(
            service="chatbot-backend",
            stage="langgraph_stream",
            event_name="langgraph_stream_completed",
            status="failure",
            duration_ms=duration_since_ms(start_ms),
            error_code=lg_err.__class__.__name__,
            context=request_context,
            metrics={
                "langgraph_stream_duration_ms": duration_since_ms(start_ms),
                "langgraph_partial_event_count": stream_counts["partial"],
                "langgraph_complete_event_count": stream_counts["complete"],
                "langgraph_error_event_count": stream_counts["error"] + 1,
            },
        )
        err_msg = f"\n\n> [ERROR]: Cannot connect to LangGraph service: {str(lg_err)}\n\n"
        yield f"data: {json.dumps({'content': err_msg})}\n\n"
    finally:
        # LangGraph client does not require explicit cleanup, but if it has aclose(), call it
        if lg_client is not None:
            try:
                if hasattr(lg_client, "aclose") and callable(getattr(lg_client, "aclose")):
                    await lg_client.aclose()
                    logger.debug("LangGraph client closed via aclose()")
                elif hasattr(lg_client, "close") and callable(getattr(lg_client, "close")):
                    # If close is async, we need to check if it's a coroutine
                    close_method = getattr(lg_client, "close")
                    if asyncio.iscoroutinefunction(close_method):
                        await close_method()
                    else:
                        close_method()
                    logger.debug("LangGraph client closed via close()")
                else:
                    logger.debug("LangGraph client has no close/aclose method, skipping cleanup")
            except Exception as close_err:
                logger.warning(f"Error closing LangGraph client: {close_err}")


def build_langgraph_sse_payload(requirements: str) -> str:
    """Build the SSE payload for initiating a LangGraph build."""
    payload = {
        "event": "build",
        "data": {
            "requirements": requirements,
            "project_type": "mcp-server",
        },
    }
    return f"data: {json.dumps(payload)}\n\n"
