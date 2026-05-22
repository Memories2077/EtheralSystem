## Gemini-to-Chroma Smoke

Command:

```bash
.venv/bin/python apps/langChain-application/my_agent/scripts/check_gemini_chroma.py
```

Result:

```json
{
  "model": "gemini-embedding-2",
  "embedding_dimension": 3072,
  "collection": "gemini_embedding_2_smoke",
  "count_after_upsert": 1,
  "top_id": "smoke-doc-1",
  "top_distance": 0.3104317,
  "top_document": "Gemini embedding smoke document: ChromaDB can store MCP server research context vectors."
}
```

Cleanup:

```json
{"cleanup": "deleted temporary collection", "collection": "gemini_embedding_2_smoke"}
```

Follow-up Chroma collection list returned `[]`.
