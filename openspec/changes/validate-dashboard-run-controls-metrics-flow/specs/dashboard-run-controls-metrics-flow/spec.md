## ADDED Requirements

### Requirement: Dashboard controls define the manual run variant
The dashboard SHALL expose a manual run variant composed of experiment id, RAG mode, and skill-selection mode, and SHALL keep the displayed variant synchronized with persisted chat settings.

#### Scenario: User changes skill-selection mode
- **WHEN** a user switches the dashboard skill-selection control between static and dynamic
- **THEN** the dashboard updates the visible mode label and derived variant id before the next run starts
- **AND** the persisted chat settings store the selected skill-selection mode

#### Scenario: User changes RAG mode
- **WHEN** a user toggles RAG on or off from the dashboard
- **THEN** the dashboard updates the visible RAG state and derived variant id before the next run starts
- **AND** the persisted chat settings store the selected RAG mode as a boolean

#### Scenario: User changes experiment id
- **WHEN** a user edits the dashboard experiment id
- **THEN** the next chat/build request uses the edited experiment id
- **AND** the dashboard displays that experiment id as the current run context

### Requirement: Dashboard run context reaches backend chat requests
The system SHALL include the effective dashboard run context in every chat/build request started after dashboard controls are changed.

#### Scenario: Chat request is sent after selecting a variant
- **WHEN** a user selects a dashboard variant and submits a build prompt through chat
- **THEN** the frontend request to `POST /chat` includes `experimentId`, `traceId`, `sessionId`, `buildRequestId`, `ragEnabled`, `dynamicSkillSelection`, and `skillSelectionVariant`
- **AND** `dynamicSkillSelection` matches the selected static/dynamic mode
- **AND** `ragEnabled` matches the selected RAG switch state

#### Scenario: Static variant request is sent
- **WHEN** the selected dashboard mode is static
- **THEN** the `POST /chat` payload marks dynamic skill selection as disabled
- **AND** the payload uses a static-compatible `skillSelectionVariant`

#### Scenario: Dynamic variant request is sent
- **WHEN** the selected dashboard mode is dynamic
- **THEN** the `POST /chat` payload marks dynamic skill selection as enabled
- **AND** the payload uses `skillSelectionVariant=dynamic`

### Requirement: Backend honors dashboard run flags
The backend SHALL normalize dashboard run flags once and propagate the effective values through LangGraph, mcp-gen creation, metadata checks, and generated server state.

#### Scenario: Backend receives run flags
- **WHEN** FastAPI receives a `POST /chat` request containing dashboard run flags
- **THEN** it preserves those flags in the request context passed to LangGraph
- **AND** downstream research events use the same `experimentId`, `traceId`, `sessionId`, and `buildRequestId`

#### Scenario: RAG disabled bypasses retrieval for a dashboard run
- **WHEN** a dashboard run has `ragEnabled=false`
- **THEN** LangGraph bypasses vector retrieval and structured RAG extraction for that run
- **AND** generation receives an empty RAG context
- **AND** research events record that RAG was disabled for the run

#### Scenario: RAG enabled preserves retrieval for a dashboard run
- **WHEN** a dashboard run has `ragEnabled=true`
- **THEN** LangGraph keeps the existing retrieval and structured RAG extraction path available
- **AND** research events record retrieval counts and context metrics when retrieval runs

#### Scenario: Skill-selection mode reaches mcp-gen
- **WHEN** LangGraph calls mcp-gen to create a server for a dashboard run
- **THEN** the mcp-gen create payload includes the effective `dynamicSkillSelection` and `skillSelectionVariant`
- **AND** mcp-gen uses those values for prompt/skill selection during generation

### Requirement: Generated server records expose run variant evidence
Generated MCP server records SHALL preserve enough dashboard run context for the UI and reports to identify how the server was produced.

#### Scenario: MCP server is created successfully
- **WHEN** mcp-gen successfully creates a server from a dashboard run
- **THEN** the generated server record includes `experimentId`, `traceId`, `sessionId`, `buildRequestId`, `ragEnabled`, `dynamicSkillSelection`, and `skillSelectionVariant`
- **AND** the server list or dashboard surface can display the effective RAG and skill-selection mode for that server

#### Scenario: Metadata check activates generated server
- **WHEN** the chatbot verifies a generated MCP URL through `POST /mcp/metadata`
- **THEN** the metadata request carries the same run correlation context when available
- **AND** the active MCP server state keeps the generated server identity and available tool list

### Requirement: Dashboard-created runs produce reportable metrics
The system SHALL produce reportable metrics for a successful dashboard-created MCP server even when tool-call validation is run later by the user.

#### Scenario: Server creation succeeds
- **WHEN** a dashboard run creates and activates an MCP server successfully
- **THEN** persisted metrics include build success, metadata readiness, effective variant flags, latency, provider/model, and estimated token/cost fields when available
- **AND** the report/export layer can include the run in build-success and cost summaries

#### Scenario: Tool validation has not been run
- **WHEN** a dashboard-created MCP server has not yet completed tool-call validation
- **THEN** reports mark tool-call coverage as unknown or skipped
- **AND** reports do not count the run as a tool-call failure solely because tool validation has not been executed

#### Scenario: Tool validation is run by the user
- **WHEN** the user later runs tool-call validation for a dashboard-created MCP server
- **THEN** the resulting tool-call success, failure, and skipped counts are correlated to the same run identifiers where available
- **AND** reports can compute tool-call pass rate from attempted live-callable tools
