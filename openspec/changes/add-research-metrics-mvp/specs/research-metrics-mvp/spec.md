## ADDED Requirements

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
