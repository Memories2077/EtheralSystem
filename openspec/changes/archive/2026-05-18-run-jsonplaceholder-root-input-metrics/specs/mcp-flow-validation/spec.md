## ADDED Requirements

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
- **THEN** the research event store contains `chat_stream_completed`, `langgraph_stream_completed`, `examiner_completed`, `generator_completed`, `mcp_create_input_normalized`, `openapi_generation_completed`, `docker_build_completed`, `container_start_completed`, `mcp_create_completed`, and `mcp_metadata_checked` for the captured `buildRequestId`
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
