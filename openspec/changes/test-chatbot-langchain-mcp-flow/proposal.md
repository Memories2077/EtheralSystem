## Why

The chatbot-to-mcp-gen flow is a cross-service path that can fail at UI state, FastAPI proxying, LangGraph tool invocation, generated MCP activation, or human-feedback import. We need an implementation-ready validation plan that proves the full path works with the repo's real example input and only patches code when a verified break is found.

## What Changes

- Add an end-to-end validation plan for the chatbot -> FastAPI -> LangGraph/LangChain -> mcp-gen server generation flow.
- Use root `docker compose` as the stack startup path, with MetaClaw started separately from `../MetaClaw`.
- Use root `INPUT_SAMPLE.txt` as the build input.
- Verify generated MCP server activation in the chatbot UI, metadata retrieval, and tool invocation from a follow-up chat.
- Verify the existing human feedback UI and backend path before adding UI changes.
- Patch only confirmed defects in the UI, FastAPI proxy layer, LangGraph/mcp-gen integration, or mcp-gen feedback import.
- Keep Docker cleanup scoped to EtheralSystem containers/images and generated MCP resources related to this test run.

## Capabilities

### New Capabilities
- `mcp-flow-validation`: Validates MCP server generation, activation, tool use, and human-feedback learning across chatbot, FastAPI, LangGraph, and mcp-gen.

### Modified Capabilities

None.

## Impact

- Affected systems: `apps/chatbot_mcp_client`, `apps/langChain-application`, `apps/mcp-gen`, root `docker-compose.yml`, and sibling `../MetaClaw` startup.
- Public interfaces remain unchanged unless a verified defect requires a compatible fix.
- Expected routes remain `POST /chat`, `POST /mcp/metadata`, `GET /mcp/servers`, `POST /mcp/{serverId}/feedback`, `GET /mcp/{serverId}/claude-config`, and the existing mcp-gen `/api/mcp/*` routes.
- Testing uses Bun for mcp-gen checks and Docker Compose for full-stack validation.
