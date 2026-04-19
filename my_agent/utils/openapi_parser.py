import json
import logging
from typing import Dict, Any, List, Optional
from langchain_core.messages import HumanMessage

logger = logging.getLogger(__name__)

async def extract_structured_context(rag_items: List[Dict[str, Any]], llm) -> List[Dict[str, Any]]:
    """
    Extracts structured technical information from RAG chunks using a constrained LLM call.
    Ensures zero-summarization by forcing JSON output.
    """
    structured_results = []
    
    for item in rag_items:
        content = item.get("content", "")
        if not content:
            continue
            
        prompt = f"""You are a technical data extractor. Given a text chunk from API documentation,
extract ONLY the following fields as JSON. Do NOT explain, summarize, or add commentary.

Output EXACTLY this JSON structure:
{{
  "base_url": "<string or null>",
  "auth_scheme": "<bearer|api_key|oauth2|basic|none>",
  "auth_details": {{}},
  "endpoints": [
    {{
      "method": "<GET|POST|PUT|DELETE|PATCH>",
      "path": "<string>",
      "parameters": [
        {{
          "name": "<exact_field_name>",
          "in": "<query|path|header|body>",
          "type": "<string|integer|boolean|array|object>",
          "required": <true|false>,
          "enum": [<values or null>],
          "pattern": "<regex or null>"
        }}
      ]
    }}
  ]
}}

If a field cannot be determined, use null. Do NOT omit fields. Use the original naming convention (camelCase vs snake_case).

TEXT CHUNK:
---
{content}
---"""
        
        try:
            logger.info(f"[OpenAPIParser] Extracting structure from chunk: {item.get('id', 'unknown')}")
            response = await llm.ainvoke([HumanMessage(content=prompt)])
            response_content = str(response.content).strip()
            
            # Clean up potential markdown code blocks
            if "```json" in response_content:
                response_content = response_content.split("```json")[1].split("```")[0].strip()
            elif "```" in response_content:
                response_content = response_content.split("```")[1].split("```")[0].strip()
                
            structured_data = json.loads(response_content)
            
            # Keep original metadata and ID
            structured_results.append({
                "id": item.get("id"),
                "metadata": item.get("metadata", {}),
                "technical_data": structured_data
            })
            
        except Exception as e:
            logger.error(f"[OpenAPIParser] ❌ Extraction failed for chunk {item.get('id')}: {e}")
            # Fallback to raw content if extraction fails to ensure no data loss
            structured_results.append({
                "id": item.get("id"),
                "metadata": item.get("metadata", {}),
                "raw_content": content,
                "error": str(e)
            })
            
    return structured_results
