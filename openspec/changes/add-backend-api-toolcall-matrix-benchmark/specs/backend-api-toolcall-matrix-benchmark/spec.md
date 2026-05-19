## ADDED Requirements

### Requirement: Benchmark matrix is fixed and reproducible
The system SHALL provide a backend API E2E benchmark matrix for paper runs with fixed checked-in input API-doc cases, fixed variants, and repeatable run metadata.

#### Scenario: Full matrix enumerates all benchmark cells
- **WHEN** the benchmark runs with default paper settings
- **THEN** it executes 3 checked-in input API-doc cases across 4 variants and 3 repeats
- **AND** every run records `experimentId`, `caseId`, `variantId`, `repeatIndex`, provider, model, git commit, and effective feature flags

#### Scenario: Variant flags are applied explicitly
- **WHEN** the benchmark runs a variant cell
- **THEN** `static-rag-off` uses static skill selection with RAG disabled
- **AND** `static-rag-on` uses static skill selection with RAG enabled
- **AND** `dynamic-rag-off` uses dynamic skill selection with RAG disabled
- **AND** `dynamic-rag-on` uses dynamic skill selection with RAG enabled

#### Scenario: Benchmark cases use checked-in input docs
- **WHEN** the benchmark loads the default case set
- **THEN** it includes `input/jsonplaceholder.txt`, `input/reddit.txt`, and `input/thedogapi.txt`
- **AND** the Reddit and TheDogAPI auth information files are included as generation input context
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
