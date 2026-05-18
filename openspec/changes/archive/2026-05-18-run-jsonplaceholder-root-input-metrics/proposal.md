## Why

The project needs a repeatable validation run for the root JSONPlaceholder input that proves the full browser-driven flow reaches the MCP server manager and returns usable generated MCP state to the UI. Because Metaclaw and Docker Compose are already running, this change focuses on executing the existing stack path and capturing the essential metrics needed to diagnose or prove each handoff.

## What Changes

- Use the project-root JSONPlaceholder input file as the canonical fixture for the validation run.
- Drive the flow from the chatbot UI through the backend orchestration into the MCP server manager, then verify generated MCP metadata and tool availability back in the UI.
- Log essential metrics for UI submission, request correlation, backend routing, MCP generation, server activation, runtime metadata fetch, tool invocation, response rendering, latency, status, and error surfaces.
- Preserve existing service contracts and route shapes; add only the instrumentation and assertions needed to make the end-to-end run observable.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mcp-flow-validation`: Require root JSONPlaceholder input execution with essential metric logging and successful UI-to-MCP-server-manager round trip verification.

## Impact

- Affected code: chatbot UI flow, E2E validation, research/metrics logging helpers, FastAPI/LangChain orchestration touchpoints, and `apps/mcp-gen/src/mcp-server-manager.ts` status/metadata paths.
- Affected systems: running Docker Compose stack, Metaclaw-managed services, generated MCP runtime, and browser automation.
- No intended breaking API changes.
