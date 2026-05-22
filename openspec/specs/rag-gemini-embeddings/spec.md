# rag-gemini-embeddings Specification

## Purpose
Define the supported Gemini embedding path for LangGraph agent RAG indexing and retrieval.

## Requirements
### Requirement: RAG embeddings use Gemini embedding 2
The system SHALL use Gemini `gemini-embedding-2` as the supported embedding provider for LangGraph agent RAG indexing and retrieval.

#### Scenario: Embedding model is configured from Gemini settings
- **WHEN** RAG indexing or retrieval needs to embed text
- **THEN** the agent uses Gemini `gemini-embedding-2` by default
- **AND** the model can be overridden through an environment variable without reintroducing Ollama-specific configuration
- **AND** authentication uses the existing Gemini API key configuration

#### Scenario: Gemini collection is isolated from old Ollama vectors
- **WHEN** the agent opens the Chroma collection for RAG
- **THEN** it uses `mcp_servers_hierarchical_gemini` by default
- **AND** the collection name can be overridden through `CHROMA_COLLECTION_NAME`
- **AND** old Ollama-indexed collection data is not deleted automatically

#### Scenario: RAG-disabled runs do not require embeddings
- **WHEN** a benchmark or validation run executes with `RAG_ENABLED=false`
- **THEN** the run does not require a Gemini embedding call
- **AND** disabling RAG does not require Ollama or any local embedding service

### Requirement: Gemini embeddings are persisted in ChromaDB
The system SHALL store and retrieve RAG vectors in the existing ChromaDB service using explicit Gemini-generated embeddings.

#### Scenario: Document embeddings are stored
- **WHEN** the agent indexes MCP artifact content for RAG
- **THEN** it writes Chroma records containing Gemini-generated embedding vectors, document text, and safe metadata
- **AND** the Chroma collection dimension matches the Gemini embedding vector dimension

#### Scenario: Query embeddings retrieve stored context
- **WHEN** the agent searches for MCP artifact context
- **THEN** it embeds the query with the same Gemini embedding model
- **AND** Chroma returns ranked results from the stored Gemini embedding collection
- **AND** low-relevance filtering and existing research metric events remain available

#### Scenario: Provider failure is observable
- **WHEN** Gemini embedding generation fails because of missing credentials, provider errors, or network failure
- **THEN** indexing or retrieval records a clear failure diagnostic
- **AND** the system does not persist secrets, API keys, raw private prompt text, or full provider responses in diagnostics

### Requirement: Ollama is not required for RAG infrastructure
The system SHALL remove Ollama as a required local infrastructure service for RAG embeddings.

#### Scenario: Compose starts without Ollama
- **WHEN** the root Docker Compose stack starts the agent RAG dependencies
- **THEN** ChromaDB remains available as the vector store
- **AND** no Ollama service, Ollama volume, `OLLAMA_BASE_URL`, or agent dependency on Ollama is required

#### Scenario: Obsolete Ollama code paths are removed
- **WHEN** the Gemini embedding migration is implemented
- **THEN** unused Ollama embedding imports, Python dependencies, utility scripts, and documentation references are removed or rewritten
- **AND** no remaining runtime code path requires `qwen3-embedding:0.6b`
