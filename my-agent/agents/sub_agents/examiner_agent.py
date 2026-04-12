import json
import re
from typing import Dict, Any, List
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from pydantic import SecretStr

from config import AGENT_CONFIG, API_CONFIG
from utils.state import AgentState
from utils.vector_db import search_mcp_artifacts

# Initialize LLM
api_key = SecretStr(API_CONFIG["gemini_api_key"])
llm = ChatGoogleGenerativeAI(model=AGENT_CONFIG["supervisor"]["model"], api_key=api_key)

async def examiner_agent_node(state: AgentState) -> AgentState:
    """
    Examiner Agent node:
    1. Extracts API documentation from the task.
    2. Performs RAG search in ChromaDB.
    3. Enriches the context with related historical data.
    4. Prepares the task for the Generator Agent.
    """
    print("[Examiner] 🕵️ Examiner Node started.")
    
    messages = state["messages"]
    last_message = messages[-1]
    
    # 1. Extract task content
    task_content = str(last_message.content)
    if "DELEGATE_TO_EXAMINER:" in task_content:
        task_content = task_content.replace("DELEGATE_TO_EXAMINER:", "").strip()
    
    # Extract API documentation for RAG search
    # We look for the section after API_DOCUMENTATION:
    api_doc = ""
    api_doc_match = re.search(r"API_DOCUMENTATION:\n(.*?)(?=\n\nUSER_ID:|\Z)", task_content, re.DOTALL)
    if api_doc_match:
        api_doc = api_doc_match.group(1).strip()
    else:
        api_doc = task_content # Fallback to whole task
        
    print(f"[Examiner] 🔍 API Doc extracted ({len(api_doc)} chars). Searching for related content...")
    
    # 2. Perform RAG Search
    related_contents = await search_mcp_artifacts(api_doc, n_results=3)
    
    # 3. Structured Technical Extraction (Zero-Summarization)
    from utils.openapi_parser import extract_structured_context
    print(f"[Examiner] 🤖 Extracting structured technical data from {len(related_contents)} RAG items...")
    rag_context_data = await extract_structured_context(related_contents, llm)
    rag_context_json = json.dumps(rag_context_data, indent=2)
    
    # 4. Extract User info to pass through
    user_id = "default_user"
    email = "user@example.com"
    user_id_match = re.search(r"USER_ID:\s*([^\n\r]*)", task_content)
    if user_id_match:
        user_id = user_id_match.group(1).strip()
    email_match = re.search(r"EMAIL:\s*([^\n\r]*)", task_content)
    if email_match:
        email = email_match.group(1).strip()

    # 5. Prepare Enriched Task (No LLM synthesis needed for the wrapper)
    enriched_task = f"""API_DOCUMENTATION:
{api_doc}

ENRICHED_CONTEXT (RAG):
{rag_context_json}

USER_ID: {user_id}
EMAIL: {email}"""

    # 6. Prepare return state
    delegation_msg = f"DELEGATE_TO_GENERATOR: {enriched_task}"
    
    print(f"[Examiner] ✅ Technical data extracted. Delegating to Generator.")
    
    return {
        "messages": [AIMessage(content=delegation_msg)],
        "next_agent": "generator",
        "final_response": ""
    }
