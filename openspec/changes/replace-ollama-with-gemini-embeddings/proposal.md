## Why

The RAG embedding path currently depends on an Ollama embedding container that is not working reliably, which blocks Chroma-backed retrieval for the LangGraph agent and adds unnecessary Compose startup surface. Gemini embedding 2 is already reachable with the checked-in environment configuration, so embeddings can move to the existing Google provider path and remove the failing local model service.

## What Changes

- Replace the LangGraph RAG embedding provider from Ollama `qwen3-embedding:0.6b` to Gemini `gemini-embedding-2`.
- Store and query Gemini-generated embeddings in the existing ChromaDB service.
- Remove the Ollama Compose service, agent `OLLAMA_BASE_URL` wiring, Ollama dependency edges, persistent Ollama volume, and obsolete Ollama check scripts or dependencies when they are no longer used.
- Update validation expectations so the baseline Compose stack requires Chroma but does not require Ollama.
- Keep `RAG_ENABLED=false` behavior unchanged for benchmark and validation runs that intentionally disable retrieval.
- Verify the embedding path with a focused Gemini-to-Chroma smoke before building application images.

## Capabilities

### New Capabilities
- `rag-gemini-embeddings`: Covers Gemini embedding 2 as the supported RAG embedding provider and its ChromaDB persistence/query behavior.

### Modified Capabilities
- `mcp-flow-validation`: Baseline service expectations should no longer include Ollama after the embedding path moves to Gemini.

## Impact

- Affected code: `apps/langChain-application/my_agent/utils/vector_db.py`, LangChain application Python dependencies, Docker Compose agent environment and dependency wiring, Ollama utility scripts, and project documentation that names Ollama as baseline infrastructure.
- Affected systems: LangGraph agent RAG retrieval, ChromaDB vector persistence, Docker Compose local/dev stack, research matrix smoke validation, and cleanup/image-retention logic.
- External dependency: Google Gen AI embeddings through `GEMINI_API_KEY` and model `gemini-embedding-2`.
- Removal impact: local Ollama embedding service and its persistent volume are no longer required for EtheralSystem RAG.
