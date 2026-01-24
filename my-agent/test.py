"""
Multi-Agent System with LangGraph
Implements Supervisor and Generator Agent with delegation
"""
from dotenv import load_dotenv
load_dotenv()

from langchain_openai import ChatOpenAI
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from typing import TypedDict, Annotated, Sequence, Literal
import operator
import json
from agents.sub_agents.generator_agent import generator_agent_node
import os
from pydantic import SecretStr
from prompts import supervisor


# Initialize LLM
llm = ChatOpenAI(
    model="iec-model",
    temperature=0.5,
    base_url="https://llmapi.iec-uit.com/v1",
    api_key=SecretStr(os.getenv("OPENAI_API_KEY", "<API_KEY>"))
)

# ============================================================================
# STATE DEFINITION
# ============================================================================

class InputState(TypedDict):
    """User-facing input state - only requires messages"""
    messages: Annotated[Sequence[HumanMessage | AIMessage | SystemMessage | ToolMessage], operator.add]

class AgentState(TypedDict):
    """Internal overall state for the multi-agent system"""
    messages: Annotated[Sequence[HumanMessage | AIMessage | SystemMessage | ToolMessage], operator.add]
    next_agent: str
    final_response: str

# ============================================================================
# TOOLS DEFINITION
# ============================================================================


@tool
def delegate_to_generator_agent(task: str) -> str:
    """Delegate a content generation task to the Generator Agent.
    
    Args:
        task: The content generation task to perform
        
    Returns:
        Result from generator agent
    """
    return f"DELEGATE_TO_GENERATOR: {task}"


supervisor_tools = [delegate_to_generator_agent]

# ============================================================================
# AGENT NODES
# ============================================================================

# ============================================================================
# AGENT NODES
# ============================================================================

async def supervisor_node(state: AgentState) -> AgentState:
    """Supervisor agent that delegates tasks to sub-agents"""
    messages = state["messages"]
    
    # Check if request is already completed (prevent duplicate processing)
    request_completed = False
    last_user_message_idx = -1
    completion_found_idx = -1
    
    for idx, msg in enumerate(messages):
        msg_content = str(getattr(msg, 'content', ''))
        
        # Track last user message position
        if isinstance(msg, HumanMessage):
            # Check if this is a new MCP request (contains API docs)
            if any(keyword in msg_content.lower() for keyword in ['mcp server', 'api', 'curl', 'endpoint']):
                last_user_message_idx = idx
        
        # Check for completion indicators
        if 'MCP Server created successfully' in msg_content or 'Server ID:' in msg_content:
            completion_found_idx = idx
    
    # Request is complete if completion was found AFTER the last user request
    if completion_found_idx > last_user_message_idx and last_user_message_idx >= 0:
        request_completed = True
        print(f"[Supervisor] ✅ Detected completed request - will not re-delegate")
    
    system_prompt = supervisor.SUPERVISOR_MAIN_PROMPT
    
    # If already completed, don't bind tools to prevent re-delegation
    if request_completed:
        print(f"[Supervisor] Using LLM without tools for summarization")
        message_list = [SystemMessage(content=system_prompt)] + list(messages)
        response = await llm.ainvoke(message_list)
    else:
        # Bind tools to LLM
        llm_with_tools = llm.bind_tools(supervisor_tools, tool_choice="auto")
        
        # Create message list with system prompt
        message_list = [SystemMessage(content=system_prompt)] + list(messages)
        
        # Get response from LLM (using async) with error handling for streaming issues
        try:
            response = await llm_with_tools.ainvoke(message_list)
        except Exception as e:
            error_msg = str(e)
            if "Invalid diff" in error_msg or "less tool calls" in error_msg:
                print(f"[Supervisor] ⚠️  Streaming error detected, retrying without streaming...")
                # Retry with streaming disabled
                llm_no_stream = llm.bind_tools(supervisor_tools, tool_choice="auto")
                response = await llm_no_stream.ainvoke(message_list)
            else:
                raise e
    
    # IMPORTANT: Check if tool calls exist to determine routing
    # If tool_calls present, go to tools node for execution
    # Otherwise go to end
    has_tool_calls = hasattr(response, 'tool_calls') and response.tool_calls
    next_agent = "tools" if has_tool_calls else "end"
    
    # Debug: Log if no tool_calls when MCP keywords detected (but NOT for completed requests)
    if not request_completed and not has_tool_calls:
        if messages:
            last_msg = messages[-1]
            # Handle both dict and Message object
            if isinstance(last_msg, dict):
                user_query = str(last_msg.get("content", "")).lower()
            else:
                user_query = str(getattr(last_msg, "content", "")).lower()
        else:
            user_query = ""
        
        if any(keyword in user_query for keyword in ["mcp", "server", "api"]):
            print(f"⚠️  WARNING: MCP-related query detected but LLM didn't create tool_calls!")
            print(f"   Query: {user_query[:100]}...")
            resp_content = str(getattr(response, "content", response))[:200]
            print(f"   LLM Response: {resp_content}...")
    
    return {
        "messages": [response],
        "next_agent": next_agent,
        "final_response": ""
    }


def should_continue_after_tools(state: AgentState) -> Literal["generator", "end"]:
    """Determine next step after tools execution"""
    messages = state["messages"]
    
    # Check the last tool message for delegation
    for msg in reversed(messages):
        if isinstance(msg, ToolMessage):
            content = str(msg.content)
            if "DELEGATE_TO_GENERATOR" in content:
                return "generator"
    
    return "end"


async def supervisor_final_node(state: AgentState) -> AgentState:
    """Supervisor reviews generator results and creates final response"""
    messages = state["messages"]
    
    # Get the generator's output
    last_content = str(messages[-1].content) if messages else ""
    
    # Create final summary (using async)
    system_prompt = "Summarize the results from the generator agent into a cohesive response."
    summary_response = await llm.ainvoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=f"Results: {last_content}")
    ])
    
    return {
        "messages": [summary_response],
        "next_agent": "end",
        "final_response": str(summary_response.content)
    }

# ============================================================================
# ROUTING LOGIC
# ============================================================================

def route_agent(state: AgentState) -> Literal["tools", "end"]:
    """Route to tools or end based on state"""
    next_agent = state.get("next_agent", "end")
    
    if next_agent == "tools":
        return "tools"
    else:
        return "end"

# ============================================================================
# BUILD GRAPH
# ============================================================================

def create_multi_agent_graph():
    """Create the multi-agent workflow graph
    
    Flow:
    User Query -> Supervisor Agent -> Tools (if needed) -> Generator Agent -> Supervisor Final -> End
    
    The Supervisor delegates content generation tasks to the Generator Agent:
    - Generator Agent: Handles content generation, MCP server creation, and related tasks
    
    After Generator completion, flow returns to Supervisor Final which creates
    the final summary response.
    """
    workflow = StateGraph(AgentState, input_schema=InputState)
    
    # Add nodes
    workflow.add_node("supervisor", supervisor_node)
    workflow.add_node("tools", ToolNode(supervisor_tools))  # Add ToolNode to execute tools
    workflow.add_node("generator", generator_agent_node)  # Uses imported function from generator_agent.py
    workflow.add_node("supervisor_final", supervisor_final_node)
    
    # Set entry point
    workflow.set_entry_point("supervisor")
    
    # Add conditional edges from supervisor
    workflow.add_conditional_edges(
        "supervisor",
        route_agent,
        {
            "tools": "tools",
            "end": END
        }
    )
    
    # After tools execution, check where to go next
    workflow.add_conditional_edges(
        "tools",
        should_continue_after_tools,
        {
            "generator": "generator",
            "end": END
        }
    )
    
    # Generator agent goes back to supervisor final
    workflow.add_edge("generator", "supervisor_final")
    
    # Supervisor final ends the workflow
    workflow.add_edge("supervisor_final", END)
    
    return workflow.compile()

# ============================================================================
# MAIN SYSTEM
# ============================================================================

class MultiAgentSystem:
    """Multi-Agent System with LangGraph"""
    
    def __init__(self):
        print("Initializing Multi-Agent System with LangGraph...")
        self.graph = create_multi_agent_graph()
        print("✓ Supervisor Agent")
        print("✓ Generator Agent")
        print("\nMulti-Agent System Ready!\n")
    
    async def run(self, query: str) -> str:
        """
        Run a query through the multi-agent system
        
        Args:
            query: User query
            
        Returns:
            Final response
        """
        print(f"{'='*60}")
        print(f"Query: {query}")
        print(f"{'='*60}\n")
        
        # Initialize state
        initial_state: AgentState = {
            "messages": [HumanMessage(content=query)],
            "next_agent": "supervisor",
            "final_response": ""
        }
        
        # Run the graph (using async)
        print("Starting workflow...\n")
        
        try:
            result = await self.graph.ainvoke(initial_state)
            
            # Display flow
            print("\n" + "="*60)
            print("EXECUTION FLOW:")
            print("="*60)
            
            messages = result.get("messages", [])
            for idx, msg in enumerate(messages, 1):
                msg_type = type(msg).__name__
                content = getattr(msg, 'content', str(msg))
                
                print(f"\n[Step {idx}] {msg_type}")
                print("-" * 60)
                
                # Show tool calls if present
                if hasattr(msg, 'tool_calls') and msg.tool_calls:
                    print("Tool Calls:")
                    for tc in msg.tool_calls:
                        print(f"  🔧 {tc.get('name', 'unknown')}")
                        print(f"     Args: {tc.get('args', {})}")
                else:
                    print(str(content)[:500])
            
            # Get final response
            final_response = result.get("final_response", "")
            if not final_response and messages:
                final_response = str(messages[-1].content) if hasattr(messages[-1], 'content') else str(messages[-1])
            
            print("\n" + "="*60)
            print("FINAL RESPONSE:")
            print("="*60)
            print(final_response)
            print(f"\n{'='*60}\n")
            
            return final_response
            
        except Exception as e:
            print(f"\n❌ Error: {e}")
            import traceback
            traceback.print_exc()
            return f"Error: {e}"
    
    async def interactive_mode(self):
        """Run in interactive mode"""
        print("\n" + "="*60)
        print("INTERACTIVE MODE")
        print("="*60)
        print("Type your queries and press Enter")
        print("To load a prompt from a file, type 'file: <path/to/your/file.txt>'")
        print("Type 'exit' or 'quit' to exit")
        print("="*60 + "\n")
        
        while True:
            try:
                user_input = input("You: ").strip()
                
                if not user_input:
                    continue
                
                if user_input.lower() in ['exit', 'quit', 'q']:
                    print("\nGoodbye!")
                    break
                
                # Run query (await async call)
                await self.run(user_input)
                
            except KeyboardInterrupt:
                print("\n\nGoodbye!")
                break
            except Exception as e:
                print(f"\nError: {e}\n")

# ============================================================================
# EXPORT FOR LANGGRAPH SERVER
# ============================================================================

# Create and export the graph at module level for LangGraph Server
app = create_multi_agent_graph()

# ============================================================================
# OPTIONAL: CLI/Interactive Mode
# ============================================================================

import asyncio

def main():
    """Main function for CLI/interactive mode (optional)"""
    # Initialize system
    system = MultiAgentSystem()
    
    # Run in interactive mode using asyncio
    asyncio.run(system.interactive_mode())


if __name__ == "__main__":
    main()