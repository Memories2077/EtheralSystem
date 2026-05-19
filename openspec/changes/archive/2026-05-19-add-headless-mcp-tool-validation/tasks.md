## 1. Backend Invocation Evidence

- [x] 1.1 Add a small backend helper that extracts generated MCP tool-call/tool-result evidence from standard agent stream chunks without depending on one provider-specific shape.
- [x] 1.2 Instrument follow-up `/chat` streams to record a correlated `mcp_tool_invocation_completed` research event when generated MCP tools are invoked.
- [x] 1.3 Ensure invocation metrics include safe fields such as `mcp_tool_invocation_count`, `mcp_tool_success`, `mcp_url_count`, available tool count, and redacted/safe tool metadata only.
- [x] 1.4 Add focused backend tests for invocation evidence extraction, successful event recording, no-invocation diagnostics, and secret/raw-output redaction.

## 2. Headless Validation Runner

- [x] 2.1 Add a headless validation script that uses `fetch` and SSE parsing against the existing FastAPI `/chat` route.
- [x] 2.2 Implement the build stage using the JSONPlaceholder fixture, stable run identifiers, and parsing for generated `serverId` and MCP URL.
- [x] 2.3 Implement manager status polling and `/mcp/metadata` initialization with the captured correlation context.
- [x] 2.4 Implement the follow-up `/chat` stage with `mcpServers: [generatedMcpUrl]`, a prompt tied to a returned metadata tool, and assertions for no SSE errors plus useful JSONPlaceholder answer content.
- [x] 2.5 Assert machine-readable invocation evidence from the research event store or JSONL mirror and print a compact run summary for Codex/CI.

## 3. Developer Entry Points

- [x] 3.1 Add a root package script for running the headless MCP tool validation explicitly.
- [x] 3.2 Document required services, environment variables, expected summary output, and troubleshooting for metadata success vs tool-invocation failure.
- [x] 3.3 Keep the existing browser JSONPlaceholder E2E documented as UI-specific coverage rather than the primary backend tool-call validation path.

## 4. Verification

- [x] 4.1 Run focused backend tests for research metrics and MCP invocation instrumentation.
- [x] 4.2 Run existing mcp-gen research/status tests to ensure manager and metrics behavior still works.
- [x] 4.3 Run the new headless MCP tool validation against the local Compose/MetaClaw stack and capture the summary output.
- [x] 4.4 Run `openspec status --change add-headless-mcp-tool-validation` and validate the change is apply-ready.
