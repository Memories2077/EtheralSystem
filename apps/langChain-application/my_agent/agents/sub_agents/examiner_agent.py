import json
import re
from langchain_core.messages import AIMessage

from my_agent.config import AGENT_CONFIG
from my_agent.utils.state import AgentState, get_message_content
from my_agent.utils.vector_db import search_mcp_artifacts
from my_agent.utils.llm_factory import get_llm
from my_agent.utils.research_metrics import duration_since_ms, monotonic_ms, record_research_event, state_research_context

# Initialize LLM via factory
llm = get_llm(temperature=AGENT_CONFIG["examiner_agent"]["temperature"])


async def examiner_agent_node(state: AgentState) -> AgentState:
    """
    Examiner Agent node:
    1. Extracts API documentation from the task.
    2. Performs RAG search in ChromaDB.
    3. Enriches the context with related historical data.
    4. Prepares the task for the Generator Agent.
    """
    start_ms = monotonic_ms()
    print("[Examiner] 🕵️ Examiner Node started.")
    
    messages = state.get("messages", [])
    last_message = messages[-1] if messages else None
    
    # 1. Extract task content
    task_content = get_message_content(last_message) if last_message else ""
    if "DELEGATE_TO_EXAMINER:" in task_content:
        task_content = task_content.replace("DELEGATE_TO_EXAMINER:", "").strip()
    
    # 2. Extract API documentation for RAG search.
    # Keep state["raw_api_doc"] canonical if present; otherwise use parsed task content
    # without pretending the fallback was the original user prompt.
    canonical_raw_api_doc = state.get("raw_api_doc", "") or ""
    api_doc = canonical_raw_api_doc
    
    if not api_doc:
        print("[Examiner] ⚠️ raw_api_doc not found in state, falling back to message parsing.")
        api_doc_match = re.search(
            r"API_DOCUMENTATION:\s*(.*?)(?=\s*\n\nUSER_ID:|\s*\n\nEMAIL:|\s*\Z)",
            task_content,
            re.DOTALL,
        )
        api_doc = api_doc_match.group(1).strip() if api_doc_match else task_content.strip()

    # 3. Preserve original prompt separately from extracted API documentation.
    original_prompt = canonical_raw_api_doc or task_content
        
    print(f"[Examiner] 🔍 API Doc ready ({len(api_doc)} chars). Searching for related content...")
    
    # 4. Perform RAG Search
    related_contents = await search_mcp_artifacts(api_doc, n_results=3)
    
    # 5. Structured Technical Extraction (Zero-Summarization)
    from my_agent.utils.openapi_parser import extract_structured_context
    print(f"[Examiner] 🤖 Extracting structured technical data from {len(related_contents)} RAG items...")
    rag_context_data = await extract_structured_context(related_contents, llm)
    rag_context_json = json.dumps(rag_context_data, indent=2)
    
    # 6. Extract User info to pass through
    user_id = "default_user"
    email = "user@example.com"
    user_id_match = re.search(r"USER_ID:\s*([^\n\r]*)", task_content)
    if user_id_match:
        user_id = user_id_match.group(1).strip()
    email_match = re.search(r"EMAIL:\s*([^\n\r]*)", task_content)
    if email_match:
        email = email_match.group(1).strip()

    # 7. Prepare Enriched Task 
    # Passing BOTH original prompt and extracted doc to ensure no loss of intent
    enriched_task = f"""ORIGINAL_PROMPT:
{original_prompt}

API_DOCUMENTATION:
{api_doc}

ENRICHED_CONTEXT (RAG):
{rag_context_json}

USER_ID: {user_id}
{f"EMAIL: {email}" if email != "user@example.com" else ""}"""

    # 8. Prepare return state
    delegation_msg = f"DELEGATE_TO_GENERATOR: {enriched_task}"
    
    print(f"[Examiner] ✅ Technical data extracted. Enriched context saved to state.")
    await record_research_event(
        service="langgraph-agent",
        stage="rag",
        event_name="examiner_completed",
        status="success",
        duration_ms=duration_since_ms(start_ms),
        context=state_research_context(state),
        metrics={
            "api_doc_length": len(api_doc),
            "rag_returned_count": len(related_contents),
            "rag_context_item_count": len(rag_context_data),
            "rag_context_chars": len(rag_context_json),
        },
    )
    
    return {
        "messages": [AIMessage(content=delegation_msg)],
        "next_agent": "generator",
        "final_response": "",
        "history": [],
        "retry_count": state.get("retry_count", 0),
        "current_plan": state.get("current_plan", ""),
        "is_complete": state.get("is_complete", False),
        "enriched_context": rag_context_json,  # Store RAG data explicitly in state
        "raw_api_doc": canonical_raw_api_doc or api_doc  # Preserve original if available
    }
