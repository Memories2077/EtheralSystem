## Why

The project needs a repeatable proof that the root JSONPlaceholder input can drive the full browser workflow from chat UI through FastAPI, LangGraph, mcp-gen manager, generated MCP runtime activation, and back into the UI. The current metrics MVP records many events, but the validation contract does not yet assert that the browser flow emits the essential correlated metrics needed for paper evidence.

## What Changes

- Validate root `INPUT_SAMPLE.txt` as the canonical JSONPlaceholder browser fixture.
- Add browser E2E coverage for UI submission, SSE build completion, generated MCP activation, and runtime metadata verification.
- Require correlated research metric assertions for the essential chat, orchestration, generation, build, Docker, and runtime stages.
- Preserve existing public route shapes; only propagate optional research context through already-supported request fields.

## Capabilities

### New Capabilities

### Modified Capabilities
- `mcp-flow-validation`: Require browser-level JSONPlaceholder flow validation and essential correlated research metrics.

## Impact

- Chatbot frontend request context propagation and E2E test harness.
- FastAPI runtime metadata metrics correlation.
- Docker Compose/environment defaults for unified research event storage.
- OpenSpec validation contract and implementation task tracking.
