## ADDED Requirements

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
