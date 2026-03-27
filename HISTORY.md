# Project History Log

## [2026-03-27 23:45] - 500 Error Fix & State Recovery
- **Issue**: Manager returned 500 Internal Server Error when receiving "ready" notifications from containers after a manager restart.
- **Root Cause**: The in-memory `servers` Map was not repopulated from MongoDB during recovery, and the `/ready` endpoint lacked robust error handling.
- **Changes**:
    - Updated `recoverRunningContainers` in `src/mcp-server-manager.ts` to populate the `servers` Map.
    - Improved `/api/mcp/:serverId/ready` with detailed error logging and existence checks.
    - Reordered `MCPServerManager.start()` sequence to ensure state recovery happens before RabbitMQ consumers start.

## [2026-03-27 23:55] - RAG Context Integration
- **Feature**: Support for `rag_context` in the server creation payload to improve LLM generation accuracy.
- **Changes**:
    - Updated `/api/mcp/create` payload to accept `rag_context`.
    - Added `ragContext` property to `ServerLogEntry` interface.
    - Passed `RAG_CONTEXT` as an environment variable to MCP Server containers.
    - Updated `generateOpenAPISpec` and `generateMCP` functions to accept and utilize `ragContext`.
    - Enhanced prompt generation templates in `src/generator/prompt.ts` to include `rag_context` as a non-mandatory reference for the LLM.
    - Updated `test/test-generation.ts` to support RAG context during manual testing.
