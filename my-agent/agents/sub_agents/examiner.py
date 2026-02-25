import asyncio
import os
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
from mcp_use.client import MCPClient
from mcp_use.agents.adapters.langchain_adapter import LangChainAdapter
from dotenv import load_dotenv
from langchain.agents import create_agent
from pydantic import SecretStr

from config import load_prompt, AGENT_CONFIG, API_CONFIG

# Import AgentState from the new location
from utils.state import AgentState

load_dotenv()

async def examiner_node(state: AgentState) -> AgentState:
    """
    The Examiner Agent node.
    This node is a self-contained agent that interacts with an MCP Server.
    It receives a task, executes it using its own internal agent executor,
    and returns a final summary of its actions.
    """
    print("[Examiner] 🕵️ Examiner Node started.")
    
    task_content = ""
    
    # 1. Extract the task from the state
    last_message = state["messages"][-1]
    if isinstance(last_message, ToolMessage):
        # Extract task from "DELEGATE_TO_EXAMINER: [task]"
        raw_content = str(last_message.content)
        if "DELEGATE_TO_EXAMINER:" in raw_content:
            task_content = raw_content.replace("DELEGATE_TO_EXAMINER:", "").strip()
            print(f"[Examiner] Task received: {task_content}")
    
    if not task_content:
        print("[Examiner] ⚠️ No task found in the last message.")
        return {
            "messages": [AIMessage(content="Examiner Agent Error: No task was provided.")],
            "next_agent": "supervisor_final",
            "final_response": "Error: No task was provided to the Examiner Agent."
        }

    try:
        # 2. Set up the internal agent
        # Initialize MCP client
        client = MCPClient.from_config_file("my-agent/tools/examiner_tools/mcp_config.json")
        print("[Examiner] MCP Client initialized.")

        api_key = SecretStr(API_CONFIG["gemini_api_key"])
        config = AGENT_CONFIG["examiner_agent"]
        system_prompt = config["prompt_file"]
        llm = ChatGoogleGenerativeAI(model=config["model"], api_key=api_key)

        # Create adapter instance
        adapter = LangChainAdapter()

        # Get LangChain tools from the MCP Server
        tools = await adapter.create_tools(client)
        tool_names = [tool.name for tool in tools]
        print(f"[Examiner] Tools created from MCP Server: {tool_names}")

        # Create the internal agent executor that will autonomously use the tools
        agent_executor = create_agent(llm, tools)
        print("[Examiner] Internal agent executor created.")

        # 3. Invoke the internal agent with the task
        print("[Examiner] Invoking internal agent...")
        # The input to the agent should be a list of messages
        inputs = {"messages": [HumanMessage(content=task_content)]}
        
        # Use ainvoke to get the final result directly
        result = await agent_executor.ainvoke(inputs)
        
        # The output from create_agent is a dict with the final messages
        final_message = result["messages"][-1]
        summary_content = str(getattr(final_message, 'content', ''))
        
        print(f"[Examiner] Internal agent finished. Summary: {summary_content[:200]}...")

        # 4. Return the summary in the main graph's state
        return {
            "messages": [AIMessage(content=summary_content)],
            "next_agent": "supervisor_final",
            "final_response": summary_content
        }

    except Exception as e:
        print(f"[Examiner] ❌ An error occurred in the examiner node: {e}")
        import traceback
        traceback.print_exc()
        error_message = f"An error occurred in the Examiner Agent: {e}"
        return {
            "messages": [AIMessage(content=error_message)],
            "next_agent": "supervisor_final",
            "final_response": error_message
        }
