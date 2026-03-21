from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, ToolMessage, BaseMessage
from typing import Dict, Any, Optional, List, Sequence
from pydantic import SecretStr
from tools.generator_tools._init_ import create_MCPServer, test_mcp_server

from config import load_prompt, AGENT_CONFIG, API_CONFIG, PROVIDER_CONFIG
from utils.state import AgentState # Import from centralized location

import httpx

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

    # Initialize LLM (streaming=False to avoid 'Invalid diff' error with tool calls)
    gemini_api_key = SecretStr(API_CONFIG["gemini_api_key"])
    groq_api_key = SecretStr(API_CONFIG["groq_api_key"])

    if gemini_api_key:
        llm = ChatGoogleGenerativeAI(model=PROVIDER_CONFIG["gemini"], api_key=gemini_api_key)
    elif groq_api_key:
        llm = ChatGroq(model_name=PROVIDER_CONFIG["groq"], api_key=groq_api_key)

    llm_with_tools = llm.bind_tools([create_MCPServer])
    
    # Find the delegation task
    # With ToolNode: messages = [HumanMessage, AIMessage with tool_calls, ToolMessage with result]
    # Without ToolNode: messages = [HumanMessage, AIMessage with tool_calls]
    task_content = ""
    
    # Try to find task from ToolMessage first (when using ToolNode)
    for msg in reversed(messages):
        if isinstance(msg, ToolMessage):
            content = str(msg.content)
            if "DELEGATE_TO_GENERATOR:" in content:
                # Extract task from "DELEGATE_TO_GENERATOR: [task]"
                task_content = content.replace("DELEGATE_TO_GENERATOR:", "").strip()
                print(f"[Generator] Found task from ToolMessage: {task_content[:200]}...")
                break
    
    # Fallback: Try to find from AIMessage tool_calls (old flow without ToolNode)
    if not task_content:
        for msg in reversed(messages):
            tool_calls = getattr(msg, 'tool_calls', None)
            if tool_calls:
                for tool_call in tool_calls:
                    if "delegate_to_generator_agent" in tool_call.get("name", ""):
                        task_content = tool_call.get("args", {}).get("task", "")
                        print(f"[Generator] Found task from AIMessage tool_calls: {task_content[:200]}...")
                        break
                if task_content:
                    break
    
    if not task_content:
        print("[Generator] ⚠️  WARNING: No task content found! Using default.")
        print(f"[Generator] Messages received: {len(messages)} messages")
        for idx, msg in enumerate(messages):
            print(f"  [{idx}] {type(msg).__name__}: {str(msg)[:100]}...")
        task_content = "Generate content based on the user's request"
    
    # Parse task_content to extract API documentation, userId, and email
    # Expected format:
    # API_DOCUMENTATION:
    # [content]
    # USER_ID: [userId]
    # EMAIL: [email]
    
    def parse_task_content(content: str) -> tuple:
        """Parse task content to extract API doc, userId, and email"""
        api_doc = ""
        user_id = "default_user"
        email = "user@example.com"
        
        # Extract API documentation
        if "API_DOCUMENTATION:" in content:
            parts = content.split("USER_ID:", 1)
            api_doc = parts[0].replace("API_DOCUMENTATION:", "").strip()
            
            # Extract userId and email if present
            if len(parts) > 1:
                remaining = parts[1]
                if "EMAIL:" in remaining:
                    user_parts = remaining.split("EMAIL:", 1)
                    user_id = user_parts[0].strip()
                    email = user_parts[1].strip().split("\n")[0].strip()
                else:
                    user_id = remaining.strip().split("\n")[0].strip()
        else:
            # If no format markers, treat entire content as API doc
            api_doc = content.strip()
        
        return api_doc, user_id, email
    
    # Add parsed parameters to the task for the generator
    api_doc, user_id, email = parse_task_content(task_content)
    
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
    
    # Create generator query - combine system prompt with task to avoid template issues
    # Some models have issues when SystemMessage is first, so we combine them
    combined_prompt = f"""[SYSTEM INSTRUCTION]
{system_prompt}

[USER REQUEST]
{enhanced_task}"""
    
    generator_messages = [
        HumanMessage(content=combined_prompt)
    ]
    
    response = await llm_with_tools.ainvoke(generator_messages)
    
    # If tool calls exist, execute them
    if response.tool_calls:
        tool_results = []
        for tool_call in response.tool_calls:
            if tool_call["name"] == "create_MCPServer":
                # CRITICAL: Use our pre-constructed query with FULL API doc
                # We ignore whatever the LLM provides and use our complete version
                query = constructed_query  # Contains [full_api_doc, user_id, email]
                
                print(f"[Generator] Creating MCP Server with FULL API documentation...")
                print(f"  - API Doc Length: {len(query[0])} chars (COMPLETE, NOT TRUNCATED)")
                print(f"  - User ID: {query[1]}")
                print(f"  - Email: {query[2]}")
                
                # Properly await the async tool
                result = await create_MCPServer.ainvoke({"query": query})
                tool_results.append(result)
            
            elif tool_call["name"] == "test_mcp_server":
                mcp_link = tool_call["args"].get("MCPLink", "")
                if mcp_link:
                    # Properly await the async tool
                    result = await test_mcp_server.ainvoke({"MCPLink": mcp_link})
                    tool_results.append(str(result))
                else:
                    tool_results.append("❌ Error: MCPLink parameter is required for testing")
        
        # Generate final response with tool results
        final_messages = generator_messages + [response] + [
            ToolMessage(content=str(result), tool_call_id=tc["id"])
            for result, tc in zip(tool_results, response.tool_calls)
        ]
        final_response = await llm.ainvoke(final_messages)
        
        return {
            "messages": [final_response],
            "next_agent": "supervisor_final",
            "final_response": str(final_response.content) if hasattr(final_response, 'content') else str(final_response)
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
        
        # Initialize model
        api_key = SecretStr(API_CONFIG["gemini_api_key"])
        self.model = ChatGoogleGenerativeAI(mode=config["model"], api_key=api_key)

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
