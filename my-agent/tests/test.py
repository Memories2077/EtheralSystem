"""
Multi-Agent System with LangGraph
Implements Supervisor and Generator Agent with delegation
"""
import os
import sys
# Add parent directory to path so we can import agents, config, prompts, utils
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from dotenv import load_dotenv
load_dotenv()

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from typing import TypedDict, Annotated, Sequence, Literal
import operator
import json
from agents.sub_agents.generator_agent import generator_agent_node
from agents.sub_agents.examiner_agent import examiner_agent_node
import os
from pydantic import SecretStr
from prompts import supervisor

from config import API_CONFIG, AGENT_CONFIG, PROVIDER_CONFIG


# Initialize LLM (streaming=False to avoid 'Invalid diff' error with tool calls)
gemini_api_key = SecretStr(API_CONFIG["gemini_api_key"])
groq_api_key = SecretStr(API_CONFIG["groq_api_key"])

if gemini_api_key:
    llm = ChatGoogleGenerativeAI(model=PROVIDER_CONFIG["gemini"], api_key=gemini_api_key)
elif groq_api_key:
    llm = ChatGroq(model_name=PROVIDER_CONFIG["groq"], api_key=groq_api_key)

# ============================================================================
# LLM-BASED REQUEST ANALYZER
# ============================================================================

async def analyze_mcp_request(user_message: str) -> dict:
    """
    Use LLM to analyze if the message is an MCP Server creation request
    and extract the API description if so.
    
    Returns:
        dict: {
            "is_mcp_request": bool,
            "api_description": str | None,
            "api_name": str | None,
            "confidence": float
        }
    """
    analysis_prompt = f"""Analyze the following user message and determine if it's a request to create an MCP (Model Context Protocol) Server.

USER MESSAGE:
{user_message}

INSTRUCTIONS:
1. Check if the user wants to CREATE an MCP Server
2. If yes, extract the API documentation/description that should be used to create the MCP Server
3. Identify the API name if mentioned

Respond in this exact JSON format (no markdown, no extra text):
{{
    "is_mcp_request": true/false,
    "api_name": "name of the API or null",
    "api_description": "the full API documentation/description extracted from the message, or null if not an MCP request",
    "confidence": 0.0-1.0
}}

IMPORTANT:
- If user wants to create MCP Server, set is_mcp_request to true
- api_description should contain ALL the API details (endpoints, methods, examples, etc.) from the user message
- Keep the original format of the API documentation in api_description
- Only output the JSON, nothing else"""

    try:
        print(f"[MCP Analyzer] Analyzing message ({len(user_message)} chars)...")
        response = await llm.ainvoke([HumanMessage(content=analysis_prompt)])
        content = str(response.content).strip()
        
        print(f"[MCP Analyzer] Raw LLM response ({len(content)} chars): {content[:300]}...")
        
        # Clean up potential markdown formatting
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        content = content.strip()
        
        result = json.loads(content)
        print(f"[MCP Analyzer] ✅ Analysis result: is_mcp={result.get('is_mcp_request')}, api={result.get('api_name')}, confidence={result.get('confidence')}")
        
        # Log api_description length if present
        if result.get('api_description'):
            print(f"[MCP Analyzer] API description length: {len(result.get('api_description'))} chars")
        
        return result
        
    except json.JSONDecodeError as e:
        print(f"[MCP Analyzer] ⚠️ JSON parse error: {e}")
        print(f"[MCP Analyzer] Raw response: {content[:200]}...")
        # Fallback: if parsing fails but message looks like MCP request
        if 'mcp server' in user_message.lower() and ('api' in user_message.lower() or 'endpoint' in user_message.lower()):
            return {
                "is_mcp_request": True,
                "api_name": "Unknown API",
                "api_description": user_message,
                "confidence": 0.7
            }
        return {"is_mcp_request": False, "api_description": None, "api_name": None, "confidence": 0.0}
        
    except Exception as e:
        print(f"[MCP Analyzer] ❌ Error: {e}")
        return {"is_mcp_request": False, "api_description": None, "api_name": None, "confidence": 0.0}


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
def delegate_to_examiner_agent(task: str) -> str:
    """Delegate a documentation analysis or RAG enrichment task to the Examiner Agent.
    
    This tool is used to delegate MCP Server creation requests to the Examiner Agent
    for RAG enrichment and context building. Always provide the complete task description
    including all API specifications, endpoints, and requirements.
    
    Args:
        task (str): The complete API documentation/task description from the user
        
    Returns:
        str: Message for the examiner agent
    """
    if not task or not isinstance(task, str):
        return "Error: task parameter must be a non-empty string"
    
    return f"DELEGATE_TO_EXAMINER: {task}"

@tool
def delegate_to_generator_agent(task: str) -> str:
    """Delegate a documentation analysis or RAG enrichment task to the Generator Agent.
    
    This tool is used by the Examiner Agent to pass the enriched context
    to the Generator Agent for final MCP Server creation.
    
    Args:
        task (str): The enriched API documentation/context
        
    Returns:
        str: Message for the generator agent
    """
    if not task or not isinstance(task, str):
        return "Error: task parameter must be a non-empty string"
    
    return f"DELEGATE_TO_GENERATOR: {task}"
supervisor_tools = [delegate_to_examiner_agent, delegate_to_generator_agent]


# Custom tool node wrapper - uses LLM to analyze and fix empty args
async def tools_node_wrapper(state: AgentState) -> AgentState:
    """Wrapper around ToolNode that uses LLM to analyze requests and fix empty tool_calls args"""
    try:
        messages = list(state["messages"])  # Create mutable copy
        
        # DEBUG: Log all messages to understand structure
        print(f"[ToolNode] 🔍 Total messages in state: {len(messages)}")
        for i, msg in enumerate(messages):
            msg_type = type(msg).__name__
            msg_content = str(getattr(msg, 'content', ''))[:100]
            print(f"[ToolNode] 🔍 Message {i}: type={msg_type}, content={msg_content}...")
        
        # Find the last AIMessage with tool_calls
        for idx, msg in enumerate(reversed(messages)):
            actual_idx = len(messages) - 1 - idx
            
            if isinstance(msg, AIMessage) and hasattr(msg, 'tool_calls') and msg.tool_calls:
                print(f"[ToolNode] Found tool_calls at index {actual_idx}: {msg.tool_calls}")
                
                # Check if any args are empty
                needs_fix = False
                fixed_tool_calls = []
                
                for i, tool_call in enumerate(msg.tool_calls):
                    tool_call_copy = dict(tool_call)  # Make a copy
                    
                    # Check for empty args or missing 'task' key
                    args = tool_call_copy.get('args', {})
                    if not isinstance(args, dict) or not args or 'task' not in args or not args.get('task'):
                        print(f"[ToolNode] ⚠️ Empty/missing args detected in tool_call {i}")
                        needs_fix = True
                        
                        # Find the LAST (most recent) user message before this AIMessage
                        # Handle both HumanMessage objects AND dict format
                        user_message = None
                        for prev_idx in range(actual_idx - 1, -1, -1):  # Loop backwards from AIMessage
                            prev_msg = messages[prev_idx]
                            
                            # Check if it's a HumanMessage object
                            if isinstance(prev_msg, HumanMessage):
                                user_message = str(prev_msg.content)
                                print(f"[ToolNode] 📋 Found HumanMessage at index {prev_idx} ({len(user_message)} chars)")
                                break
                            
                            # Check if it's a dict with type='human' or role='user'
                            elif isinstance(prev_msg, dict):
                                msg_type = prev_msg.get('type', prev_msg.get('role', ''))
                                if msg_type in ('human', 'user', 'HumanMessage'):
                                    user_message = str(prev_msg.get('content', ''))
                                    print(f"[ToolNode] 📋 Found dict message (type={msg_type}) at index {prev_idx} ({len(user_message)} chars)")
                                    break
                        
                        # Show preview to verify it's the right message
                        if user_message:
                            preview = user_message[:200].replace('\n', ' ')
                            print(f"[ToolNode] Message preview: {preview}...")
                        
                        if user_message:
                            print(f"[ToolNode] 🤖 Using LLM to analyze user request...")
                            analysis = await analyze_mcp_request(user_message)
                            
                            print(f"[ToolNode] Analysis result: is_mcp={analysis.get('is_mcp_request')}, api={analysis.get('api_name')}")
                            
                            if analysis.get('is_mcp_request') and analysis.get('api_description'):
                                # Use the LLM-extracted API description
                                api_desc = analysis.get('api_description', '')
                                api_name = analysis.get('api_name', 'API')
                                
                                print(f"[ToolNode] 📝 Using extracted API description ({len(api_desc)} chars)")
                                
                                task_content = f"""Create an MCP Server for: {api_name}

API Description:
{api_desc}"""
                                tool_call_copy['args'] = {'task': task_content}
                                print(f"[ToolNode] ✅ Fixed with LLM-extracted task (confidence: {analysis.get('confidence')})")
                            else:
                                # Fallback: use the full user message
                                print(f"[ToolNode] ⚠️ LLM didn't identify MCP request or no API description")
                                print(f"[ToolNode] Using full user message as fallback")
                                tool_call_copy['args'] = {'task': user_message}
                        else:
                            print(f"[ToolNode] ❌ No user message found, using fallback")
                            tool_call_copy['args'] = {'task': 'Please process the user request from the conversation history'}
                    
                    fixed_tool_calls.append(tool_call_copy)
                
                # If we needed to fix, create a NEW AIMessage with fixed tool_calls
                if needs_fix:
                    print(f"[ToolNode] Creating new AIMessage with fixed tool_calls")
                    task_preview = fixed_tool_calls[0].get('args', {}).get('task', '')[:150]
                    print(f"[ToolNode] Task preview: {task_preview}...")
                    new_ai_message = AIMessage(
                        content=msg.content,
                        tool_calls=fixed_tool_calls,
                        id=msg.id if hasattr(msg, 'id') else None
                    )
                    # Replace the message in the list
                    messages[actual_idx] = new_ai_message
                    print(f"[ToolNode] ✅ Replaced AIMessage at index {actual_idx}")
                
                break  # Only process the last AIMessage with tool_calls
        
        # Create new state with fixed messages
        fixed_state = dict(state)
        fixed_state["messages"] = messages
        
        # Now execute the tools with fixed state
        tool_node = ToolNode(supervisor_tools)
        result = await tool_node.ainvoke(fixed_state)
        return result
        
    except Exception as e:
        print(f"[ToolNode] ❌ Error in tools_node_wrapper: {e}")
        import traceback
        traceback.print_exc()
        # Try to continue with original state
        tool_node = ToolNode(supervisor_tools)
        return await tool_node.ainvoke(state)


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
        # Combine system prompt into first user message to avoid template issues
        combined_messages = list(messages)
        if combined_messages and hasattr(combined_messages[0], 'content'):
            first_msg = combined_messages[0]
            combined_content = f"[SYSTEM]\n{system_prompt}\n\n[MESSAGE]\n{first_msg.content}"
            combined_messages[0] = HumanMessage(content=combined_content)
        else:
            combined_messages = [HumanMessage(content=f"[SYSTEM]\n{system_prompt}\n\n[MESSAGE]\n{str(messages)}")]
        response = await llm.ainvoke(combined_messages)
    else:
        # Check if this is an MCP Server creation request
        is_mcp_request = False
        for msg in messages:
            if isinstance(msg, HumanMessage):
                content = str(msg.content).lower()
                if any(keyword in content for keyword in ['mcp server', 'create a mcp', 'api description', 'api documentation']):
                    is_mcp_request = True
                    break
        
        # Force tool call for MCP requests
        if is_mcp_request:
            print(f"[Supervisor] 🎯 Detected MCP Server request - forcing tool call: delegate_to_examiner_agent")
            try:
                llm_with_tools = llm.bind_tools(
                    supervisor_tools, 
                    tool_choice="delegate_to_examiner_agent"
                )
            except Exception as e:
                print(f"[Supervisor] ❌ Error binding tools: {e}")
                llm_with_tools = llm.bind_tools(supervisor_tools)
        else:
            # Auto mode for other requests
            llm_with_tools = llm.bind_tools(supervisor_tools, tool_choice="auto")
        
        # Combine system prompt with messages to avoid template issues
        combined_messages = list(messages)
        if combined_messages and hasattr(combined_messages[0], 'content'):
            first_msg = combined_messages[0]
            combined_content = f"[SYSTEM]\n{system_prompt}\n\n[MESSAGE]\n{first_msg.content}"
            combined_messages[0] = HumanMessage(content=combined_content)
        else:
            combined_messages = [HumanMessage(content=f"[SYSTEM]\n{system_prompt}\n\n[MESSAGE]\n{str(messages)}")]
        
        # Get response from LLM
        response = await llm_with_tools.ainvoke(combined_messages)
    
    # IMPORTANT: Check if tool calls exist to determine routing
    # If tool_calls present, go to tools node for execution
    # Otherwise go to end
    has_tool_calls = hasattr(response, 'tool_calls') and response.tool_calls
    
    # FALLBACK: If model outputs JSON text instead of tool_calls, parse it
    if not has_tool_calls and hasattr(response, 'content'):
        content = str(response.content)
        # Check if response contains tool-related keywords
        if 'delegate_to_generator_agent' in content:
            try:
                import re
                
                # Strategy: Extract the task content after "task":
                # The task value starts after "task": " and contains the API documentation
                
                # Find where task content starts
                task_start_match = re.search(r'"task"\s*:\s*"', content)
                
                if task_start_match:
                    task_start = task_start_match.end()
                    
                    # Extract everything after "task": " until we find the closing pattern
                    # Need to handle escaped quotes inside the string
                    remaining = content[task_start:]
                    
                    # Find the actual end - look for unescaped quote followed by } or ]
                    # Count brackets to find proper closing
                    task_value = ""
                    i = 0
                    while i < len(remaining):
                        char = remaining[i]
                        
                        # Handle escape sequences
                        if char == '\\' and i + 1 < len(remaining):
                            task_value += remaining[i:i+2]
                            i += 2
                            continue
                        
                        # Check for end of string value
                        if char == '"':
                            # This is the closing quote
                            break
                        
                        task_value += char
                        i += 1
                    
                    # Clean up escaped characters
                    task_value = task_value.replace('\\n', '\n').replace('\\t', '\t').replace('\\"', '"')
                    
                    if task_value and len(task_value) > 50:  # Ensure we got meaningful content
                        response.tool_calls = [{
                            'name': 'delegate_to_examiner_agent',
                            'args': {'task': task_value},
                            'id': 'call_fallback_001'
                        }]
                        has_tool_calls = True
                        print(f"[Supervisor] ✅ Parsed tool_call from text response (extracted {len(task_value)} chars)")
                else:
                    # Fallback: Pass the entire content as task
                    # Remove the JSON wrapper and markdown blocks
                    clean_content = re.sub(r'```json\s*', '', content)
                    clean_content = re.sub(r'```', '', clean_content)
                    clean_content = re.sub(r'\{\s*"tool_calls".*?"task"\s*:\s*"?', '', clean_content, flags=re.DOTALL)
                    
                    response.tool_calls = [{
                        'name': 'delegate_to_examiner_agent',
                        'args': {'task': content},  # Pass original content
                        'id': 'call_fallback_001'
                    }]
                    has_tool_calls = True
                    print(f"[Supervisor] ✅ Parsed tool_call from text response (fallback - full content)")
                        
            except Exception as e:
                print(f"[Supervisor] ⚠️  Failed to parse JSON from response: {e}")
    
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


def should_continue_after_tools(state: AgentState) -> Literal["examiner", "generator", "end"]:
    """Determine next step after tools execution"""
    messages = state["messages"]
    
    # Check the last tool message for delegation
    for msg in reversed(messages):
        if isinstance(msg, ToolMessage):
            content = str(msg.content)
            if "DELEGATE_TO_EXAMINER" in content:
                return "examiner"
            if "DELEGATE_TO_GENERATOR" in content:
                return "generator"
    
    return "end"


async def supervisor_final_node(state: AgentState) -> AgentState:
    """Supervisor reviews generator results and creates final response"""
    messages = state["messages"]
    
    # Get the generator's output
    last_content = str(messages[-1].content) if messages else ""
    
    # Create final summary (using async) - combine system prompt with content
    combined_prompt = f"""[SYSTEM INSTRUCTION]
Summarize the results from the generator agent into a cohesive response.

[RESULTS TO SUMMARIZE]
{last_content}"""
    
    summary_response = await llm.ainvoke([
        HumanMessage(content=combined_prompt)
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
    workflow.add_node("tools", tools_node_wrapper)
    workflow.add_node("examiner", examiner_agent_node)
    workflow.add_node("generator", generator_agent_node)
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
            "examiner": "examiner",
            "generator": "generator",
            "end": END
        }
    )
    
    # Examiner goes back to tools if it wants to delegate to generator
    # Or we can link it directly
    workflow.add_edge("examiner", "generator")
    
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