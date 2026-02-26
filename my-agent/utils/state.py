from typing import TypedDict, Annotated, Sequence
import operator
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage

class InputState(TypedDict):
    """User-facing input state - only requires messages"""
    messages: Annotated[Sequence[HumanMessage | AIMessage | SystemMessage | ToolMessage], operator.add]

class AgentState(TypedDict):
    """Internal overall state for the multi-agent system"""
    messages: Annotated[Sequence[HumanMessage | AIMessage | SystemMessage | ToolMessage], operator.add]
    next_agent: str
    final_response: str
