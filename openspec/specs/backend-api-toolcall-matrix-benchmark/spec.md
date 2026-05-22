# backend-api-toolcall-matrix-benchmark Specification

## Purpose
TBD - created by archiving change add-backend-api-toolcall-matrix-benchmark. Update Purpose after archive.
## Requirements
### Requirement: Benchmark matrix is fixed and reproducible
The system SHALL provide a backend API E2E benchmark matrix for paper runs with fixed checked-in input API-doc cases, fixed variants, repeatable run metadata, and an explicit demo run shape.

#### Scenario: Demo matrix enumerates all required benchmark cells
- **WHEN** `bun run research` runs with default demo settings
- **THEN** it executes exactly 1 checked-in input API-doc case across 4 variants and 3 repeats for 12 build attempts
- **AND** every run records `experimentId`, `caseId`, `variantId`, `repeatIndex`, provider, model, git commit, and effective feature flags

#### Scenario: Full three-doc matrix is available
- **WHEN** the benchmark runs with explicit full API-doc settings
- **THEN** it can execute 3 checked-in input API-doc cases across 4 variants and 3 repeats for 36 build attempts
- **AND** every API-doc batch preserves the same fixture format, variant set, repeat count, and metadata fields as the demo run

#### Scenario: Variant flags are applied explicitly
- **WHEN** the benchmark runs a variant cell
- **THEN** `static-rag-off` uses static skill selection with RAG disabled in the Bun runner, Compose services, and LangChain application environment
- **AND** `static-rag-on` uses static skill selection with RAG enabled
- **AND** `dynamic-rag-off` uses dynamic skill selection with RAG disabled in the Bun runner, Compose services, and LangChain application environment
- **AND** `dynamic-rag-on` uses dynamic skill selection with RAG enabled

#### Scenario: Benchmark cases use checked-in formatted input docs
- **WHEN** the benchmark loads the default case set
- **THEN** it includes exactly 3 checked-in API-doc input files with the same parseable format
- **AND** each input file declares its API id, title, base URL, endpoint count, and safe probe policy
- **AND** every declared endpoint includes method, path, description, request example, and response example
- **AND** the three files cover enough basic CRUD-style endpoints to test create, read, update, and delete/list behavior where the public API safely supports those operations
- **AND** the case definitions identify safe live probe operations and any auth-required or unsafe operations that must be skipped

### Requirement: Benchmark validates generated tools through backend APIs
The system SHALL validate generated MCP servers without Playwright by using existing backend chat and metadata APIs.

#### Scenario: Benchmark builds and activates a generated server
- **WHEN** a case run starts
- **THEN** the runner submits the case input to backend `POST /chat`
- **AND** it captures the generated server identity, MCP URL, trace identifiers, and build status
- **AND** it calls backend `POST /mcp/metadata` for the generated MCP URL
- **AND** metadata returns a connected status and the generated tool list before tool probes begin

#### Scenario: Benchmark probes live-callable generated tools
- **WHEN** metadata returns generated tools for a case run
- **THEN** the runner submits follow-up backend `POST /chat` requests with `mcpServers` containing the generated MCP URL
- **AND** each live-callable probe records whether the generated MCP tool was invoked successfully
- **AND** the run records success, failure, and skipped counts for all metadata tools

#### Scenario: Unsafe or credential-bound tools are skipped with diagnostics
- **WHEN** a metadata tool requires unavailable credentials, unsafe mutation, or an endpoint outside the case safe live-probe subset
- **THEN** the benchmark marks that tool as skipped
- **AND** the skipped outcome includes a safe reason code
- **AND** skipped tools are excluded from live-callable pass-rate numerator and denominator

### Requirement: Benchmark reports paper metrics
The system SHALL export raw and aggregate artifacts suitable for scientific comparison across cases and variants.

#### Scenario: Raw run artifacts are written
- **WHEN** a benchmark run completes
- **THEN** the system writes append-only JSONL run records and correlated research events
- **AND** the raw records include build status, metadata status, tool outcome counts, latency, estimated token usage fields, and safe diagnostics
- **AND** raw records do not include secrets, JWTs, API keys, cookies, raw private prompts, or full raw API responses

#### Scenario: Aggregate paper tables are exported
- **WHEN** report export runs for a benchmark experiment
- **THEN** the system writes CSV and Markdown summaries grouped by variant, case, API type, skill-selection mode, and RAG mode
- **AND** the summaries include build success rate, metadata readiness rate, tool-call pass rate, skipped coverage, latency percentiles, and estimated token usage

### Requirement: RAG variant flag controls retrieval behavior
The system SHALL make the RAG variant flag affect runtime behavior before RAG ablation metrics are reported.

#### Scenario: RAG disabled bypasses retrieval
- **WHEN** a benchmark variant has `RAG_ENABLED=false`
- **THEN** the LangGraph generation path bypasses vector retrieval and structured RAG extraction
- **AND** it passes an empty RAG context to generation
- **AND** research events record that RAG was disabled for the run

#### Scenario: RAG enabled preserves existing retrieval
- **WHEN** a benchmark variant has `RAG_ENABLED=true`
- **THEN** the existing examiner/RAG retrieval and context extraction path remains available
- **AND** research events record retrieval counts and context metrics when retrieval runs

### Requirement: Benchmark matrix preserves MAPR labels for all current API cases
The system SHALL run the labeled MAPR metric evaluation across the current checked-in backend API-doc matrix cases.

#### Scenario: Current API cases are labeled
- **WHEN** the backend tool-call matrix loads the default full API-doc case set
- **THEN** it includes `input/jsonplaceholder.txt`, `input/dummyjson.txt`, and `input/pokeapi.txt`
- **AND** each case has labels for every declared endpoint in the input document
- **AND** no declared endpoint is omitted from endpoint coverage, hallucinated tool, or schema validity calculations

#### Scenario: Endpoint labels drive all quality metrics
- **WHEN** a generated server completes metadata validation for a case run
- **THEN** the benchmark evaluates all expected operation labels against the generated MCP tool list
- **AND** the run record stores the quality metric inputs and derived rates needed by the report exporter

### Requirement: Benchmark matrix records MAPR run evidence
The system SHALL persist enough run-level evidence for quality, retrieval, latency, token, cost, and ablation metrics without requiring a second pass over raw service logs.

#### Scenario: Build and runtime metric fields are recorded
- **WHEN** a matrix cell run completes successfully or fails with a recorded diagnostic
- **THEN** the raw run record includes `build_success_rate` inputs, `metadata_readiness_rate` inputs, `mcp_handshake_pass_rate` inputs, `tool_call_pass_rate` inputs, `compile_pass_rate` inputs, `build_total_latency_ms`, `chat_total_latency_ms`, and the normalized estimated token and cost fields available for that run

#### Scenario: Retrieval evidence fields are recorded for RAG-on cells
- **WHEN** a matrix cell run has `variantId` ending in `rag-on`
- **THEN** the raw run record or correlated safe metrics include top-3 retrieved evidence labels or hashes, `rag_context_tokens`, and `rag_returned_count`
- **AND** the record remains valid when retrieval returns fewer than three evidence items

#### Scenario: RAG-off cells preserve disabled retrieval evidence
- **WHEN** a matrix cell run has `variantId` ending in `rag-off`
- **THEN** the raw run record or correlated metrics explicitly indicate retrieval was disabled
- **AND** retrieval quality fields are not counted as failed retrieval results

### Requirement: Benchmark matrix supports smoke and final MAPR run shapes
The system SHALL support the planned smoke cells and final paper matrix run shape for MAPR metrics.

#### Scenario: Dynamic RAG smoke cells can be selected
- **WHEN** the runner is invoked for the `jsonplaceholder-input-doc` case with `dynamic-rag-on` and `dynamic-rag-off`
- **THEN** each selected smoke run builds, validates metadata, evaluates generated tools against labels, records retrieval evidence according to the RAG flag, and exports the updated report tables

#### Scenario: Final paper matrix can run all cells
- **WHEN** the runner is invoked for the final paper run target
- **THEN** it can execute 3 API-doc cases across 4 variants and 3 repeats for 36 planned build attempts
- **AND** each completed run records the labels, quality metrics, retrieval metrics, normalized token/cost estimates, and variant identifiers needed for aggregate exports

### Requirement: Benchmark matrix computes ablation effects from the fixed 2x2 variants
The system SHALL compute RAG and static-vs-dynamic ablation effects only from the fixed matrix variant IDs.

#### Scenario: RAG uplift is derived from paired RAG modes
- **WHEN** report export aggregates the four variant cells
- **THEN** `rag_uplift` for each core metric equals the average RAG-on result minus the average RAG-off result
- **AND** the computation uses only `static-rag-on`, `dynamic-rag-on`, `static-rag-off`, and `dynamic-rag-off` rows with non-empty metric values

#### Scenario: Static-vs-dynamic success delta is derived from paired skill modes
- **WHEN** report export aggregates the four variant cells
- **THEN** `static_vs_dynamic_success_delta` equals the average dynamic result minus the average static result for the selected core success metric
- **AND** the computation uses only `dynamic-rag-on`, `dynamic-rag-off`, `static-rag-on`, and `static-rag-off` rows with non-empty metric values

### Requirement: Research runner validates fixture shape before building
The system SHALL validate all selected input docs and dataset entries before starting the first MCP server build.

#### Scenario: Fixture endpoint declarations match parsed endpoints
- **WHEN** `bun run research` loads selected API-doc fixtures
- **THEN** it verifies each fixture's declared endpoint count matches the parsed endpoint sections
- **AND** it fails before building if any endpoint is missing a request example or response example
- **AND** the failure identifies the fixture path and endpoint section that needs correction

#### Scenario: Matrix plan is checked before execution
- **WHEN** the research runner creates the execution plan
- **THEN** it computes selected API docs, variants, repeats, and expected build count
- **AND** the default demo plan reports 12 expected build attempts
- **AND** the runner fails before building if the selected variant set omits any of the 4 required variants

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

#### Scenario: Single-build smoke verifies the full pipeline
- **WHEN** `bun run research -- --smoke` completes successfully
- **THEN** the command has built one selected API-doc and variant cell through the chatbot to LangChain/MetaClaw to mcp-gen flow
- **AND** it has validated generated MCP metadata and direct MCP tool calls, cleaned the generated container, and exported the API-doc batch report
- **AND** default and full dry-runs still report the 12-build and 36-build matrix plans for later parameterized execution

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

