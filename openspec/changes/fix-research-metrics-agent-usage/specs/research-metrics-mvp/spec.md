## ADDED Requirements

### Requirement: RAG retrieval metrics use real LangGraph examiner evidence
The system SHALL compute RAG retrieval quality for RAG-on benchmark runs from real LangGraph examiner events instead of backend fallback events.

#### Scenario: Real examiner evidence is available
- **WHEN** a RAG-on benchmark build has a correlated `service="langgraph-agent"` and `event_name="examiner_completed"` event
- **THEN** retrieval metrics use that event's RAG counts, token counts, and top-3 evidence labels or hashes
- **AND** backend events tagged `source="backend_langgraph_fallback"` are excluded from RAG retrieval precision, recall, and MRR calculations

#### Scenario: Real examiner evidence is missing
- **WHEN** a RAG-on benchmark build has no correlated `langgraph-agent` `examiner_completed` event
- **THEN** the run records a missing-real-examiner-evidence diagnostic
- **AND** retrieval metrics are not reported as valid zero-valued precision, recall, or MRR
- **AND** strict smoke validation fails before the result is accepted for paper reporting

### Requirement: Usage metrics preserve safe numeric token and cost evidence
The system SHALL persist safe numeric usage evidence and normalize it into run-level token and cost estimate fields.

#### Scenario: Numeric usage token metrics are emitted
- **WHEN** an instrumented service records numeric usage metrics such as `prompt_token_estimate`, `completion_token_estimate`, `total_token_estimate`, `token_count`, `rag_context_tokens`, or `skill_total_tokens`
- **THEN** the persisted research event keeps those numeric values
- **AND** the run aggregator can use them to populate normalized estimated usage fields

#### Scenario: Effective Gemini 2.5 Flash cost is derived
- **WHEN** a benchmark run has numeric estimated prompt and completion token counts
- **AND** the benchmark effective LLM model is Gemini 2.5 Flash, including direct Gemini calls and MetaClaw-backed calls
- **THEN** `estimated_cost_usd` equals prompt tokens multiplied by `0.30 / 1_000_000` plus completion tokens multiplied by `2.50 / 1_000_000`
- **AND** the run records that the cost is an estimate, not a provider billing record

#### Scenario: Usage evidence is missing or redacted
- **WHEN** normalized usage cannot find numeric prompt or completion token evidence for a completed build
- **THEN** the run records `usage_status` as missing or redacted
- **AND** token and cost fields are not represented as valid zero usage or zero cost

### Requirement: Research reports surface evidence completeness
The system SHALL expose evidence completeness status for RAG, token, and cost metrics in run-level and aggregate reports.

#### Scenario: Evidence is complete
- **WHEN** a run has real examiner RAG evidence and numeric estimated usage evidence
- **THEN** exported run-level records include success statuses for RAG evidence and usage evidence
- **AND** aggregate tables include the corresponding token, cost, and retrieval metrics

#### Scenario: Evidence is incomplete
- **WHEN** a run lacks real examiner RAG evidence or numeric usage evidence
- **THEN** exported run-level records include explicit diagnostic statuses
- **AND** aggregate tables exclude unavailable values from denominators where applicable

## MODIFIED Requirements

### Requirement: Secret redaction
The system SHALL avoid persisting secrets or full private inputs in research events while preserving safe numeric metric metadata.

#### Scenario: Event contains sensitive fields
- **WHEN** an event payload includes authorization, cookie, password, API key, JWT, access token, refresh token, bearer token, or raw user content fields
- **THEN** the recorder redacts or replaces those values with safe metadata before persistence

#### Scenario: Event contains safe numeric usage fields
- **WHEN** an event payload includes numeric usage-count fields whose names contain token-related terms
- **THEN** the recorder preserves the numeric values for research aggregation
- **AND** the recorder continues to redact non-numeric values for sensitive token-bearing keys
