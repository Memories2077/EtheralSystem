## Context

The current JSONPlaceholder browser E2E submits root `INPUT_SAMPLE.txt`, waits for an MCP build, verifies manager status, calls `/mcp/metadata`, and asserts correlated metrics. That confirms the generated runtime can initialize and expose a non-empty tool list, but it does not prove a follow-up chatbot request actually causes the LLM agent to invoke a generated MCP tool.

The relevant backend pieces already exist:

- `POST /chat` streams build and chat responses through FastAPI SSE.
- `POST /mcp/metadata` initializes streamable HTTP MCP sessions and loads tools into backend state.
- `get_or_create_agent` builds a LangGraph agent with active MCP tools when `mcpServers` is present.
- Research events already correlate `traceId`, `experimentId`, `sessionId`, `buildRequestId`, and `serverId`.

The missing piece is a non-browser runner and a reliable invocation signal that can be asserted by Codex or CI without inspecting rendered UI.

## Goals / Non-Goals

**Goals:**

- Provide a headless validation command for the generated MCP tool-call path.
- Reuse existing `/chat`, `/mcp/metadata`, mcp-gen manager, and research metrics flows.
- Prove a follow-up chatbot request includes the active generated MCP URL and invokes at least one generated MCP tool.
- Record/assert machine-readable invocation evidence so the test does not rely only on LLM final text.
- Keep browser E2E coverage for UI activation and localStorage behavior.

**Non-Goals:**

- Replace the existing browser JSONPlaceholder metrics E2E.
- Add a new public product API solely for tests.
- Force deterministic generated tool names.
- Introduce a tracing vendor, dashboard, or new persistence system.
- Make normal unit tests depend on live LLM providers, Docker, or generated MCP containers.

## Decisions

1. Add a headless system runner instead of another browser test.
   - The runner should live with system/E2E validation assets and use `fetch` plus SSE parsing.
   - It should call the same FastAPI routes the UI calls, but it should not open Playwright or depend on localStorage.
   - A root package script should make it easy for Codex/CI to run the validation explicitly.

2. Drive the same three-step flow as the UI.
   - Step 1: `POST /chat` with the JSONPlaceholder build prompt and stable correlation IDs.
   - Step 2: parse SSE for `mcp_build_complete`, poll manager status if needed, then call `POST /mcp/metadata`.
   - Step 3: `POST /chat` again with `mcpServers: [generatedMcpUrl]` and a follow-up prompt that names a returned tool and asks for JSONPlaceholder data that should come from the tool.

3. Assert tool invocation through instrumentation, not prose alone.
   - The backend should count generated MCP tool invocations during the follow-up chat stream by inspecting LangGraph agent stream chunks for tool-call/tool-result messages where available.
   - On success, record a correlated research event such as `mcp_tool_invocation_completed` with `tool_name`, `mcp_tool_invocation_count`, `mcp_tool_success`, `mcp_url_count`, and safe response metadata.
   - The runner may also assert final answer content, but final text is supporting evidence, not the primary proof.

4. Keep route contracts backward compatible.
   - Existing `/chat` and `/mcp/metadata` request shapes remain valid.
   - Any new evidence should be emitted as optional research metrics and optional SSE diagnostic payloads, not required client fields.
   - Metrics remain best-effort and must not fail user chat requests when persistence is unavailable.

5. Make failures actionable.
   - The runner should print a compact summary with build identifiers, server ID, MCP URL, metadata tool count, selected follow-up tool, invocation event status, and a short final response preview.
   - If metadata succeeds but invocation does not, the output should distinguish LLM routing failure from MCP connection failure and from missing metrics persistence.

## Risks / Trade-offs

- [Risk] LLMs may ignore the follow-up instruction and answer from model memory. -> Use a prompt that references the exact metadata tool name and require invocation evidence from backend instrumentation.
- [Risk] LangGraph stream chunk shapes vary between providers or versions. -> Implement instrumentation defensively around known `AIMessage.tool_calls` and `ToolMessage` shapes, and cover it with focused backend tests.
- [Risk] Full headless flow still needs live services and can be slow. -> Keep it as an explicit system validation script with generous timeouts, separate from unit tests.
- [Risk] Tool results may contain sensitive data for other APIs. -> Persist only tool names, counts, status, hashes, lengths, and safe diagnostic metadata; do not store raw private outputs.
- [Risk] Adding SSE diagnostics could affect clients if treated as content. -> Prefer research events for hard assertions; if SSE diagnostics are added, use a distinct optional `type` and keep existing content chunks unchanged.
