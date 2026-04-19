from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, ToolMessage, BaseMessage

from typing import Dict, Any, Optional, List, Sequence
from pydantic import SecretStr
from my_agent.tools.generator_tools import create_MCPServer, test_mcp_server
from my_agent.utils.vector_db import save_mcp_artifacts

from my_agent.config import load_prompt, AGENT_CONFIG, API_CONFIG, PROVIDER_CONFIG
from my_agent.utils.state import AgentState, get_message_content # Import from centralized location

import os
import httpx
import re

custom_client = httpx.Client(
    timeout=httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=10.0),
    limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
)

async def generator_agent_node(state: AgentState) -> AgentState:
    """Generator agent that handles content generation tasks"""
    messages = state["messages"]
    
    # Initialize LLM for this agent
    config = AGENT_CONFIG["generator_agent"]
    system_prompt = config["prompt_file"]

    # Initialize LLM via factory
    from my_agent.utils.llm_factory import get_llm
    llm = get_llm(temperature=config["temperature"])


    llm_with_tools = llm.bind_tools([create_MCPServer])
    
    # 1. State-backed Data Extraction (Primary Source)
    raw_api_doc = state.get("raw_api_doc", "")
    enriched_context_json = state.get("enriched_context", "[]")
    
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
    
    def parse_task_metadata(content: str) -> tuple:
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
    Call the create_MCPServer tool now with the query parameter.
    The full API documentation has been prepared for you.
    Just invoke: create_MCPServer(query=[api_doc, userId, email])"""

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
    
    # If tool calls exist, execute them
    if response.tool_calls:
        tool_results = []
        has_error = False
        error_message = ""
        
        for tool_call in response.tool_calls:
            if tool_call["name"] == "create_MCPServer":
                # CRITICAL: Use our pre-constructed query with FULL API doc
                query = constructed_query
                
                print(f"[Generator] Creating MCP Server with FULL API documentation...")
                
                # Properly await the async tool
                result = await create_MCPServer.ainvoke({"query": query})
                result_str = str(result)
                tool_results.append(result_str)

                # Check for error in tool result
                if result_str.startswith("❌"):
                    has_error = True
                    error_message = result_str
                    print(f"[Generator] ❌ Tool returned error: {error_message[:100]}...")
                    continue

                import json
                try:
                    tool_data = json.loads(result_str)
                    server_id = tool_data.get("serverId")
                    
                    if server_id:
                        print(f"[Generator] 🔄 Server created with ID: {server_id}. Indexing for RAG...")
                        # ... (RAG indexing logic remains the same)
                        mcp_base_url = os.environ.get("MCP_BASE_URL", "http://localhost:8080")
                        manager_url = mcp_base_url.rstrip('/')
                        if manager_url.endswith("/api"):
                            manager_url = manager_url[:-4]
                        manager_url = manager_url.rstrip('/')

                        async with httpx.AsyncClient(timeout=30.0) as client:
                            files_response = await client.get(f"{manager_url}/api/mcp/{server_id}/files")
                            if files_response.status_code == 200:
                                artifacts_data = files_response.json().get("files", {})
                                save_result = await save_mcp_artifacts(
                                    server_id=server_id,
                                    user_id=user_id,
                                    email=email,
                                    artifacts=artifacts_data,
                                    skip_if_similar=True
                                )
                                if save_result["status"] == "success":
                                    print(f"[Generator] ✅ Artifacts indexed successfully")
                except Exception as e:
                    print(f"[Generator] Warning during post-creation processing: {e}")
            
            elif tool_call["name"] == "test_mcp_server":
                mcp_link = tool_call["args"].get("MCPLink", "")
                if mcp_link:
                    result = await test_mcp_server.ainvoke({"MCPLink": mcp_link})
                    tool_results.append(str(result))
                else:
                    tool_results.append("❌ Error: MCPLink parameter is required for testing")

        # If there was an error, return it directly
        if has_error:
            return {
                "messages": [AIMessage(content=error_message)],
                "next_agent": "supervisor_final",
                "final_response": error_message
            }
        
        # Generate final response with tool results
        final_prompt = """Based on the tool results above, create a final response for the user.
        If the MCP Server was created successfully, you MUST include:
        1. The exact phrase: "✅ MCP Server created successfully!"
        2. The 'Server Details:' section including "Server ID: [id]".
        3. The full JSON configuration object for the user to copy.
        
        This will signal the supervisor that the task is complete.
        """
        
        final_messages = generator_messages + [response] + [
            ToolMessage(content=str(result), tool_call_id=tc["id"])
            for result, tc in zip(tool_results, response.tool_calls)
        ] + [
            HumanMessage(content=final_prompt)
        ]
        
        final_response = await llm.ainvoke(final_messages)
        content = str(final_response.content) if hasattr(final_response, 'content') else str(final_response)
        
        return {
            "messages": [AIMessage(content=content)],
            "next_agent": "supervisor_final",
            "final_response": content
        }

    
    return {
        "messages": [response],
        "next_agent": "supervisor_final",
        "final_response": str(response.content) if hasattr(response, 'content') else str(response)
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
