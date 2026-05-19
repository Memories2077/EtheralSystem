# Headless MCP Tool Validation

This validation proves the generated MCP server is not only activated and listed, but also used by the chatbot backend in a follow-up request. It does not open the browser.

## Required Services

- Chatbot backend: `http://localhost:8000`
- mcp-gen manager: `http://localhost:8080`
- MongoDB or JSONL research events with `RESEARCH_METRICS_ENABLED=true`
- MetaClaw/LangGraph and at least one configured LLM provider, as required by the existing MCP build flow

## Run

Start the stack with research metrics enabled:

```bash
RESEARCH_METRICS_ENABLED=true \
RESEARCH_EXPERIMENT_ID=jsonplaceholder-headless-mcp-tool \
RESEARCH_EVENTS_DB=docker \
RESEARCH_EVENTS_COLLECTION=research_events \
RESEARCH_EVENTS_JSONL_PATH=/repo/reports/jsonplaceholder-ui-metrics/research-events.jsonl \
RESEARCH_EVENTS_JSONL_MIRROR=true \
docker compose up -d --build
```

Then run the headless validator:

```bash
bun run test:headless-mcp-tool
```

Useful overrides:

```bash
E2E_BACKEND_URL=http://localhost:8000 \
E2E_MCP_MANAGER_URL=http://localhost:8080 \
HEADLESS_MCP_MONGO_URI=mongodb://localhost:27017 \
RESEARCH_EVENTS_DB=docker \
bun run test:headless-mcp-tool
```

If the root `INPUT_SAMPLE.txt` fixture is absent, the runner falls back to `input/jsonplaceholder.txt`. Override with:

```bash
HEADLESS_MCP_INPUT_PATH=input/jsonplaceholder.txt bun run test:headless-mcp-tool
```

## Expected Flow

- Submit the JSONPlaceholder build prompt to backend `POST /chat`.
- Parse the streamed `mcp_build_complete` event for `serverId` and MCP URL.
- Poll mcp-gen manager `GET /api/mcp/:serverId/status` until `running`.
- Call backend `POST /mcp/metadata` with the generated MCP URL and correlation IDs.
- Submit a follow-up backend `POST /chat` with `mcpServers: [generatedMcpUrl]`.
- Poll research events for `mcp_tool_invocation_completed`.

The runner prints:

```text
[headless-mcp-tool-validation-summary] {"buildRequestId":"...","serverId":"...","metadataToolCount":1,"selectedTool":"...","invocationStatus":"success",...}
```

## Troubleshooting Boundaries

- Fails before build chat: check backend `/health`, manager `/api/mcp/stats`, LLM credentials, and the JSONPlaceholder fixture path.
- Metadata succeeds but invocation fails with `mcp_tool_not_invoked`: the generated tool listed correctly, but the follow-up LLM response did not call it.
- Invocation event is missing: verify `RESEARCH_METRICS_ENABLED=true`, MongoDB is reachable through `HEADLESS_MCP_MONGO_URI` or `E2E_MONGO_URI`, or JSONL mirror is mounted to `reports/jsonplaceholder-ui-metrics/research-events.jsonl`.
- Tool invocation event exists with `mcp_tool_result_missing`: the LLM emitted a tool call but no matching tool result was observed in the backend stream.
- Browser/localStorage issues are covered by `bun run test:e2e:jsonplaceholder`, not this runner.
