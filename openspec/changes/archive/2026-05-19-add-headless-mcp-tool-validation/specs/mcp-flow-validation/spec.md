## ADDED Requirements

### Requirement: Headless MCP tool validation runs through backend APIs
The system SHALL provide a non-browser validation flow that proves generated MCP tools can be used from chatbot requests through the existing FastAPI backend routes.

#### Scenario: Headless validation builds and activates a generated server
- **WHEN** the headless validation submits the JSONPlaceholder build prompt to `POST /chat`
- **THEN** the validation captures shared `traceId`, `experimentId`, `sessionId`, and `buildRequestId` values for the run
- **AND** the streamed response includes or leads to an mcp-gen generated server identity and MCP URL
- **AND** the validation verifies the generated server reaches `running` state through the MCP manager status path
- **AND** the validation calls `POST /mcp/metadata` with the generated MCP URL and correlation context
- **AND** the metadata response returns `status: "connected"` and a non-empty tool list

#### Scenario: Headless validation executes a follow-up chat with the active MCP server
- **WHEN** metadata has connected a generated MCP server with at least one tool
- **AND** the headless validation submits a follow-up request to `POST /chat` with `mcpServers` containing the generated MCP URL
- **THEN** the backend creates or reuses an agent with the generated MCP tools attached
- **AND** the follow-up response stream completes without SSE errors
- **AND** the validation receives a useful answer for the requested JSONPlaceholder data

### Requirement: MCP tool invocation evidence is machine-readable
The system SHALL emit machine-readable evidence when a follow-up chatbot request invokes a generated MCP tool.

#### Scenario: Tool invocation succeeds
- **WHEN** a follow-up chatbot request invokes one or more generated MCP tools successfully
- **THEN** the system records a correlated research event named `mcp_tool_invocation_completed`
- **AND** the event includes the shared run identifiers and generated `serverId` when available
- **AND** the event metrics include `mcp_tool_invocation_count`, `mcp_tool_success`, `mcp_url_count`, and safe tool-name or tool-count metadata
- **AND** the event does not persist raw private prompt text, secrets, tokens, cookies, or full raw tool output

#### Scenario: Tool invocation does not occur
- **WHEN** the follow-up chatbot request has active generated MCP tools but no generated tool is invoked
- **THEN** the validation fails with diagnostics that distinguish missing tool invocation from metadata/list-tools failure
- **AND** the persisted chat metrics still include the active MCP URL count and available MCP tool count for debugging

## MODIFIED Requirements

### Requirement: Active generated MCP tools are callable from chat
The system SHALL validate that at least one generated MCP tool can be called from a follow-up chatbot interaction after the generated server is active, and SHALL support both browser-driven and headless backend-driven validation of that behavior.

#### Scenario: Follow-up chat uses generated tool
- **WHEN** a generated MCP server is active in chatbot settings or supplied directly in a headless `POST /chat` request
- **AND** the user or validation runner sends a follow-up prompt that requires one of its tools
- **THEN** the backend includes the active MCP server URL in the chat request path
- **AND** the agent can invoke at least one generated tool successfully
- **AND** the chatbot receives a useful tool-backed response or visible tool result
- **AND** the validation can assert machine-readable evidence that a generated MCP tool was invoked
