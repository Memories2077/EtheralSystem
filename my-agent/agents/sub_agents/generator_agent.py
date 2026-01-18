from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, ToolMessage, BaseMessage
from langchain_core.tools import tool
from typing import Dict, Any, Optional, List, TypedDict, Annotated, Sequence, Union
import operator
from pydantic import SecretStr
from tools.generator_tools._init_ import create_MCPServer, test_mcp_server

from config import load_prompt, AGENT_CONFIG, API_CONFIG

import httpx

custom_client = httpx.Client(
    timeout=httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=10.0),
    limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
)


class AgentState(TypedDict):
    """State for the multi-agent system"""
    messages: Annotated[Sequence[HumanMessage | AIMessage | SystemMessage | ToolMessage], operator.add]
    next_agent: str
    final_response: str


def generator_agent_node(state: AgentState) -> AgentState:
    """Generator agent that handles content generation tasks"""
    messages = state["messages"]
    
    # Initialize LLM for this agent
    config = AGENT_CONFIG["generator_agent"]
    system_prompt = config["prompt_file"]
    llm = ChatOpenAI(
        model=config["model"],
        temperature=config["temperature"],
        base_url=API_CONFIG["openai_base_url"],
        api_key=SecretStr(API_CONFIG["openai_api_key"])
    )
    
    # Bind generator tools
    llm_with_tools = llm.bind_tools([create_MCPServer, test_mcp_server])
    
    # Find the delegation task
    last_message = messages[-1]
    task_content = ""
    
    tool_calls = getattr(last_message, 'tool_calls', None)
    if tool_calls:
        for tool_call in tool_calls:
            if "delegate_to_generator_agent" in tool_call.get("name", ""):
                task_content = tool_call.get("args", {}).get("task", "")
    
    if not task_content:
        task_content = "Generate content based on the user's request"
    
    # Create generator query
    generator_messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=task_content)
    ]
    
    response = llm_with_tools.invoke(generator_messages)
    
    # If tool calls exist, execute them
    if response.tool_calls:
        tool_results = []
        for tool_call in response.tool_calls:
            if tool_call["name"] == "create_MCPServer":
                query = tool_call["args"].get("query", [])
                # Ensure query is a list of strings
                if not isinstance(query, list):
                    query = [str(query)]
                result = create_MCPServer.invoke({"query": query})
                tool_results.append(result)
            
            elif tool_call["name"] == "test_mcp_server":
                mcp_link = tool_call["args"].get("MCPLink", "")
                if mcp_link:
                    import asyncio
                    result = asyncio.run(test_mcp_server.invoke({"MCPLink": mcp_link}))
                    tool_results.append(str(result))
                else:
                    tool_results.append("❌ Error: MCPLink parameter is required for testing")
        
        # Generate final response with tool results
        final_messages = generator_messages + [response] + [
            ToolMessage(content=str(result), tool_call_id=tc["id"])
            for result, tc in zip(tool_results, response.tool_calls)
        ]
        final_response = llm.invoke(final_messages)
        
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
        self.model = ChatOpenAI(
            model=config["model"],
            temperature=config["temperature"],
            base_url=API_CONFIG["openai_base_url"],
            api_key=SecretStr(API_CONFIG["openai_api_key"])
        )
    
    def invoke(self, query: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Invoke the generator agent (legacy method)
        
        Args:
            query: Generation query
            context: Additional context
            
        Returns:
            Generated content
        """
        messages: List[BaseMessage] = [HumanMessage(content=query)]
        if context:
            messages.insert(0, SystemMessage(content=f"Context: {context}"))
        
        # Simple generation without tools
        response = self.model.invoke(messages)
        return {
            "messages": messages + [response],
            "final_response": str(response.content) if hasattr(response, 'content') else str(response)
        }
    
    def __repr__(self):
        return f"<{self.name}>"
