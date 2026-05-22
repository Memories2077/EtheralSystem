## ADDED Requirements

### Requirement: Benchmark API-doc builds execute the examiner path
The system SHALL route benchmark API-document MCP creation builds through the LangGraph examiner before generator.

#### Scenario: Benchmark create request contains API documentation
- **WHEN** the backend tool-call matrix submits an API-doc MCP creation request
- **THEN** the LangGraph flow delegates to examiner before generator
- **AND** the examiner records a correlated `langgraph-agent` RAG event for the build request
- **AND** the generator receives an enriched task containing `ORIGINAL_PROMPT`, `API_DOCUMENTATION`, and `ENRICHED_CONTEXT (RAG)` sections

#### Scenario: Backend fallback events are present
- **WHEN** backend stream fallback events are recorded for a completed LangGraph build
- **THEN** the benchmark treats them as diagnostic-only for MAPR RAG retrieval metrics
- **AND** they do not satisfy the requirement for real examiner evidence

### Requirement: Benchmark validates one-build metric completeness
The system SHALL provide a one-build smoke validation that confirms RAG evidence, token estimates, and cost estimates before larger runs.

#### Scenario: One-build smoke succeeds
- **WHEN** the smoke run builds `jsonplaceholder-input-doc` with `dynamic-rag-on`
- **THEN** the generated run evidence includes a real `langgraph-agent` `examiner_completed` event
- **AND** the run-level output includes non-redacted numeric estimated prompt tokens, completion tokens, total tokens, and effective Gemini 2.5 Flash estimated cost for all benchmark LLM paths when estimates are available
- **AND** the exported report marks RAG and usage evidence as complete

#### Scenario: One-build smoke fails evidence validation
- **WHEN** the smoke run completes a build but lacks real examiner evidence or numeric usage evidence
- **THEN** the validation exits with a failure diagnostic that names the missing evidence group
- **AND** the result is not accepted as a paper-ready benchmark run

### Requirement: Benchmark cleanup removes generated artifacts safely
The system SHALL clean up generated MCP containers and no-longer-needed generated or dangling images after smoke validation.

#### Scenario: Generated server cleanup runs after smoke
- **WHEN** a smoke build creates an MCP server container
- **THEN** cleanup removes that generated container through the manager or Docker by generated server identity
- **AND** the run record captures cleanup status, removed count, skipped count, failed count, and diagnostic if cleanup fails

#### Scenario: Image cleanup is scoped
- **WHEN** image cleanup runs after smoke validation
- **THEN** it removes only generated MCP images that are no longer referenced or Docker dangling images
- **AND** it does not remove active Compose service images required for `agent-service`, `chatbot-backend`, `mcp-gen`, Mongo, Chroma, proxy, or frontend
