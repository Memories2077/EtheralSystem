from langchain_openai import ChatOpenAI
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from typing import TypedDict, Annotated, Sequence, Literal
import operator
from dotenv import load_dotenv
import json
from prompts.supervisor import SUPERVISOR_MAIN_PROMPT
from agents.sub_agents.generator_agent import generator_agent_node
from pydantic import SecretStr
import os
load_dotenv()

llm = ChatOpenAI(
    model="iec-model",
    temperature=0.5,
    base_url="https://llmapi.iec-uit.com/v1",
    api_key=SecretStr(os.getenv("OPENAI_API_KEY", "<API_KEY>"))
)

class AgentState(TypedDict):
    """State for the multi-agent system"""
    messages: Annotated[Sequence[HumanMessage | AIMessage | SystemMessage | ToolMessage], operator.add]
    next_agent: str
    final_response: str

def supervisor_node(state: AgentState) -> AgentState:
    """Supervisor agent that delegates tasks to sub-agents"""
    messages = state["messages"]
    
    system_prompt = SUPERVISOR_MAIN_PROMPT
    
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
            elif "generator" in tool_call["name"].lower():
                next_agent = "generator"
                break
    
    return {
        "messages": [response],
        "next_agent": next_agent,
        "final_response": ""
    }

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
def delegate_to_generator_agent(task: str) -> str:
    """Delegate a content generation task to the Generator Agent.
    
    Args:
        task: The content generation task to perform
        
    Returns:
        Result from generator agent
    """
    return f"DELEGATE_TO_GENERATOR: {task}"

supervisor_tools = [delegate_to_weather_agent, delegate_to_social_agent, delegate_to_generator_agent]