## ADDED Requirements

### Requirement: Headless validation logs generated tool outcomes
The system SHALL log machine-readable outcome evidence for every generated MCP tool returned by metadata during a headless validation run.

#### Scenario: All metadata tools are represented
- **WHEN** headless validation receives a metadata response with one or more generated tools
- **AND** the validation completes its per-tool outcome pass
- **THEN** the research event store contains a correlated `mcp_tool_outcomes_completed` event for the same `traceId`, `experimentId`, `sessionId`, `buildRequestId`, and generated `serverId`
- **AND** the event includes one safe outcome entry for every metadata tool name
- **AND** no metadata tool is omitted from the outcome list

#### Scenario: Success and failure counts are persisted
- **WHEN** the validation records `mcp_tool_outcomes_completed`
- **THEN** the event metrics include `mcp_tool_total_count`, `mcp_tool_attempted_count`, `mcp_tool_success_count`, `mcp_tool_failure_count`, and `mcp_tool_skipped_count`
- **AND** the sum of success, failure, and skipped counts equals the total metadata tool count
- **AND** each tool outcome has a status of `success`, `failed`, or `skipped`

#### Scenario: Failed or skipped tools include safe diagnostics
- **WHEN** an individual tool cannot be invoked successfully or cannot be safely validated
- **THEN** its outcome entry includes the tool name, status, error code, invocation count, result count, and a compact safe diagnostic
- **AND** the event does not persist raw private prompt text, secrets, tokens, cookies, full raw tool output, or full raw API responses

#### Scenario: Existing single-tool evidence remains available
- **WHEN** a headless validation run invokes generated MCP tools through the chatbot backend
- **THEN** the existing `mcp_tool_invocation_completed` event remains available for per-request invocation evidence
- **AND** the new `mcp_tool_outcomes_completed` event provides run-level coverage across the full generated tool list
