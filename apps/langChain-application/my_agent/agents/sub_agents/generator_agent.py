from langchain_core.messages import HumanMessage, AIMessage, BaseMessage

from typing import Dict, Any, Optional, List, Tuple
from my_agent.tools.generator_tools import create_MCPServer, test_mcp_server
from my_agent.utils.vector_db import save_mcp_artifacts

from my_agent.config import load_prompt, AGENT_CONFIG
from my_agent.utils.state import AgentState, get_message_content # Import from centralized location

import json
import httpx
import re

from my_agent.utils.mcp_client import (
    MCPResponseValidationError,
    MCPTimeoutError,
    MCPUnavailableError,
    fetch_mcp_files,
)

custom_client = httpx.Client(
    timeout=httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=10.0),
    limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
)


def parse_rag_context(enriched_context_json: str) -> List[Any]:
    """Parse structured RAG context from state, falling back to an empty list."""
    if not enriched_context_json:
        return []
    try:
        parsed = json.loads(enriched_context_json)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


async def generator_agent_node(state: AgentState) -> AgentState:
    """Generator agent that handles content generation tasks"""
    messages = state["messages"]
    
    # Initialize LLM for this agent
    config = AGENT_CONFIG["generator_agent"]
    system_prompt = load_prompt(config["prompt_file"])

    # Initialize LLM via factory
    from my_agent.utils.llm_factory import get_llm
    llm = get_llm(temperature=config["temperature"])


    llm_with_tools = llm.bind_tools([create_MCPServer, test_mcp_server])
    
    # 1. State-backed Data Extraction (Primary Source)
    raw_api_doc = state.get("raw_api_doc", "")
    enriched_context_json = state.get("enriched_context", "[]")
    rag_context_data = parse_rag_context(enriched_context_json)
    
    # 2. Find information from messages (Fallback/Source for user_id, email)
    task_content = ""
    for msg in reversed(messages):
        content = get_message_content(msg)
        if "DELEGATE_TO_GENERATOR:" in content:
            task_content = content.replace("DELEGATE_TO_GENERATOR:", "").strip()
            # Strip the ORIGINAL_PROMPT header block if present (examiner adds it,
            # but we get the real doc from raw_api_doc in state - avoid double parsing)
            if task_content.startswith("ORIGINAL_PROMPT:"):
                # Jump past the ORIGINAL_PROMPT section, start from API_DOCUMENTATION
                api_doc_idx = task_content.find("API_DOCUMENTATION:")
                if api_doc_idx != -1:
                    task_content = task_content[api_doc_idx:]
            break
    
    if not task_content and not raw_api_doc:
        print("[Generator] ⚠️ WARNING: No task content or raw_api_doc found!")
        task_content = "Generate content based on the user's request"
    
    def parse_task_metadata(content: str) -> Tuple[str, str]:
        """Parse task metadata (userId, email) from message content"""
        user_id = "default_user"
        email = "user@example.com"
        
        # Extract User info
        uid_match = re.search(r"USER_ID:\s*([^\n\r]*)", content)
        if uid_match:
            user_id = uid_match.group(1).strip()
            
        email_match = re.search(r"EMAIL:\s*([^\n\r]*)", content)
        if email_match:
            email = email_match.group(1).strip()
            
        return user_id, email
    
    # Get metadata from task_content (fallback mechanism)
    msg_user_id, msg_email = parse_task_metadata(task_content)
    
    # Final data consolidation
    # use raw_api_doc if available, otherwise try to extract from msg content
    if not raw_api_doc:
        # Robust extraction from task_content if state was empty
        ad_match = re.search(r"API_DOCUMENTATION:\s*(.*?)(?=\s*\nENRICHED_CONTEXT|\s*\nUSER_ID:|\s*\Z)", task_content, re.DOTALL)
        api_doc = ad_match.group(1).strip() if ad_match else task_content
    else:
        api_doc = raw_api_doc

    user_id = msg_user_id
    email = msg_email
    
    print(f"[Generator] 🛠️ Ready with API doc ({len(api_doc)} chars) and RAG context ({len(enriched_context_json)} chars).")
    
    # CRITICAL: Pre-construct the query with FULL API documentation
    # This ensures the complete API doc (no truncation) is passed to create_MCPServer
    constructed_query = [api_doc, user_id, email]  # Contains FULL api_doc
    
    # Create instruction with API documentation preview for the LLM
    # Show enough context so LLM understands it needs to call the tool
    api_preview = api_doc[:500] + "..." if len(api_doc) > 500 else api_doc
    
    enhanced_task = f"""You need to create an MCP Server using the following information:

    API DOCUMENTATION PREVIEW:
    ```
    {api_preview}
    ```

    FULL DETAILS:
    - API Documentation: {len(api_doc)} characters (complete documentation ready)
    - User ID: {user_id}
    - Email: {email}

    INSTRUCTIONS:
    Call the create_MCPServer tool now with the query and rag_context parameters.
    The full API documentation and structured RAG context have been prepared for you.
    Just invoke: create_MCPServer(query=[api_doc, userId, email], rag_context=rag_context)"""

    combined_prompt = f"""[SYSTEM INSTRUCTION]
        {system_prompt}

        [TECHNICAL CONTEXT (RAG)]
        {enriched_context_json}

        [USER REQUEST]
        {enhanced_task}"""
    
    generator_messages = [
        HumanMessage(content=combined_prompt)
    ]
    
    response = await llm_with_tools.ainvoke(generator_messages)
    tool_calls = list(getattr(response, "tool_calls", None) or [])
    if not tool_calls:
        print("[Generator] ⚠️ LLM did not call create_MCPServer. Falling back to direct tool invocation.")
        tool_calls = [{
            "id": "fallback_create_mcp_server",
            "name": "create_MCPServer",
            "args": {},
        }]
    
    # If tool calls exist, execute them
    if tool_calls:
        tool_results: List[Tuple[str, str]] = []
        has_error = False
        error_message = ""
        
        for tool_call in tool_calls:
            tool_call_id = tool_call.get("id", f"tool_call_{len(tool_results)}")
            tool_name = tool_call.get("name", "")
            if tool_name == "create_MCPServer":
                # CRITICAL: Use our pre-constructed query with FULL API doc
                query = constructed_query
                
                print(f"[Generator] Creating MCP Server with FULL API documentation...")
                
                # Properly await the async tool
                result = await create_MCPServer.ainvoke({
                    "query": query,
                    "rag_context": rag_context_data,
                })
                result_str = str(result)
                tool_results.append((tool_call_id, result_str))

                # Check for error in tool result
                if result_str.startswith("❌"):
                    has_error = True
                    error_message = result_str
                    print(f"[Generator] ❌ Tool returned error: {error_message[:100]}...")
                    continue

                try:
                    tool_data = json.loads(result_str)
                    server_id = tool_data.get("serverId")
                    
                    if server_id:
                        post_creation_metadata = {
                            "serverCreated": True,
                            "serverId": server_id,
                            "artifactFetchStatus": "skipped",
                            "ragIndexStatus": "skipped",
                            "warnings": []
                        }
                        print(f"[Generator] 🔄 Server created with ID: {server_id}. Fetching artifacts for RAG indexing...")

                        try:
                            artifacts_data = await fetch_mcp_files(server_id)
                            post_creation_metadata["artifactFetchStatus"] = "success"
                            save_result = await save_mcp_artifacts(
                                server_id=server_id,
                                user_id=user_id,
                                email=email,
                                artifacts=artifacts_data,
                                skip_if_similar=True
                            )
                            if save_result.get("status") == "success":
                                post_creation_metadata["ragIndexStatus"] = "success"
                                print(f"[Generator] ✅ Artifacts indexed successfully")
                            else:
                                post_creation_metadata["ragIndexStatus"] = "failed"
                                warning = f"RAG indexing failed: {save_result}"
                                post_creation_metadata["warnings"].append(warning)
                                print(f"[Generator] ⚠️ {warning}")
                        except httpx.HTTPStatusError as status_error:
                            post_creation_metadata["artifactFetchStatus"] = "failed"
                            post_creation_metadata["ragIndexStatus"] = "skipped"
                            warning = f"Artifact fetch failed with status {status_error.response.status_code}"
                            post_creation_metadata["warnings"].append(warning)
                            print(f"[Generator] ⚠️ {warning}")
                        except (MCPTimeoutError, MCPUnavailableError, MCPResponseValidationError) as fetch_error:
                            post_creation_metadata["artifactFetchStatus"] = "failed"
                            post_creation_metadata["ragIndexStatus"] = "skipped"
                            warning = f"Artifact fetch failed: {fetch_error}"
                            post_creation_metadata["warnings"].append(warning)
                            print(f"[Generator] ⚠️ {warning}")
                        except Exception as index_error:
                            post_creation_metadata["artifactFetchStatus"] = post_creation_metadata.get("artifactFetchStatus", "failed")
                            post_creation_metadata["ragIndexStatus"] = "failed"
                            warning = f"Artifact indexing failed: {index_error}"
                            post_creation_metadata["warnings"].append(warning)
                            print(f"[Generator] ⚠️ {warning}")

                        tool_data["postCreation"] = post_creation_metadata
                        tool_results[-1] = (tool_call_id, json.dumps(tool_data, indent=2))
                except Exception as e:
                    print(f"[Generator] Warning during post-creation processing: {e}")
            
            elif tool_name == "test_mcp_server":
                args = tool_call.get("args", {}) or {}
                mcp_link = args.get("MCPLink", "")
                if mcp_link:
                    result = await test_mcp_server.ainvoke({"MCPLink": mcp_link})
                    tool_results.append((tool_call_id, str(result)))
                else:
                    tool_results.append((tool_call_id, "❌ Error: MCPLink parameter is required for testing"))
            else:
                tool_results.append((tool_call_id, f"❌ Error: Unsupported tool call: {tool_name}"))

        # If there was an error, return it directly
        if has_error:
            return {
                "messages": [AIMessage(content=error_message)],
                "next_agent": "supervisor_final",
                "final_response": error_message,
                "history": [],
                "retry_count": state.get("retry_count", 0),
                "current_plan": state.get("current_plan", ""),
                "is_complete": state.get("is_complete", False),
                "raw_api_doc": raw_api_doc,
                "enriched_context": enriched_context_json
            }

        # Return exact tool output. Do not pass config/token JSON through a final LLM.
        content = tool_results[-1][1] if tool_results else ""
        return {
            "messages": [AIMessage(content=content)],
            "next_agent": "supervisor_final",
            "final_response": content,
            "history": [],
            "retry_count": state.get("retry_count", 0),
            "current_plan": state.get("current_plan", ""),
            "is_complete": state.get("is_complete", False),
            "raw_api_doc": raw_api_doc,
            "enriched_context": enriched_context_json
        }

    return {
        "messages": [response],
        "next_agent": "supervisor_final",
        "final_response": str(response.content) if hasattr(response, 'content') else str(response),
        "history": [],
        "retry_count": state.get("retry_count", 0),
        "current_plan": state.get("current_plan", ""),
        "is_complete": state.get("is_complete", False),
        "raw_api_doc": raw_api_doc,
        "enriched_context": enriched_context_json
    }


class GeneratorAgent:
    """Generator Agent for content generation - Legacy class for backward compatibility"""
    
    def __init__(self):
        config = AGENT_CONFIG["generator_agent"]
        self.name = config["name"]
        self.prompt = load_prompt(config["prompt_file"])
        
        # Initialize model via factory
        from my_agent.utils.llm_factory import get_llm
        self.model = get_llm(temperature=config["temperature"])


    async def invoke(self, query: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Invoke the generator agent (legacy method)
        
        Args:
            query: Generation query
            context: Additional context
            
        Returns:
            Generated content
        """
        # Combine context with query to avoid SystemMessage (template issues)
        if context:
            combined_query = f"[Context: {context}]\\n\\n{query}"
        else:
            combined_query = query
        
        messages: List[BaseMessage] = [HumanMessage(content=combined_query)]
        
        # Simple generation without tools (using async)
        response = await self.model.ainvoke(messages)
        return {
            "messages": messages + [response],
            "final_response": str(response.content) if hasattr(response, 'content') else str(response)
        }
    
    def __repr__(self):
        return f"<{self.name}>"
