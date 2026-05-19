## ADDED Requirements

### Requirement: Dashboard-created MCP servers emit run-summary metrics
The research metrics system SHALL emit and export run-summary evidence for MCP servers created from the dashboard manual flow.

#### Scenario: Dashboard build completes successfully
- **WHEN** a dashboard-created MCP server reaches successful creation and metadata readiness
- **THEN** persisted events and exported rows include build success, metadata readiness, total build latency, provider, model, `experimentId`, `traceId`, `sessionId`, `buildRequestId`, and generated `serverId` when available
- **AND** the same rows include effective `ragEnabled`, `dynamicSkillSelection`, `skillSelectionVariant`, and derived variant id values

#### Scenario: Dashboard build fails
- **WHEN** a dashboard-created MCP server build fails before activation
- **THEN** persisted events and exported rows include failure status, safe error code or stage, total latency when available, and the effective variant flags
- **AND** the failure evidence remains correlated by `experimentId`, `traceId`, `sessionId`, and `buildRequestId`

### Requirement: Estimated token and cost fields are reportable
The research metrics system SHALL include estimated token and cost fields for dashboard-created runs whenever the underlying generation or skill-selection stages can provide them.

#### Scenario: Token estimates are available
- **WHEN** generation, prompt construction, or skill selection records estimated token usage
- **THEN** exported dashboard run rows include estimated prompt tokens, estimated completion tokens when available, LLM call count when available, and selected skill token totals when available

#### Scenario: Cost estimates are available
- **WHEN** provider/model pricing or local estimate rules are available for a dashboard run
- **THEN** exported dashboard run rows include estimated token cost fields
- **AND** the fields are clearly identifiable as estimates

#### Scenario: Estimates are unavailable
- **WHEN** token or cost estimates cannot be computed for a dashboard run
- **THEN** report export leaves the estimate fields empty or unknown
- **AND** report export does not fail solely because estimate fields are missing

### Requirement: Tool-call coverage separates untested from failed
The research metrics system SHALL distinguish tool-call validation that was not run from validation that ran and failed.

#### Scenario: Tool validation has no outcome event
- **WHEN** a dashboard-created MCP server has build and metadata evidence but no `mcp_tool_outcomes_completed` or equivalent tool-validation event
- **THEN** exported reports mark tool-call coverage as unknown or not run
- **AND** the run is excluded from the tool-call pass-rate denominator

#### Scenario: Tool validation completes with skipped tools
- **WHEN** tool validation records skipped tools because credentials are unavailable, a mutation is unsafe, or no safe live probe exists
- **THEN** exported reports include skipped count and skipped coverage
- **AND** skipped tools are excluded from the live-callable pass-rate numerator and denominator

#### Scenario: Tool validation completes with attempted tools
- **WHEN** tool validation records attempted live-callable tools
- **THEN** exported reports compute tool-call pass rate from successful attempted tools divided by attempted live-callable tools
- **AND** the report includes success, failure, skipped, and total tool counts
