## 1. Environment and Fixture Checks

- [x] 1.1 Verify Metaclaw, frontend, backend, Mongo, and mcp-gen manager are reachable from the current running Docker Compose stack.
- [x] 1.2 Validate root `INPUT_SAMPLE.txt` exists, is non-empty, and is the JSONPlaceholder fixture used by the browser validation.
- [x] 1.3 Confirm research metrics are enabled for the run with `RESEARCH_METRICS_ENABLED`, `RESEARCH_EXPERIMENT_ID`, `NEXT_PUBLIC_RESEARCH_EXPERIMENT_ID`, and research event database settings.

## 2. UI to MCP Server Manager Flow

- [x] 2.1 Ensure the browser E2E flow reads root `INPUT_SAMPLE.txt` and submits it through the chatbot UI rather than calling backend APIs directly.
- [x] 2.2 Capture the UI `POST /chat` payload and assert non-empty `buildRequestId`, `traceId`, `sessionId`, and `experimentId`.
- [x] 2.3 Verify the backend orchestration reaches `create_MCPServer` and receives a generated server identity plus MCP URL from the mcp-gen manager.
- [x] 2.4 Verify the UI stores the generated MCP server as active state with a non-empty tools list.
- [x] 2.5 Verify the generated MCP URL succeeds through the UI metadata path and returns the same server identity/status plus at least one tool.

## 3. Essential Metrics Logging

- [x] 3.1 Query the research event store by captured `buildRequestId` and reject stale or cross-run events.
- [x] 3.2 Assert required events exist for chat streaming, LangGraph orchestration, examiner, generator, input normalization, OpenAPI generation, Docker build, container start, MCP create completion, and MCP metadata verification.
- [x] 3.3 Assert all required events share the captured `traceId`, `experimentId`, and `buildRequestId`.
- [x] 3.4 Assert diagnostic metric keys exist for latency, stream chunks, message counts, server creation, RAG context, tool calls, input hash/length/type, validation, LLM calls, retries, Docker build, container start, build status, metadata initialization, and tool count.
- [x] 3.5 Emit a compact validation summary with stage status, latency fields, generated server identity, MCP URL, tool count, and any error category.

## 4. Verification and Documentation

- [x] 4.1 Run `bun run test:e2e:jsonplaceholder` against the already-running stack and capture the pass/fail boundary.
- [x] 4.2 If the test fails, patch only the smallest broken boundary while preserving existing public route shapes.
- [x] 4.3 Update JSONPlaceholder E2E documentation with the required environment variables, command, expected metric events, and troubleshooting boundaries.
- [x] 4.4 Re-run `bun run test:e2e:jsonplaceholder` and confirm the UI-to-manager-to-UI flow and essential metric assertions pass.
