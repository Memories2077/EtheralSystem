## 1. Environment Preparation

- [x] 1.1 Record the current git status and note pre-existing untracked or dirty files before making any implementation changes.
- [x] 1.2 Confirm the test input source in root `INPUT_SAMPLE.txt` and use it as the primary chatbot build prompt.
- [x] 1.3 Start MetaClaw from `../MetaClaw` with `metaclaw start` and confirm the proxy is reachable.
- [x] 1.4 Start or rebuild the EtheralSystem stack from the repository root with Docker Compose.
- [x] 1.5 Verify service readiness for chatbot frontend, FastAPI `/health`, LangGraph agent, mcp-gen manager, mcp-gen proxy, MongoDB, RabbitMQ, and ChromaDB.

## 2. End-to-End MCP Generation Flow

- [x] 2.1 Submit the selected input example through the chatbot UI or equivalent `POST /chat` request.
- [x] 2.2 Verify FastAPI receives and forwards chat messages, `mcpServers`, `buildRequestId`, `userId`, `email`, `workspaceId`, and memory scope.
- [x] 2.3 Verify LangGraph/LangChain invokes `create_MCPServer` with the expected request content and context.
- [x] 2.4 Verify mcp-gen creates a server, returns an `mcp_build_complete` event, and exposes a generated MCP URL.
- [x] 2.5 Verify the chatbot stores the generated server as an active MCP server.

## 3. MCP Activation And Tool Use

- [x] 3.1 Verify `POST /mcp/metadata` initializes the generated MCP server and returns a non-empty tool list.
- [x] 3.2 Verify the generated server appears in the chatbot MCP tools panel with server identity and tools.
- [x] 3.3 Send a follow-up chat prompt that should invoke one generated tool.
- [x] 3.4 Confirm the agent calls at least one generated tool and the chatbot receives a useful tool-backed response or visible tool result.

## 4. Human Feedback Flow

- [x] 4.1 Verify the existing `McpServerFeedbackList` UI can display the generated server from `GET /mcp/servers`.
- [x] 4.2 Submit like or dislike feedback with an optional comment from the UI.
- [x] 4.3 Verify FastAPI proxies `POST /mcp/{serverId}/feedback` to mcp-gen `POST /api/mcp/:serverId/feedback`.
- [x] 4.4 Verify mcp-gen increments feedback counts and stores a feedback entry for the generated server.
- [x] 4.5 Verify mcp-gen triggers human feedback import and updates the related `skill_feedback` effectiveness through `humanFeedbackScore` and Bayesian success rate.

## 5. Defect Repairs

- [x] 5.1 If MCP generation, activation, metadata, tool use, or feedback fails, identify the smallest broken boundary before editing code.
- [x] 5.2 Patch UI state/API client issues only if the active MCP server or feedback UI does not use the existing backend contracts correctly.
- [x] 5.3 Patch FastAPI proxy issues only if `/chat`, `/mcp/metadata`, `/mcp/servers`, `/mcp/{serverId}/feedback`, or `/mcp/{serverId}/claude-config` drop required data or mishandle responses.
- [x] 5.4 Patch LangGraph/LangChain or mcp-gen issues only if `create_MCPServer`, generated server readiness, tool availability, or feedback import linkage is broken.
- [x] 5.5 Preserve existing public route shapes unless an existing route is proven insufficient.

## 6. Verification And Cleanup

- [x] 6.1 Run focused tests for any modified package, using Bun for mcp-gen checks and avoiding `npx`.
- [x] 6.2 Re-run the full chatbot -> LangGraph -> mcp-gen flow after fixes.
- [x] 6.3 Re-run the human feedback validation after fixes.
- [x] 6.4 Capture final evidence: service health, generated server ID/URL, tool list, tool invocation result, feedback response, and feedback effectiveness signal.
- [x] 6.5 Stop or remove only EtheralSystem and generated MCP Docker resources associated with the test run.
