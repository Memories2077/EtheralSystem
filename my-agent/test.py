"""
Multi-Agent System with LangGraph
Implements Supervisor, Weather Agent, and Social Agent with delegation
"""
from langchain_ollama import ChatOllama
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from typing import TypedDict, Annotated, Sequence, Literal
import operator
from dotenv import load_dotenv
import json
from tools.research_tools import weather_research

load_dotenv()

# Initialize LLM
llm = ChatOllama(
    model="qwen2.5:7b",
    temperature=0.5,
    base_url="https://ollama.timnguyen.id.vn"
)

# ============================================================================
# STATE DEFINITION
# ============================================================================

class AgentState(TypedDict):
    """State for the multi-agent system"""
    messages: Annotated[Sequence[HumanMessage | AIMessage | SystemMessage | ToolMessage], operator.add]
    next_agent: str
    final_response: str

# ============================================================================
# TOOLS DEFINITION
# ============================================================================

@tool
def post_to_social_media(content: str, platform: str = "twitter") -> str:
    """Post content to social media platform.
    
    Args:
        content: The content to post
        platform: Social media platform (twitter, facebook, instagram)
        
    Returns:
        Confirmation message
    """
    return f"✓ Posted to {platform}: '{content[:50]}...' (simulated)"

@tool
def delegate_to_weather_agent(task: str) -> str:
    """Delegate a weather-related task to the Weather Agent.
    
    Args:
        task: The weather task to perform
        
    Returns:
        Result from weather agent
    """
    return f"DELEGATE_TO_WEATHER: {task}"

@tool
def delegate_to_social_agent(task: str) -> str:
    """Delegate a social media task to the Social Agent.
    
    Args:
        task: The social media task to perform
        
    Returns:
        Result from social agent
    """
    return f"DELEGATE_TO_SOCIAL: {task}"

@tool
def get_weather(location: str) -> str:
    """Get weather information for a specific location using OpenWeatherMap API.
    
    Args:
        location: The city or location to get weather for
    """
    result = weather_research(location)
    
    # Check for error
    if "error" in result:
        return f"Error getting weather: {result['error']}"
    
    # Format the result
    weather_info = (
        f"{result['location']}: "
        f"{result['temperature']}°C (feels like {result['feels_like']}°C), "
        f"{result['description'].capitalize()}, "
        f"Humidity: {result['humidity']}%, "
        f"Wind: {result['wind_speed']} m/s"
    )
    
    return weather_info

# Tool collections
weather_tools = [get_weather]
social_tools = [post_to_social_media]
supervisor_tools = [delegate_to_weather_agent, delegate_to_social_agent]

# ============================================================================
# AGENT NODES
# ============================================================================

# ============================================================================
# AGENT NODES
# ============================================================================

def supervisor_node(state: AgentState) -> AgentState:
    """Supervisor agent that delegates tasks to sub-agents"""
    messages = state["messages"]
    
    system_prompt = """You are a Supervisor Agent that coordinates tasks between specialized sub-agents.

You have access to these agents:
- Weather Agent: Handles weather information queries
- Social Agent: Handles social media posting

When given a task:
1. If it involves weather information, use delegate_to_weather_agent
2. If it involves posting to social media, use delegate_to_social_agent
3. For complex tasks, delegate to multiple agents in sequence

Always use the delegation tools to route tasks appropriately."""
    
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
            if "weather" in tool_call["name"].lower():
                next_agent = "weather"
                break
            elif "social" in tool_call["name"].lower():
                next_agent = "social"
                break
    
    return {
        "messages": [response],
        "next_agent": next_agent,
        "final_response": ""
    }

def weather_agent_node(state: AgentState) -> AgentState:
    """Weather agent that handles weather queries"""
    messages = state["messages"]
    
    system_prompt = """You are a Weather Agent specialized in providing weather information.

Use the weather_research tool to retrieve weather data for locations.
Provide clear, concise weather reports."""
    
    # Bind weather tools
    llm_with_tools = llm.bind_tools(weather_tools)
    
    # Find the delegation task
    last_message = messages[-1]
    task_content = ""
    
    tool_calls = getattr(last_message, 'tool_calls', None)
    if tool_calls:
        for tool_call in tool_calls:
            if "delegate_to_weather_agent" in tool_call.get("name", ""):
                task_content = tool_call.get("args", {}).get("task", "")
    
    if not task_content:
        task_content = "Get weather information"
    
    # Create weather query
    weather_messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=task_content)
    ]
    
    response = llm_with_tools.invoke(weather_messages)
    
    # If tool calls exist, execute them
    if response.tool_calls:
        tool_results = []
        for tool_call in response.tool_calls:
            if tool_call["name"] == "weather_research":
                location = tool_call["args"].get("location", "Hanoi")
                result = weather_research.invoke({"location": location})
                tool_results.append(result)
        
        # Generate final response with tool results
        final_messages = weather_messages + [response] + [
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
        "final_response": ""
    }

def social_agent_node(state: AgentState) -> AgentState:
    """Social agent that handles social media posting"""
    messages = state["messages"]
    
    system_prompt = """You are a Social Media Agent specialized in posting content to social media.

Use the post_to_social_media tool to post content.
Create engaging, concise posts suitable for social media."""
    
    # Bind social tools
    llm_with_tools = llm.bind_tools(social_tools)
    
    # Find the delegation task
    last_message = messages[-1]
    task_content = ""
    
    tool_calls = getattr(last_message, 'tool_calls', None)
    if tool_calls:
        for tool_call in tool_calls:
            if "delegate_to_social_agent" in tool_call.get("name", ""):
                task_content = tool_call.get("args", {}).get("task", "")
    
    # Check if there's weather info in previous messages to use
    context = "\n".join([str(m.content) for m in messages[-3:] if hasattr(m, 'content')])
    
    if not task_content:
        task_content = f"Create a social media post. Context: {context}"
    else:
        task_content = f"{task_content}. Context: {context}"
    
    # Create social query
    social_messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=task_content)
    ]
    
    response = llm_with_tools.invoke(social_messages)
    
    # If tool calls exist, execute them
    if response.tool_calls:
        tool_results = []
        for tool_call in response.tool_calls:
            if tool_call["name"] == "post_to_social_media":
                content = tool_call["args"].get("content", "")
                platform = tool_call["args"].get("platform", "twitter")
                result = post_to_social_media.invoke({"content": content, "platform": platform})
                tool_results.append(result)
        
        # Generate final response with tool results
        final_messages = social_messages + [response] + [
            ToolMessage(content=str(result), tool_call_id=tc["id"])
            for result, tc in zip(tool_results, response.tool_calls)
        ]
        final_response = llm.invoke(final_messages)
        
        return {
            "messages": [final_response],
            "next_agent": "end",
            "final_response": str(final_response.content) if hasattr(final_response, 'content') else str(final_response)
        }
    
    return {
        "messages": [response],
        "next_agent": "end",
        "final_response": ""
    }

def supervisor_final_node(state: AgentState) -> AgentState:
    """Supervisor reviews sub-agent results and decides next action"""
    messages = state["messages"]
    
    # Check if we need to continue to social agent
    last_content = str(messages[-1].content) if messages else ""
    
    if "weather" in last_content.lower() and state.get("next_agent") == "supervisor_final":
        # Check if original task mentioned social media
        first_message = str(messages[0].content) if messages else ""
        if "social" in first_message.lower() or "post" in first_message.lower():
            return {
                "messages": [],
                "next_agent": "social",
                "final_response": ""
            }
    
    # Create final summary
    system_prompt = "Summarize the results from the sub-agents into a cohesive response."
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

def route_agent(state: AgentState) -> Literal["weather", "social", "supervisor_final", "end"]:
    """Route to the next agent based on state"""
    next_agent = state.get("next_agent", "end")
    
    if next_agent == "weather":
        return "weather"
    elif next_agent == "social":
        return "social"
    elif next_agent == "supervisor_final":
        return "supervisor_final"
    else:
        return "end"

# ============================================================================
# BUILD GRAPH
# ============================================================================

def create_multi_agent_graph():
    """Create the multi-agent workflow graph"""
    workflow = StateGraph(AgentState)
    
    # Add nodes
    workflow.add_node("supervisor", supervisor_node)
    workflow.add_node("weather", weather_agent_node)
    workflow.add_node("social", social_agent_node)
    workflow.add_node("supervisor_final", supervisor_final_node)
    
    # Set entry point
    workflow.set_entry_point("supervisor")
    
    # Add conditional edges from supervisor
    workflow.add_conditional_edges(
        "supervisor",
        route_agent,
        {
            "weather": "weather",
            "social": "social",
            "supervisor_final": "supervisor_final",
            "end": END
        }
    )
    
    # Weather agent goes back to supervisor final
    workflow.add_edge("weather", "supervisor_final")
    
    # Supervisor final routes to social or end
    workflow.add_conditional_edges(
        "supervisor_final",
        route_agent,
        {
            "social": "social",
            "end": END
        }
    )
    
    # Social agent ends
    workflow.add_edge("social", END)
    
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
        print("✓ Weather Agent")
        print("✓ Social Agent")
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
                
                # Run query
                self.run(user_input)
                
            except KeyboardInterrupt:
                print("\n\nGoodbye!")
                break
            except Exception as e:
                print(f"\nError: {e}\n")

def main():
    """Main function"""
    # Initialize system
    system = MultiAgentSystem()
    
    # Test queries
    test_queries = [
        "Check the weather in Hanoi"
    ]
    
    # Run first test
    print("Running test query...\n")
    try:
        system.run(test_queries[0])
    except Exception as e:
        print(f"Error: {e}\n")
        import traceback
        traceback.print_exc()
    
    # Uncomment to enable interactive mode
    # system.interactive_mode()


if __name__ == "__main__":
    main()