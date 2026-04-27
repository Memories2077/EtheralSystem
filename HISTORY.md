# Project History Log

## [2026-04-27] - Security & Code Quality Improvements

- **Security Fix**: Replaced wildcard CORS (`Access-Control-Allow-Origin: *`) with configurable origin whitelist
  - Added `CORS_ORIGINS` environment variable (comma-separated list of allowed origins)
  - Properly supports Docker container-to-container communication without hardcoding localhost
  - Enables `Access-Control-Allow-Credentials` for authorized requests
- **Feature Enhancement**: Added comprehensive input validation to feedback endpoint
  - Comment length limit (1000 characters max)
  - HTML sanitization to prevent XSS
  - Type-safe FeedbackEntry interface
- **Reliability**: Fixed container recovery state synchronization
  - Ensures in-memory server state matches database after container cleanup
  - Prevents stale container references from persisting
- **Observability**: Added database index on `{ status: 1, updatedAt: -1 }` to optimize stats queries
- **Error Handling**: Implemented standardized `sendError()` helper
  - Consistent error response format across all endpoints
  - Development mode includes error details; production safe
  - Removes inconsistent response structures
- **Retry Logic**: Fixed LLM call count logging (was off by one)
- **Rate Limiting**: Added in-memory rate limiter to feedback endpoint
  - Configurable via `FEEDBACK_RATE_LIMIT_WINDOW_MS` and `FEEDBACK_RATE_LIMIT_MAX`
  - Prevents abuse of feedback system
- **TypeScript Safety**: Eliminated unsafe `any` casts
  - Defined `FeedbackEntry` interface
  - Improved type annotations in `SaveToDB` method
  - Better type inference throughout
- **Files Modified**:
  - `src/mcp-server-manager.ts` (CORS, validation, error handling, rate limiting, indexing)
  - `src/utils/config.ts` (whitespace cleanup)

## [2026-04-25] - MCP Server Feedback API & CORS Support

- **Feature**: Added feedback collection for generated MCP servers with like/dislike counters and persistent feedback history.
- **Schema Extension**: Extended `ServerLogEntry` to include:
  - `likeCount: number` (default 0)
  - `dislikeCount: number` (default 0)
  - `feedbacks: Array<{ feedbackId, type, userId?, comment?, timestamp }>`
- **API Endpoint**: Created `POST /api/mcp/:serverId/feedback`:
  - Validates `type` is 'like' or 'dislike'
  - Atomic MongoDB updates (`$inc` counters, `$push` feedback entry)
  - Returns updated `likeCount` and `dislikeCount`
- **CORS**: Enabled cross-origin requests to support chatbot frontend on port 9002:
  - `Access-Control-Allow-Origin: *`
  - `Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS`
  - `Access-Control-Allow-Headers: Content-Type, Authorization`
- **Sanitization**: Updated `/api/mcp/servers` to filter sensitive fields before sending to frontend:
  - Removed: `token`, `containerId`, `hostPort`, `containerPort`, `dockerImage`, `inputContent`, `action`, `buildLogs`, `ragContext`
  - Sanitized `feedbacks` array to hide `userId` fields
- **Client**: `chatbot_mcp_client` implemented corresponding UI component (`McpServerFeedbackList`) with optimistic updates.
- **Files Modified**:
  - `src/mcp-server-manager.ts` (ServerLogEntry interface, feedback endpoint, CORS middleware, sanitization)
- **Integration**: Feedback data now stored in same MongoDB collection (`logs`) as server metadata, maintaining data locality.

## [2026-04-20 00:00] - MetaClaw Integration for Intelligent Code Generation

- **Feature**: Integrated mcp-gen with MetaClaw learning proxy to enhance code generation with accumulated skills and best practices.
- **Changes** (`src/utils/genai.ts`):
  - Added MetaClaw routing check using `metaclawConfig.enabled`.
  - When enabled, routes LLM calls through `ChatOpenAI` proxy instead of direct Gemini/Groq.
  - MetaClaw injects relevant skills (MCP patterns, auth, best practices) into system prompt.
  - Maintains fallback to direct provider calls if MetaClaw disabled.
- **Configuration**: Add to `.env`:
  - `METACLAW_ENABLED=true`
  - `METACLAW_BASE_URL=http://host.docker.internal:30000/v1`
  - `METACLAW_API_KEY=metaclaw`
- **Benefit**: MCP server generation now benefits from MetaClaw's skill library, improving quality and consistency across generated code.

## [2026-04-21 00:00] - Configuration Documentation & Centralization Improvements

- **Documentation**: Updated `.env.example` with comprehensive MetaClaw configuration documentation, including clear explanations of all environment variables and their purpose.
- **Consistency**: Aligned configuration structure with `chatbot_mcp_client` repository for better developer experience across the monorepo.
- **Testing**: Verified MetaClaw integration remains fully functional after documentation updates.

## [2026-04-13 21:00] - Dynamic PUBLIC_URL for Local & Tunnel Access

- **Issue**: Hardcoded `my-proxy` host prevented local tools (like MCP Inspector) from connecting to generated servers when run outside the Docker network.
- **Fix**: Updated `docker-compose.yml` to use `PUBLIC_URL=${PUBLIC_URL:-http://localhost:8081}`.
- **Benefit**: Defaults to `localhost` for seamless local development while remaining configurable for Cloudflare Tunnels via environment variables.

## [2026-04-13 10:30] - Inter-Container Communication Fix (PUBLIC_URL)

- **Issue**: Generated MCP servers were unreachable from other containers because `PUBLIC_URL` was hardcoded to `localhost:8081`.
- **Fix**: Updated `PUBLIC_URL` in `docker-compose.yml` to `http://my-proxy:8081`. This ensures that when the manager returns a connection URL to a client container (like the LangGraph agent), the client can correctly route the traffic through the `my-proxy` service in the shared `mcp-network`.

## [2026-04-12 05:00] - LangGraph Stream Response Fix (Blank Output Diagnosis) — `chatbot_mcp_client`

- **Issue**: After successfully creating an MCP server via LangGraph, the chatbot displayed a blank AI message box (only showing the static "Verified Output" footer) with no actual content.
- **Root Cause**: The LangGraph stream handler in `use-chat-store.ts` used `streamMode: "messages"` which only streamed message chunks. The final response from `supervisor_final_node` (containing `final_response`) was delivered via the `values` stream, not the `messages` stream. Message content could also arrive in multiple formats (plain string, array of content blocks) that the frontend didn't fully handle.
- **Changes** (`chatbot_mcp_client/src/lib/hooks/use-chat-store.ts`):
  - Added `extractContent()` helper to handle all LangGraph content formats.
  - Changed `streamMode` to `["messages", "values"]` to capture both message chunks and final state.
  - Added handler for `values` events to read `final_response` directly.
  - Added post-stream fallback via `client.threads.get()` if content remains empty.
  - Added comprehensive `[LangGraph Stream]` debug logging for every received chunk.
  - Added user-visible error message if all fallbacks fail.

## [2026-04-12 00:05] - Shared Network Migration & Service Exposure

- **Feature**: Integrated `mcp-gen` stack into the global `mcp-network` to allow direct communication from other projects (e.g., LangGraph agent).
- **Changes**:
  - Updated `docker-compose.yml` to define `mcp-network` as an external network.
  - Attached all services (`mongodb`, `rabbitmq`, `docker-manager`, `my-proxy`, `mongo-express`) to the `mcp-network`.
  - Exposed `docker-manager` to the network, enabling other containers to reach the `/api/mcp/create` endpoint via `http://docker-manager:8080`.

## [2026-04-08 18:24] - Post-Refactor Bug Fixes (Code Review)

- **Issue**: Code review after the Skill System refactor revealed 3 critical bugs and 3 medium-severity issues.
- **Changes**:
  - **Dead field removed** (`src/skills/skill-router.ts`): Removed the redundant `auth` field from `assembleOpenAPISkills` return type. `prompt.ts` was already computing the auth section itself (with `{{INPUT_FORMAT}}` interpolation) using `requirements` and `antiContamination` directly — the `auth` field was never consumed.
  - **YAML block removed** (`src/skills/mcp/user_message.md`): Removed a misplaced 40-line YAML syntax/indentation guide that had been copy-pasted from `openapi/user_message.md`. The MCP prompt generates TypeScript, not YAML, and this block was confusing the LLM about the expected output format.
  - **Placeholder repositioned** (`src/skills/openapi/user_message.md`): Moved `{{AUTH_OUTPUT_SECTION}}` out of the "CRITICAL OUTPUT REQUIREMENTS" block and into its own clearly labeled `⚠️ AUTHENTICATION OUTPUT RULES:` section to prevent auth instructions from being injected mid-sentence into format rules.
  - **Regex fail warning** (`src/generator/prompt.ts`): Added `console.warn` logs when the Reddit and Twilio input-extraction regexes do not match, making format regressions in `input_example.ts` immediately visible instead of failing silently.
  - **Double-delete removed** (`src/generator/index.ts`): Removed the second redundant `exists()` → `remove()` block in both `generateOpenAPISpec` and `generateMCP`. The block was dead code — the file had already been deleted in the preceding block and could never exist at that point.
  - **baseDir comment added** (`src/skills/skill-router.ts`): Added an inline comment explaining that `baseDir = __dirname` relies on `skill-router.ts` being located inside `src/skills/`, to prevent silent path errors if the file is ever relocated.

## [2026-04-08 00:20] - Hybrid Agent Skill System & Modular Prompt Refactor

- **Feature**: Refactored the monolithic prompt management system into a modular "Skill Library" architecture.
- **Goal**: Improved maintainability, simplified prompt iteration, and enhanced prevention of knowledge contamination through dynamic skill injection.
- **Changes**:
  - **Skill Library**: Extracted hardcoded prompt strings from `src/generator/prompt.ts` into individual Markdown files organized by domain in `src/skills/` (`mcp/`, `openapi/`, `auth/`).
  - **Skill Router**: Implemented `src/skills/skill-router.ts` to handle asynchronous file loading and caching of prompt components.
  - **Dynamic Assembly**: Prompt builders now dynamically assemble the system and user instructions based on context (e.g., swapping between auth-specific and anti-contamination skills).
  - **Asynchronous Pipeline**: Updated `src/generator/index.ts` and `prompt.ts` to support asynchronous prompt generation, preparing the system for more complex agentic workflows.
  - **Cleanup**: Removed over 1,400 lines of hardcoded strings from the codebase, reducing the size of `prompt.ts` by ~80%.

## [2026-04-02 23:25] - Knowledge Contamination & Auth Hallucination Fix

- **Issue**: LLM hallucinated authentication schemes (OAuth2, Bearer tokens, API keys) in generated OpenAPI specs and MCP servers, even for APIs that required no authentication.
- **Root Cause**: Base prompts contained hardcoded Reddit/Notion authentication examples and mandatory instructions to "Include security schemes" that were always injected, biasing the LLM toward adding auth even when unnecessary.
- **Changes**:
  - Added `detectAuthInInput` and `detectAuthInSpec` in `src/generator/prompt.ts` to programmatically detect if an API requires authentication.
  - Made authentication examples (Reddit, Twilio) and instructions conditional in `buildOpenAPIPromptWithExamples` and `buildPromptWithExamples`.
  - Removed hardcoded auth-heavy examples (Notion, Reddit) from the core system instructions to prevent "knowledge contamination."
  - Implemented **Anti-Contamination Guards** in prompts to explicitly instruct the LLM to skip security sections if no authentication is found in the input.
  - Synchronized YAML and MCP generation pipelines to ensure zero-auth inputs lead to zero-auth outputs.

## [2026-03-31 00:05] - OpenAPI Generation Logic & Input Type Detection Fix

- **Issue**: Plain text input (e.g., "Notion API") was misidentified as YAML, leading to failed validation and LLM hallucinations (returning Reddit API example).
- **Root Cause**: `js-yaml.load()` returns a string for plain text instead of throwing an error, causing `inputType` to be set to `"yaml"` incorrectly. This resulted in the LLM being prompted to "fix" invalid YAML from a 44-byte plain text string, leading to hallucination using internal examples.
- **Changes**:
  - Updated `src/mcp-server-manager.ts` to strictly validate `inputType` by checking if the result of `JSON.parse` or `yaml.load` is an object (and not null).

## [2026-03-29 11:15] - JWT Expiration & Claude Config Synchronization

- **Issue**:
  - Potential string corruption in JWT `exp` timestamp due to implicit type conversion.
  - Consistency issues where `getClaudeConfig` lacked the `--allow-http` flag for localhost URLs compared to `generateClaudeConfig`.
- **Changes**:
  - Refactored `src/mcp-server-manager.ts` to explicitly calculate `now` and `expiration` as integers before signing the JWT.
  - Synchronized `getClaudeConfig` to call `generateClaudeConfig`, ensuring unified output format and proper flag handling across all API endpoints.

## [2026-03-27 23:55] - RAG Context Integration

- **Feature**: Support for `rag_context` in the server creation payload to improve LLM generation accuracy.
- **Changes**:
  - Updated `/api/mcp/create` payload to accept `rag_context`.
  - Added `ragContext` property to `ServerLogEntry` interface.
  - Passed `RAG_CONTEXT` as an environment variable to MCP Server containers.
  - Updated `generateOpenAPISpec` and `generateMCP` functions to accept and utilize `ragContext`.
  - Enhanced prompt generation templates in `src/generator/prompt.ts` to include `rag_context` as a non-mandatory reference for the LLM.
  - Updated `test/test-generation.ts` to support RAG context during manual testing.

## [2026-03-27 23:45] - 500 Error Fix & State Recovery

- **Issue**: Manager returned 500 Internal Server Error when receiving "ready" notifications from containers after a manager restart.
- **Root Cause**: The in-memory `servers` Map was not repopulated from MongoDB during recovery, and the `/ready` endpoint lacked robust error handling.
- **Changes**:
  - Updated `recoverRunningContainers` in `src/mcp-server-manager.ts` to populate the `servers` Map.
  - Improved `/api/mcp/:serverId/ready` with detailed error logging and existence checks.
  - Reordered `MCPServerManager.start()` sequence to ensure state recovery happens before RabbitMQ consumers start.
