## ADDED Requirements

### Requirement: Stack startup uses root Compose and scoped cleanup
The validation flow SHALL start MetaClaw from the sibling `../MetaClaw` project and SHALL start the EtheralSystem services through the root `docker compose` configuration. Cleanup MUST be limited to EtheralSystem project resources and generated MCP resources associated with the test run.

#### Scenario: Stack starts from approved entrypoints
- **WHEN** the implementer prepares the end-to-end test environment
- **THEN** MetaClaw is started with `metaclaw start` from `../MetaClaw`
- **AND** the EtheralSystem stack is started or rebuilt from the repository root with Docker Compose
- **AND** no missing langChain bash script is required

#### Scenario: Cleanup is project-scoped
- **WHEN** validation finishes or stale resources block the run
- **THEN** only EtheralSystem containers/images/networks and generated MCP resources tied to the test run are removed
- **AND** global Docker prune is not used

### Requirement: Chatbot build request creates and activates an MCP server
The system SHALL validate that a chatbot request based on root `INPUT_SAMPLE.txt` reaches FastAPI, triggers LangGraph/LangChain `create_MCPServer`, receives an mcp-gen completion event, and stores an active generated MCP server in the chatbot UI.

#### Scenario: Build request completes through all services
- **WHEN** the chatbot submits the selected input example through `POST /chat`
- **THEN** FastAPI receives chat history, `mcpServers`, `buildRequestId`, `userId`, `email`, and memory context
- **AND** LangGraph invokes `create_MCPServer`
- **AND** mcp-gen creates a server and returns an `mcp_build_complete` event with server identity and MCP URL
- **AND** the chatbot stores the generated MCP server as active settings state

#### Scenario: Generated MCP metadata is available to the UI
- **WHEN** the chatbot activates or verifies the generated MCP URL through `POST /mcp/metadata`
- **THEN** FastAPI initializes the streamable HTTP MCP session
- **AND** the response includes the generated server name/status and a non-empty tool list

### Requirement: Active generated MCP tools are callable from chat
The system SHALL validate that at least one generated MCP tool can be called from a follow-up chatbot interaction after the generated server is active.

#### Scenario: Follow-up chat uses generated tool
- **WHEN** a generated MCP server is active in chatbot settings
- **AND** the user sends a follow-up prompt that requires one of its tools
- **THEN** the backend includes the active MCP server URL in the chat request path
- **AND** the agent can invoke at least one generated tool successfully
- **AND** the chatbot receives a useful tool-backed response or visible tool result

### Requirement: Human feedback reaches mcp-gen learning
The system SHALL validate the existing chatbot human-feedback UI before adding any new UI. Feedback MUST be submitted through FastAPI to mcp-gen, stored on the generated server log, and imported into mcp-gen skill feedback effectiveness.

#### Scenario: Feedback submission is persisted
- **WHEN** the user submits like or dislike feedback with an optional comment for a generated MCP server in the UI
- **THEN** the UI posts to `POST /mcp/{serverId}/feedback`
- **AND** FastAPI proxies the payload to mcp-gen `POST /api/mcp/:serverId/feedback`
- **AND** mcp-gen increments the matching feedback counter and appends a feedback entry

#### Scenario: Feedback affects skill effectiveness
- **WHEN** mcp-gen receives feedback for a generated server with a matching generation outcome
- **THEN** mcp-gen triggers human feedback import
- **AND** the imported feedback updates the associated skill feedback record
- **AND** the resulting effectiveness reflects the feedback through `humanFeedbackScore` and Bayesian success-rate calculation

### Requirement: Defect repairs preserve existing interfaces
The implementation MUST only change code after a verified failure and MUST preserve existing public route shapes unless an existing route is proven insufficient.

#### Scenario: Verified break requires code changes
- **WHEN** an end-to-end or focused test identifies a broken boundary
- **THEN** the implementer patches the smallest relevant area
- **AND** existing route contracts remain compatible
- **AND** mcp-gen verification uses Bun/package scripts rather than `npx`
