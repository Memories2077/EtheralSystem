## 1. Pre-Build Verification

- [x] 1.1 Add or document a repeatable Gemini-to-Chroma smoke that embeds text with `gemini-embedding-2`, upserts a temporary Chroma record, queries it back, and cleans up the temporary collection.
- [x] 1.2 Run the smoke without building images and record the embedding dimension, Chroma count, and top query result.
- [x] 1.3 Verify `RAG_ENABLED=false` runs do not require a Gemini embedding call or any local embedding service.

## 2. Agent Embedding Migration

- [x] 2.1 Add the LlamaIndex Google GenAI embedding dependency required by the agent runtime.
- [x] 2.2 Replace `OllamaEmbedding` setup in `vector_db.py` with Gemini `gemini-embedding-2` configuration backed by `GEMINI_API_KEY` and an overrideable embedding model env var.
- [x] 2.3 Update embedding helper names, logs, diagnostics, and failure behavior so provider errors are clear and secrets are not persisted.
- [x] 2.4 Confirm Chroma indexing/search still uses the existing collection, LlamaIndex storage context, Mongo docstore, AutoMergingRetriever, relevance filtering, and research metric events.

## 3. Ollama Removal

- [x] 3.1 Remove the Ollama service, port, volume, `OLLAMA_BASE_URL`, and agent `depends_on` entry from root Compose.
- [x] 3.2 Remove unused Ollama embedding dependencies, imports, scripts, and docs references after verifying no runtime code path uses them.
- [x] 3.3 Update Dockerfile and cleanup helpers so baseline infrastructure names Chroma but not Ollama.

## 4. Spec And Validation Updates

- [x] 4.1 Update mcp-flow validation expectations so baseline Compose services exclude Ollama.
- [x] 4.2 Add focused unit/import coverage for the Gemini embedding adapter configuration.
- [x] 4.3 Run `openspec validate replace-ollama-with-gemini-embeddings --strict`.
- [x] 4.4 Run focused Python tests for LangGraph agent vector/RAG behavior without building images.
