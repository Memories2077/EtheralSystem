## MODIFIED Requirements

### Requirement: Chatbot build request creates and activates an MCP server
The system SHALL validate that a browser chatbot request based on root `INPUT_SAMPLE.txt` reaches FastAPI, triggers LangGraph/LangChain `create_MCPServer`, reaches mcp-gen manager, receives an mcp-gen completion event, verifies generated MCP metadata, records essential correlated research metrics, and stores an active generated MCP server in the chatbot UI.

#### Scenario: Build request completes through all services
- **WHEN** the browser chatbot submits the root `INPUT_SAMPLE.txt` JSONPlaceholder fixture through the chat UI
- **THEN** FastAPI receives chat history, `mcpServers`, `sessionId`, `buildRequestId`, `userId`, `email`, workspace, memory context, and research correlation context
- **AND** LangGraph invokes `create_MCPServer`
- **AND** mcp-gen manager creates a server and returns an `mcp_build_complete` event with server identity and MCP URL
- **AND** the chatbot verifies the generated MCP URL through `POST /mcp/metadata`
- **AND** the chatbot stores the generated MCP server as active settings state with a non-empty tool list

#### Scenario: Generated MCP metadata is available to the UI
- **WHEN** the chatbot activates or verifies the generated MCP URL through `POST /mcp/metadata`
- **THEN** FastAPI initializes the streamable HTTP MCP session
- **AND** the response includes the generated server name/status and a non-empty tool list
- **AND** the metadata request includes the original build/session/server correlation context when available

#### Scenario: Essential metrics are correlated
- **WHEN** the JSONPlaceholder browser flow completes with research metrics enabled
- **THEN** the persisted research events for the build contain shared `experiment_id`, `trace_id`, `session_id`, and `build_request_id` values where those identifiers are available
- **AND** the event set includes chat stream, LangGraph stream, supervisor routing, RAG/examiner, generator, input normalization, generation, Docker build/start, mcp create completion, and runtime metadata observations
- **AND** essential metric payloads include latency/duration, input type/length/hash, generation validation status, selected skill data when available, Docker/build status, MCP tool count, and runtime initialization success
