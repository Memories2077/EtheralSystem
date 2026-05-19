## MODIFIED Requirements

### Requirement: Chatbot build request creates and activates an MCP server
The system SHALL validate that a chatbot request based on root `INPUT_SAMPLE.txt` reaches FastAPI, triggers LangGraph/LangChain `create_MCPServer`, receives an mcp-gen completion event, stores an active generated MCP server in the chatbot UI, and can attach research correlation context when metrics are enabled.

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

#### Scenario: Research context is attached to validation flow
- **WHEN** metrics are enabled for the validation flow
- **THEN** the build request carries `traceId`, `experimentId`, `sessionId`, and `buildRequestId` through FastAPI, LangGraph, and mcp-gen events
- **AND** runtime validation observations can be correlated to the generated `serverId`

### Requirement: Active generated MCP tools are callable from chat
The system SHALL validate that at least one generated MCP tool can be called from a follow-up chatbot interaction after the generated server is active, and SHALL emit runtime reliability observations when research metrics are enabled.

#### Scenario: Follow-up chat uses generated tool
- **WHEN** a generated MCP server is active in chatbot settings
- **AND** the user sends a follow-up prompt that requires one of its tools
- **THEN** the backend includes the active MCP server URL in the chat request path
- **AND** the agent can invoke at least one generated tool successfully
- **AND** the chatbot receives a useful tool-backed response or visible tool result

#### Scenario: Runtime reliability is observed
- **WHEN** runtime validation checks initialize a generated MCP server and list its tools
- **THEN** the system records initialize success, list-tools latency, tool count, and safe tool-call success when available
