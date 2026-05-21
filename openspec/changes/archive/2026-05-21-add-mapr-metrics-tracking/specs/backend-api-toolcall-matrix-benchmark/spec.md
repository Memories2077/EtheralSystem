## ADDED Requirements

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
