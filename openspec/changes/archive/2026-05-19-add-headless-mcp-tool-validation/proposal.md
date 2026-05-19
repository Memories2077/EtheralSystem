## Why

The current JSONPlaceholder validation proves the generated MCP server can be activated and its tools can be listed, but it does not provide a convenient headless proof that the chatbot can actually invoke one of those tools and return a tool-backed answer. This leaves Codex/CI dependent on browser automation for a backend capability that should be testable through the existing service APIs.

## What Changes

- Add a headless system validation flow that drives the existing FastAPI `/chat` and `/mcp/metadata` paths without opening the chatbot UI.
- Validate the generated MCP server lifecycle from build prompt, to metadata initialization/list-tools, to a follow-up chat request that requires the active generated tool.
- Add machine-readable evidence that at least one generated MCP tool was invoked successfully, rather than relying only on final natural-language text.
- Keep browser E2E focused on UI state/rendering; use the new headless flow for Codex-friendly MCP tool-call validation.
- Preserve existing public route shapes unless a verified instrumentation gap requires a backward-compatible optional field or event.

## Capabilities

### New Capabilities

### Modified Capabilities
- `mcp-flow-validation`: Require a non-browser validation path that proves active generated MCP tools are callable from chatbot requests and emits/asserts machine-readable invocation evidence.

## Impact

- Headless validation script or E2E test harness for the chatbot backend flow.
- FastAPI chat streaming instrumentation for generated MCP tool invocation evidence.
- Research event assertions for tool-call success, correlation IDs, and response usefulness.
- Existing Docker Compose/MetaClaw/mcp-gen runtime setup used by current E2E validations.
