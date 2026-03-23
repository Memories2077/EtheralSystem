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
    
    rag_context = ""
    if related_contents:
        rag_context = "Found the following related historical data and patterns:\n\n"
        for i, res in enumerate(related_contents, 1):
            meta = res["metadata"]
            type_label = meta.get("type", "unknown")
            rag_context += f"--- Related Item {i} (Type: {type_label}, Source: {meta.get('filename', 'unknown')}) ---\n"
            # Increase truncation to 10,000 chars for better context
            rag_context += f"Content Snippet:\n{res['content'][:10000]}\n\n"
    else:
        rag_context = "No related historical data found in the vector database."
        
    # 3. Enrich Context using LLM
    from prompts.examiner import EXAMINER_MAIN_PROMPT
    
    enrichment_prompt = f"""{EXAMINER_MAIN_PROMPT}

USER REQUEST / API DOCS:
{api_doc}

RETRIEVED RAG CONTEXT:
{rag_context}

INSTRUCTIONS:
Synthesize the above information into a single "ENRICHED TASK" for the Generator Agent.
Maintain the exact format required:
API_DOCUMENTATION:
...
ENRICHED_CONTEXT (RAG):
...
USER_ID: ...
EMAIL: ...

Only output the synthesized task text, no conversational filler."""

    print("[Examiner] 🤖 Synthesizing enriched context...")
    response = await llm.ainvoke([HumanMessage(content=enrichment_prompt)])
    enriched_task = str(response.content).strip()
    
    # 4. Prepare return state
    # We return a message that looks like a delegation to generator
    delegation_msg = f"DELEGATE_TO_GENERATOR: {enriched_task}"
    
    print(f"[Examiner] ✅ Context enriched. Delegating to Generator.")
    
    return {
        "messages": [AIMessage(content=delegation_msg)],
        "next_agent": "generator",
        "final_response": ""
    }
