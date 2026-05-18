from typing import Sequence, List
from typing_extensions import TypedDict, Annotated, NotRequired
import operator
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage

class InputState(TypedDict):
    """User-facing input state - only requires messages"""
    messages: Annotated[Sequence[HumanMessage | AIMessage | SystemMessage | ToolMessage], operator.add]
    raw_api_doc: NotRequired[str]
    trace_id: NotRequired[str]
    experiment_id: NotRequired[str]
    session_id: NotRequired[str]
    build_request_id: NotRequired[str]
    user_id: NotRequired[str]
    workspace_id: NotRequired[str]
    email: NotRequired[str]
    memory_scope: NotRequired[str]

class AgentState(TypedDict):
    """Internal overall state for the multi-agent system.
    
    Phase 2 additions:
    - history: Danh sách tóm tắt các bước đã thực hiện (cho Supervisor biết ngữ cảnh)
    - retry_count: Số lần Supervisor đã retry (guard tránh infinite loop)
    - current_plan: Kế hoạch hiện tại mà Supervisor đang theo (LLM-decided)
    """
    messages: Annotated[Sequence[HumanMessage | AIMessage | SystemMessage | ToolMessage], operator.add]
    next_agent: str
    final_response: str
    # Phase 2: Dynamic routing fields
    history: Annotated[List[str], operator.add] # Track of completed steps: ["examiner: done", "generator: done"]
    retry_count: int         # Number of supervisor retries (prevents infinite loop)
    current_plan: str        # Current plan decided by Supervisor LLM
    is_complete: bool        # Explicit trigger: True if task is finished successfully
    
    # Technical Data (Explicit state passing)
    raw_api_doc: str         # The original verbatim API documentation from user
    enriched_context: str    # RAG data and technical analysis from Examiner
    trace_id: NotRequired[str]            # Research trace id for cross-service correlation
    experiment_id: NotRequired[str]       # Research experiment id
    session_id: NotRequired[str]          # Chat/session id
    build_request_id: NotRequired[str]    # MCP build request id
    server_id: NotRequired[str]           # Generated server id when available

def is_human_message(msg) -> bool:
    """Helper to robustly identify human messages in various representations."""
    if isinstance(msg, HumanMessage):
        return True
    
    # Check for string representation in case it's serialized
    m_type = str(getattr(msg, "type", "")).lower()
    m_role = str(getattr(msg, "role", "")).lower()
    
    # Handle langchain-style and raw dict-style roles
    if m_type in ("human", "user") or m_role in ("human", "user"):
        return True
    if isinstance(msg, dict):
        d_type = str(msg.get("type", "")).lower()
        d_role = str(msg.get("role", "")).lower()
        if d_type in ("human", "user") or d_role in ("human", "user"):
            return True
    return False

def is_ai_message(msg) -> bool:
    """Helper to robustly identify AI messages."""
    if isinstance(msg, AIMessage):
        return True
    m_type = str(getattr(msg, "type", "")).lower()
    m_role = str(getattr(msg, "role", "")).lower()
    if m_type in ("ai", "assistant") or m_role in ("ai", "assistant"):
        return True
    if isinstance(msg, dict):
        d_type = str(msg.get("type", "")).lower()
        d_role = str(msg.get("role", "")).lower()
        if d_type in ("ai", "assistant") or d_role in ("ai", "assistant"):
            return True
    return False

def is_tool_message(msg) -> bool:
    """Helper to robustly identify Tool messages."""
    if isinstance(msg, ToolMessage):
        return True
    m_type = str(getattr(msg, "type", "")).lower()
    if m_type == "tool":
        return True
    if isinstance(msg, dict):
        if msg.get("type") == "tool" or "tool_call_id" in msg:
            return True
    return False

def get_message_content(msg) -> str:
    """Helper to robustly get content from a message."""
    if hasattr(msg, "content"):
        return str(msg.content)
    if isinstance(msg, dict):
        return str(msg.get("content", ""))
    return str(msg)
