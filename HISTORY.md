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

## [2026-03-29 11:15] - JWT Expiration & Claude Config Synchronization
- **Issue**: 
    - Potential string corruption in JWT `exp` timestamp due to implicit type conversion.
    - Consistency issues where `getClaudeConfig` lacked the `--allow-http` flag for localhost URLs compared to `generateClaudeConfig`.
- **Changes**:
    - Refactored `src/mcp-server-manager.ts` to explicitly calculate `now` and `expiration` as integers before signing the JWT.
    - Synchronized `getClaudeConfig` to call `generateClaudeConfig`, ensuring unified output format and proper flag handling across all API endpoints.

## [2026-03-31 00:05] - OpenAPI Generation Logic & Input Type Detection Fix
- **Issue**: Plain text input (e.g., "Notion API") was misidentified as YAML, leading to failed validation and LLM hallucinations (returning Reddit API example).
- **Root Cause**: `js-yaml.load()` returns a string for plain text instead of throwing an error, causing `inputType` to be set to `"yaml"` incorrectly. This resulted in the LLM being prompted to "fix" invalid YAML from a 44-byte plain text string, leading to hallucination using internal examples.
- **Changes**:
    - Updated `src/mcp-server-manager.ts` to strictly validate `inputType` by checking if the result of `JSON.parse` or `yaml.load` is an object (and not null).
    - Ensures plain text descriptions correctly trigger the prompt-to-spec generation flow instead of the direct-copy/validate flow.

