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

## [2026-04-02 23:25] - Knowledge Contamination & Auth Hallucination Fix
- **Issue**: LLM hallucinated authentication schemes (OAuth2, Bearer tokens, API keys) in generated OpenAPI specs and MCP servers, even for APIs that required no authentication.
- **Root Cause**: Base prompts contained hardcoded Reddit/Notion authentication examples and mandatory instructions to "Include security schemes" that were always injected, biasing the LLM toward adding auth even when unnecessary.
- **Changes**:
    - Added `detectAuthInInput` and `detectAuthInSpec` in `src/generator/prompt.ts` to programmatically detect if an API requires authentication.
    - Made authentication examples (Reddit, Twilio) and instructions conditional in `buildOpenAPIPromptWithExamples` and `buildPromptWithExamples`.
    - Removed hardcoded auth-heavy examples (Notion, Reddit) from the core system instructions to prevent "knowledge contamination."
    - Implemented **Anti-Contamination Guards** in prompts to explicitly instruct the LLM to skip security sections if no authentication is found in the input.
    - Synchronized YAML and MCP generation pipelines to ensure zero-auth inputs lead to zero-auth outputs.

## [2026-04-08 00:20] - Hybrid Agent Skill System & Modular Prompt Refactor
- **Feature**: Refactored the monolithic prompt management system into a modular "Skill Library" architecture.
- **Goal**: Improved maintainability, simplified prompt iteration, and enhanced prevention of knowledge contamination through dynamic skill injection.
- **Changes**:
    - **Skill Library**: Extracted hardcoded prompt strings from `src/generator/prompt.ts` into individual Markdown files organized by domain in `src/skills/` (`mcp/`, `openapi/`, `auth/`).
    - **Skill Router**: Implemented `src/skills/skill-router.ts` to handle asynchronous file loading and caching of prompt components.
    - **Dynamic Assembly**: Prompt builders now dynamically assemble the system and user instructions based on context (e.g., swapping between auth-specific and anti-contamination skills).
    - **Asynchronous Pipeline**: Updated `src/generator/index.ts` and `prompt.ts` to support asynchronous prompt generation, preparing the system for more complex agentic workflows.
    - **Cleanup**: Removed over 1,400 lines of hardcoded strings from the codebase, reducing the size of `prompt.ts` by ~80%.

## [2026-04-08 18:24] - Post-Refactor Bug Fixes (Code Review)
- **Issue**: Code review after the Skill System refactor revealed 3 critical bugs and 3 medium-severity issues.
- **Changes**:
    - **Dead field removed** (`src/skills/skill-router.ts`): Removed the redundant `auth` field from `assembleOpenAPISkills` return type. `prompt.ts` was already computing the auth section itself (with `{{INPUT_FORMAT}}` interpolation) using `requirements` and `antiContamination` directly — the `auth` field was never consumed.
    - **YAML block removed** (`src/skills/mcp/user_message.md`): Removed a misplaced 40-line YAML syntax/indentation guide that had been copy-pasted from `openapi/user_message.md`. The MCP prompt generates TypeScript, not YAML, and this block was confusing the LLM about the expected output format.
    - **Placeholder repositioned** (`src/skills/openapi/user_message.md`): Moved `{{AUTH_OUTPUT_SECTION}}` out of the "CRITICAL OUTPUT REQUIREMENTS" block and into its own clearly labeled `⚠️ AUTHENTICATION OUTPUT RULES:` section to prevent auth instructions from being injected mid-sentence into format rules.
    - **Regex fail warning** (`src/generator/prompt.ts`): Added `console.warn` logs when the Reddit and Twilio input-extraction regexes do not match, making format regressions in `input_example.ts` immediately visible instead of failing silently.
    - **Double-delete removed** (`src/generator/index.ts`): Removed the second redundant `exists()` → `remove()` block in both `generateOpenAPISpec` and `generateMCP`. The block was dead code — the file had already been deleted in the preceding block and could never exist at that point.
    - **baseDir comment added** (`src/skills/skill-router.ts`): Added an inline comment explaining that `baseDir = __dirname` relies on `skill-router.ts` being located inside `src/skills/`, to prevent silent path errors if the file is ever relocated.


## [2026-04-12 00:05] - Shared Network Migration & Service Exposure
- **Feature**: Integrated `mcp-gen` stack into the global `mcp-network` to allow direct communication from other projects (e.g., LangGraph agent).
- **Changes**:
    - Updated `docker-compose.yml` to define `mcp-network` as an external network.
    - Attached all services (`mongodb`, `rabbitmq`, `docker-manager`, `my-proxy`, `mongo-express`) to the `mcp-network`.
    - Exposed `docker-manager` to the network, enabling other containers to reach the `/api/mcp/create` endpoint via `http://docker-manager:8080`.
