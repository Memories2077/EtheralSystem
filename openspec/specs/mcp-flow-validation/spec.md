# mcp-flow-validation Specification

## Purpose
TBD - created by archiving change test-chatbot-langchain-mcp-flow. Update Purpose after archive.
## Requirements
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

### Requirement: Root JSONPlaceholder validation verifies UI and manager round trip
The system SHALL run the project-root JSONPlaceholder fixture through the browser chatbot flow and SHALL verify that the generated MCP server state travels from the UI to the MCP server manager and back into active UI state.

#### Scenario: Browser run activates generated MCP server from root input
- **WHEN** the validation opens the chatbot UI and submits the contents of root `INPUT_SAMPLE.txt`
- **THEN** the UI request to `POST /chat` includes non-empty `buildRequestId`, `traceId`, `sessionId`, and `experimentId`
- **AND** the backend orchestration reaches the MCP server manager and receives a generated MCP server identity and MCP URL
- **AND** the UI stores the generated MCP server as active state with a non-empty tool list

#### Scenario: Generated MCP metadata returns to the UI
- **WHEN** the validation verifies the generated MCP URL through the UI metadata path
- **THEN** the backend initializes the generated MCP streamable HTTP session successfully
- **AND** the metadata response includes the generated server status and at least one available tool
- **AND** the browser-visible state reflects the same generated server identity returned by the manager

### Requirement: Root JSONPlaceholder validation logs essential correlated metrics
The system SHALL persist essential research metrics for the JSONPlaceholder validation run and MUST correlate all required events to the same `buildRequestId`, `traceId`, and `experimentId`.

#### Scenario: Essential metric events are persisted for one run
- **WHEN** the root JSONPlaceholder browser validation completes
- **THEN** the research event store contains `chat_stream_completed`, `langgraph_stream_completed`, `supervisor_routed`, `examiner_completed`, `generator_completed`, `mcp_create_input_normalized`, `openapi_generation_completed`, `docker_build_completed`, `container_start_completed`, `mcp_create_completed`, and `mcp_metadata_checked` for the captured `buildRequestId`
- **AND** each required event has the same `traceId`, `experimentId`, and `buildRequestId` captured from the UI request

#### Scenario: Essential metric payloads include diagnostic fields
- **WHEN** the validation reads the required research events
- **THEN** `chat_stream_completed` includes `chat_total_latency_ms`, `stream_chunk_count`, and `message_count`
- **AND** `langgraph_stream_completed` includes `langgraph_stream_duration_ms` and `server_created`
- **AND** `examiner_completed` includes `api_doc_length`, `rag_context_item_count`, and `rag_context_chars`
- **AND** `generator_completed` includes `tool_call_count` and `server_created`
- **AND** `mcp_create_input_normalized` includes `input_type`, `input_length`, and `input_hash`
- **AND** `openapi_generation_completed` includes `validation_passed`, `llm_calls`, and `retry_count`
- **AND** `docker_build_completed` includes `docker_build_success` and `build_log_count`
- **AND** `container_start_completed` includes `container_start_success`, `host_port`, and `container_port`
- **AND** `mcp_create_completed` includes `build_total_latency_ms` and `docker_status`
- **AND** `mcp_metadata_checked` includes `mcp_initialize_success` and `mcp_tool_count`

### Requirement: Generated MCP containers are tracked and removed
The system SHALL track the generated MCP server container for each run and remove it after validation finishes.

#### Scenario: Container identity is captured for a generated server
- **WHEN** a benchmark run receives generated server status from mcp-gen manager
- **THEN** the run record includes the generated `serverId`, MCP URL, and Docker `containerId` when a container was created
- **AND** the runner records a diagnostic if manager status cannot provide an unambiguous generated container identity

#### Scenario: Successful validation cleans up the generated container
- **WHEN** a generated MCP server finishes successful metadata and tool validation
- **THEN** the runner removes the Docker container identified by that run's generated `containerId`
- **AND** the run record includes cleanup status, cleanup latency, and any cleanup error message
- **AND** Compose baseline services such as MongoDB, RabbitMQ, Chroma, manager, proxy, agent, and chatbot backend remain running

#### Scenario: Failed validation retains the generated container
- **WHEN** a run fails after creating a generated MCP server container
- **THEN** the runner keeps that exact generated container available for inspection
- **AND** the run record marks cleanup as skipped with a diagnostic that validation failed
- **AND** the original build or validation failure remains the primary diagnostic

#### Scenario: Repeated demo does not accumulate generated containers
- **WHEN** the 12-build demo matrix finishes
- **THEN** no generated MCP server containers from those 12 runs remain running
- **AND** the final summary reports the number of containers created, removed, skipped, and failed to remove

### Requirement: Backend direct MCP probes validate generated MCP servers
The system SHALL validate generated MCP server tool behavior by calling safe mapped tools through the backend MCP client connection without relying on an LLM to invoke the tools.

#### Scenario: Backend direct probes call safe tools
- **WHEN** a generated MCP URL is connected and selected benchmark probes map to generated tools with safe arguments
- **THEN** the runner sends those probes to the backend direct MCP validation endpoint
- **AND** the backend invokes the matching MCP tools with fixture-provided `toolArgs`
- **AND** the run records pass, fail, and skipped outcomes plus a direct tool-call pass rate from non-skipped safe probe calls

#### Scenario: Backend direct probes are the cleanup gate
- **WHEN** backend metadata connects and all attempted direct MCP tool probes pass
- **THEN** the run is eligible for generated-container cleanup
- **AND** failed direct MCP tool probes retain the generated container for inspection

### Requirement: Inspector CLI diagnostics are captured for generated MCP servers
The system SHALL record generated MCP server protocol diagnostics with `@modelcontextprotocol/inspector` CLI mode when available.

#### Scenario: Inspector lists generated tools
- **WHEN** a generated MCP URL is available for a run
- **THEN** the runner invokes Inspector CLI in non-UI mode to call `tools/list`
- **AND** the run records whether Inspector connected, how many tools were listed, and any protocol error

#### Scenario: Inspector calls safe probe tools
- **WHEN** a selected benchmark probe maps to a generated tool and has safe arguments
- **THEN** the runner invokes Inspector CLI `tools/call` for that tool
- **AND** the run records pass, fail, and skipped outcomes from Inspector CLI results
- **AND** Inspector-based pass rate is computed from non-skipped safe probe calls as diagnostic data

#### Scenario: Inspector validation is machine-readable
- **WHEN** Inspector CLI validation completes
- **THEN** the runner stores parseable JSON or normalized JSON-derived results in the raw run record
- **AND** the benchmark does not require opening the Inspector UI for diagnostic collection
