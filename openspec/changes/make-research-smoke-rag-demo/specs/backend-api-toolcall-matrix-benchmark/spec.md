## MODIFIED Requirements

### Requirement: Research runner exports after each API-doc batch
The system SHALL export benchmark artifacts after each selected API-doc batch completes.

#### Scenario: Per API-doc export is triggered
- **WHEN** all repeats and variants for one API doc finish
- **THEN** the runner invokes the research exporter for the active experiment and API-doc batch
- **AND** the exported files include raw JSONL references, aggregate CSV tables, and Markdown summaries for that completed API doc
- **AND** subsequent API-doc batches continue without overwriting the previous batch export

#### Scenario: Single command completes the demo flow
- **WHEN** `bun run research` completes successfully for the demo settings
- **THEN** the command has built all 12 planned cells, validated generated MCP servers, cleaned generated containers, and exported the API-doc batch report
- **AND** the command exits non-zero if any required build, validation, cleanup, or export stage fails without a recorded diagnostic

#### Scenario: Single-build smoke verifies the RAG demo path
- **WHEN** `bun run research -- --smoke` completes successfully with default smoke settings
- **THEN** the command has built one `jsonplaceholder-input-doc` cell using the `dynamic-rag-on` variant through the chatbot to LangChain/MetaClaw to mcp-gen flow
- **AND** it has validated generated MCP metadata and direct MCP tool calls, cleaned the generated container, and exported the API-doc batch report
- **AND** the RAG-on case was seeded into the Gemini Chroma collection before the build request reached the examiner
- **AND** strict smoke validation confirms non-empty real LangGraph RAG evidence with populated precision, recall, and MRR retrieval metrics
- **AND** default and full dry-runs still report the 12-build and 36-build matrix plans for later parameterized execution
- **AND** explicit smoke overrides such as `--variants=static-rag-off` remain available for targeted checks
