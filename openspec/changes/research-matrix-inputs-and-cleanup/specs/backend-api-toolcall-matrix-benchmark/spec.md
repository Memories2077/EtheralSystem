## MODIFIED Requirements

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

## ADDED Requirements

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
