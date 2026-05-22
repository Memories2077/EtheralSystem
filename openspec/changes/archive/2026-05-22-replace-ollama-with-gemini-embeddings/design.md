## Context

The LangGraph agent RAG path is implemented in `apps/langChain-application/my_agent/utils/vector_db.py` with LlamaIndex, ChromaDB, MongoDB docstore, and a global `Settings.embed_model`. The current embedding model is `OllamaEmbedding(model_name="qwen3-embedding:0.6b", base_url=OLLAMA_BASE_URL)`, which requires the `ollama` Compose service and makes the agent depend on a local model container before it can index or retrieve artifacts.

The repository already uses Gemini for generation through `GEMINI_API_KEY`, and a pre-change smoke verified that `google.genai.Client().models.embed_content(model="gemini-embedding-2", ...)` returns a 3072-dimensional vector. The same smoke created a temporary Chroma collection, upserted one document with the Gemini vector, queried it with another Gemini vector, and received the expected document back.

## Goals / Non-Goals

**Goals:**
- Make Gemini `gemini-embedding-2` the supported embedding model for the LangGraph agent RAG path.
- Preserve the existing LlamaIndex indexing, AutoMergingRetriever, ChromaDB collection, and MongoDB docstore architecture.
- Remove Ollama from the root Compose stack and from agent service dependency wiring.
- Remove unused Ollama Python dependencies and helper scripts once no code imports them.
- Keep RAG-disabled benchmark modes working without requiring embedding calls.
- Add a focused smoke or unit validation that proves Gemini embeddings can be written to and queried from Chroma before running image builds.

**Non-Goals:**
- Change the generation LLM provider, default chat model, or MetaClaw fallback behavior.
- Replace ChromaDB or MongoDB docstore.
- Rework retrieval ranking, chunking, or the existing research-metrics aggregation model beyond provider metadata updates.
- Build production images during proposal validation.

## Decisions

1. Use the LlamaIndex Google GenAI embedding integration as the agent embedding adapter.

   The implementation should replace `llama_index.embeddings.ollama.OllamaEmbedding` with `llama_index.embeddings.google_genai.GoogleGenAIEmbedding` and add `llama-index-embeddings-google-genai` to the LangChain application dependencies. This keeps the existing `Settings.embed_model` flow intact for `VectorStoreIndex`, retrieval, and the compatibility `get_embeddings()` helper. A direct custom `google.genai` wrapper was considered, but it would duplicate adapter behavior that LlamaIndex already provides and would increase maintenance surface.

2. Configure the embedding model and collection through environment-backed constants.

   The default embedding model should be `gemini-embedding-2`, with `GEMINI_EMBEDDING_MODEL` available for future migrations. Authentication should use `GEMINI_API_KEY` from the existing `.env`/Compose environment. The default Chroma collection should change to `mcp_servers_hierarchical_gemini`, with `CHROMA_COLLECTION_NAME` available for override. This avoids mixing Gemini 3072-dimensional vectors with old Ollama-indexed data. Missing API key or dependency errors should fail RAG indexing/search with clear diagnostics while preserving the existing RAG-disabled behavior.

3. Keep ChromaDB as the only local vector infrastructure service.

   The root Compose stack should keep `chromadb` and remove `ollama`, `ollama_data`, `OLLAMA_BASE_URL`, and `agent.depends_on: ollama`. Agent startup should depend on Chroma and the manager services only. Documentation and OpenSpec baseline expectations should be updated so cleanup and validation preserve Chroma but do not expect Ollama.

4. Treat the pre-build Gemini-to-Chroma smoke as a required implementation checkpoint.

   Before building images, the implementer should run a focused smoke against local Chroma that embeds a document with `gemini-embedding-2`, upserts it with explicit embeddings, queries by a second Gemini embedding, verifies the expected document is top-ranked, and deletes the temporary collection. This keeps API/model failures separate from container build failures.

## Risks / Trade-offs

- Google API availability or quota can block RAG indexing/search -> emit clear error diagnostics, keep `RAG_ENABLED=false` paths independent, and document that Gemini embeddings require outbound API access.
- Embedding dimension changes could conflict with existing Chroma collection data -> use the new Gemini collection by default and leave old Ollama-indexed data untouched unless an operator explicitly overrides the collection name.
- New dependency may not already be present in the agent image -> update `pyproject.toml` and run focused import tests before image build.
- Removing Ollama can break stale docs/tests that still expect the container -> update Compose references, cleanup allowlists, scripts, and OpenSpec requirements in the same change.
