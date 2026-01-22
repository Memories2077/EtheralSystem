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

def supervisor_node(state: AgentState) -> AgentState:
    """Supervisor agent that delegates tasks to sub-agents"""
    messages = state["messages"]
    
    system_prompt = supervisor.SUPERVISOR_MAIN_PROMPT
    
    # Bind tools to LLM
    llm_with_tools = llm.bind_tools(supervisor_tools)
    
    # Create message list with system prompt
    message_list = [SystemMessage(content=system_prompt)] + list(messages)
    
    # Get response from LLM
    response = llm_with_tools.invoke(message_list)
    
    # Determine next agent based on tool calls
    next_agent = "supervisor"
    if response.tool_calls:
        for tool_call in response.tool_calls:
            if "generator" in tool_call["name"].lower():
                next_agent = "generator"
                break
    
    return {
        "messages": [response],
        "next_agent": next_agent,
        "final_response": ""
    }


def supervisor_final_node(state: AgentState) -> AgentState:
    """Supervisor reviews generator results and creates final response"""
    messages = state["messages"]
    
    # Get the generator's output
    last_content = str(messages[-1].content) if messages else ""
    
    # Create final summary
    system_prompt = "Summarize the results from the generator agent into a cohesive response."
    summary_response = llm.invoke([
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

def route_agent(state: AgentState) -> Literal["generator", "supervisor_final", "end"]:
    """Route to the next agent based on state"""
    next_agent = state.get("next_agent", "end")
    
    if next_agent == "generator":
        return "generator"
    elif next_agent == "supervisor_final":
        return "supervisor_final"
    else:
        return "end"

# ============================================================================
# BUILD GRAPH
# ============================================================================

def create_multi_agent_graph():
    """Create the multi-agent workflow graph
    
    Flow:
    User Query -> Supervisor Agent -> Generator Agent -> Supervisor Final -> End
    
    The Supervisor delegates content generation tasks to the Generator Agent:
    - Generator Agent: Handles content generation, MCP server creation, and related tasks
    
    After Generator completion, flow returns to Supervisor Final which creates
    the final summary response.
    """
    workflow = StateGraph(AgentState, input_schema=InputState)
    
    # Add nodes
    workflow.add_node("supervisor", supervisor_node)
    workflow.add_node("generator", generator_agent_node)  # Uses imported function from generator_agent.py
    workflow.add_node("supervisor_final", supervisor_final_node)
    
    # Set entry point
    workflow.set_entry_point("supervisor")
    
    # Add conditional edges from supervisor
    workflow.add_conditional_edges(
        "supervisor",
        route_agent,
        {
            "generator": "generator",
            "supervisor_final": "supervisor_final",
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
    
    def run(self, query: str) -> str:
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
        
        # Run the graph
        print("Starting workflow...\n")
        
        try:
            result = self.graph.invoke(initial_state)
            
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
    
    def interactive_mode(self):
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
                
                query = ""
                if user_input.startswith("file:"):
                    file_path = user_input.split(":", 1)[1].strip()
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            query = f.read()
                        print(f"Loaded prompt from '{file_path}'")
                    except FileNotFoundError:
                        print(f"❌ Error: File not found at '{file_path}'")
                        continue
                    except Exception as e:
                        print(f"❌ Error reading file: {e}")
                        continue
                else:
                    query = user_input

                # Run query if it's not empty
                if query:
                    self.run(query)
                
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

def main():
    """Main function for CLI/interactive mode (optional)"""
    # Initialize system
    system = MultiAgentSystem()
    
    # Run in interactive mode
    system.interactive_mode()


if __name__ == "__main__":
    main()