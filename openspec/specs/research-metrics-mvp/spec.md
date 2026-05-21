# research-metrics-mvp Specification

## Purpose
TBD - created by archiving change add-research-metrics-mvp. Update Purpose after archive.
## Requirements
### Requirement: Research event recording
The system SHALL record research events with stable correlation fields when research metrics are enabled.

#### Scenario: Metrics enabled
- **WHEN** `RESEARCH_METRICS_ENABLED=true` and an instrumented stage completes
- **THEN** the system records an event containing timestamp, experiment id, trace id, service, stage, event name, status, duration, metrics, and tags

#### Scenario: Metrics disabled
- **WHEN** `RESEARCH_METRICS_ENABLED` is unset or false
- **THEN** the system performs no research event persistence and preserves existing runtime behavior

### Requirement: Correlation context propagation
The system SHALL propagate optional research context through chat, LangGraph build, and mcp-gen creation flows.

#### Scenario: Request includes research context
- **WHEN** a chat or build request includes `traceId` and `experimentId`
- **THEN** downstream events use those values together with existing `sessionId`, `buildRequestId`, and generated `serverId` values

#### Scenario: Request omits research context
- **WHEN** a request does not include `traceId` or `experimentId`
- **THEN** the system generates or defaults values without rejecting the request

### Requirement: Paper-critical metrics
The system SHALL capture metrics needed for paper tables covering end-to-end performance, generation quality, skill selection, RAG, runtime reliability, and feedback.

#### Scenario: Build flow completes
- **WHEN** an MCP generation flow finishes successfully or fails
- **THEN** exported metrics include success/failure status, latency, provider/model, generation mode, validation outcomes when available, and runtime reliability checks when available

### Requirement: Benchmark execution
The system SHALL provide a repeatable benchmark runner for the paper MVP dataset and supported experiment modes.

#### Scenario: Run benchmark
- **WHEN** the benchmark runner executes with a dataset and experiment mode
- **THEN** each run records commit hash, dataset item id, provider/model, mode flags, repeat index, and emitted research events

### Requirement: Report export
The system SHALL export collected research metrics into CSV and Markdown tables for paper use.

#### Scenario: Export reports
- **WHEN** the export script runs for an experiment id
- **THEN** it writes aggregate CSV and Markdown summaries for static-vs-dynamic skill selection, RAG comparison, runtime reliability, robustness by API type, and feedback where data exists

### Requirement: Secret redaction
The system SHALL avoid persisting secrets or full private inputs in research events.

#### Scenario: Event contains sensitive fields
- **WHEN** an event payload includes token, authorization, cookie, password, API key, JWT, or raw user content fields
- **THEN** the recorder redacts or replaces those values with safe metadata before persistence

### Requirement: Research labels support generation quality and retrieval metrics
The system SHALL provide machine-readable labels for each benchmark API-doc case that are sufficient to compute generation quality and RAG retrieval metrics without manual post-processing.

#### Scenario: Expected operation labels are available
- **WHEN** the research runner loads a selected API-doc case
- **THEN** the case labels include every expected operation from the checked-in input doc
- **AND** each expected operation includes a stable operation id, HTTP method, path, expected tool-name aliases, required parameter hints, schema hints, auth requirement, and relevant RAG evidence labels or hashes

#### Scenario: Labels match the input document
- **WHEN** the research runner validates selected fixtures before building
- **THEN** it fails before the first build if any expected operation label is missing a matching declared endpoint in the input document
- **AND** the diagnostic identifies the case id and missing or unmatched operation id

### Requirement: Research metrics compute generated tool quality
The system SHALL compute generated MCP tool quality metrics by comparing generated metadata tools against the expected operation labels.

#### Scenario: Quality metrics are computed for a completed run
- **WHEN** a benchmark run has generated MCP metadata with a tool list
- **THEN** the run-level metrics include `expected_operation_count`, `mapped_operation_count`, `generated_tool_count`, `hallucinated_tool_count`, `schema_valid_tool_count`, `endpoint_coverage`, `hallucinated_tool_rate`, and `schema_validity_rate`
- **AND** `endpoint_coverage` equals expected API operations mapped to generated MCP tools divided by expected operations
- **AND** `hallucinated_tool_rate` equals generated tools not mapped to expected operations divided by generated tools
- **AND** `schema_validity_rate` equals generated mapped tools with valid required params or schema divided by mapped tools

#### Scenario: Quality metrics preserve safe diagnostics
- **WHEN** generated tools cannot be mapped or schema validity cannot be confirmed
- **THEN** the run-level metrics include compact diagnostic counts and safe operation/tool names
- **AND** the metrics do not include secrets, cookies, JWTs, full private prompts, full API responses, or raw RAG chunks

### Requirement: Research metrics compute RAG retrieval quality
The system SHALL record safe top-3 RAG retrieval evidence and compute retrieval metrics for RAG-on benchmark runs.

#### Scenario: RAG-on retrieval evidence is recorded
- **WHEN** a benchmark run executes with `ragEnabled=true` and retrieval returns evidence
- **THEN** the correlated research metrics include `rag_returned_count`, `rag_context_tokens`, and up to three retrieved evidence labels or hashes in rank order
- **AND** the run-level metrics include `precision_at_3`, `recall_at_3`, and `mrr_at_3` computed against the case labels

#### Scenario: RAG-off retrieval metrics are not applicable
- **WHEN** a benchmark run executes with `ragEnabled=false`
- **THEN** retrieval quality metrics are marked not applicable for that run
- **AND** RAG-off runs are excluded from precision@3, recall@3, and MRR@3 aggregate denominators

### Requirement: Research metrics normalize token and cost estimates
The system SHALL normalize estimated token and cost metrics across raw events, run records, and exports.

#### Scenario: Estimated usage fields are normalized
- **WHEN** a benchmark run is aggregated from raw events and run records
- **THEN** the run-level metrics include `estimated_prompt_tokens`, `estimated_completion_tokens`, `estimated_total_tokens`, and `estimated_cost_usd`
- **AND** `estimated_total_tokens` equals estimated prompt tokens plus estimated completion tokens
- **AND** the metrics remain estimates and are not represented as provider billing records

#### Scenario: Per-successful-server ratios are derived
- **WHEN** reports aggregate one or more benchmark runs
- **THEN** aggregate metrics include `tokens_per_successful_server` and `estimated_cost_per_successful_server`
- **AND** each ratio is empty or not applicable when the successful build denominator is zero

### Requirement: Research export includes MAPR paper tables
The system SHALL export run-level and aggregate paper metrics for the 2x2 static/dynamic by RAG on/off experiment matrix.

#### Scenario: Run-level exports include quality and cost columns
- **WHEN** report export runs for a benchmark experiment
- **THEN** existing run-level CSV outputs include build success, metadata readiness, MCP handshake, tool-call pass, compile/start validation, endpoint coverage, hallucinated tool rate, schema validity, latency, retrieval, token, and estimated cost columns where data exists

#### Scenario: Variant-level quality and retrieval exports are written
- **WHEN** report export runs for a benchmark experiment
- **THEN** it writes `quality_by_variant.csv` with quality metrics grouped by variant
- **AND** it writes `rag_retrieval_by_variant.csv` with precision@3, recall@3, and MRR@3 for RAG-on variants
- **AND** it writes `ablation_effects.csv` with `rag_uplift` and `static_vs_dynamic_success_delta` for core metrics

#### Scenario: Markdown summary includes the 2x2 matrix
- **WHEN** report export writes `summary.md`
- **THEN** the summary includes a 2x2 table for `static-rag-off`, `static-rag-on`, `dynamic-rag-off`, and `dynamic-rag-on`
- **AND** it includes derived `rag_uplift` and `static_vs_dynamic_success_delta` values with the counts used to compute each delta

### Requirement: Research metrics capture matrix batch and cleanup outcomes
The system SHALL capture per-run and per-batch research metrics needed to audit the formatted-input matrix.

#### Scenario: Run records include batch identity and expected counts
- **WHEN** a research matrix run starts
- **THEN** raw metrics include `apiDocId`, fixture path, declared endpoint count, expected build count for the active plan, `variantId`, and `repeatIndex`
- **AND** the demo plan records 12 expected build attempts

#### Scenario: Run records include direct MCP validation outcomes
- **WHEN** backend direct MCP validation runs for a generated MCP server
- **THEN** raw metrics include the validation method, safe tool-call pass count, safe tool-call fail count, skipped count, and direct tool-call pass rate
- **AND** direct validation diagnostics are recorded without storing secrets, API keys, cookies, or full private prompts

#### Scenario: Run records include Inspector diagnostic outcomes
- **WHEN** Inspector CLI diagnostic validation runs for a generated MCP server
- **THEN** raw metrics include Inspector connection status, listed tool count, safe tool-call pass count, safe tool-call fail count, skipped count, and Inspector pass rate
- **AND** Inspector diagnostics are recorded without storing secrets, API keys, cookies, or full private prompts

#### Scenario: Run records include cleanup outcomes
- **WHEN** generated container cleanup is attempted
- **THEN** raw metrics include generated `containerId`, cleanup status, cleanup duration, and cleanup error text when cleanup fails
- **AND** aggregate summaries include created, removed, skipped, and failed cleanup counts

### Requirement: Research export supports per API-doc batch reports
The system SHALL export CSV and Markdown summaries for each completed API-doc batch in addition to experiment-level summaries.

#### Scenario: API-doc batch export
- **WHEN** an API-doc batch completes for an experiment
- **THEN** the exporter writes batch-scoped CSV and Markdown summaries grouped by API doc, variant, repeat, skill-selection mode, and RAG mode
- **AND** the summaries include build success rate, metadata readiness rate, Inspector pass rate, backend tool-call pass rate when available, skipped coverage, latency percentiles, and cleanup success rate

#### Scenario: Export is safe to call repeatedly
- **WHEN** the research runner calls export after multiple API-doc batches in the same experiment
- **THEN** existing batch reports are preserved or deterministically replaced for the same batch id
- **AND** reports for different API docs remain distinguishable by path or filename

