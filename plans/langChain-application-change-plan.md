# langChain-application repository change plan

Repository: `langChain-application`
Primary role: LangGraph multi-agent engine for examining API documentation, enriching generation context with RAG, invoking mcp-gen to create MCP servers, and indexing generated artifacts.

## Goal

Make the LangGraph engine clear, maintainable, and dependable as the orchestration layer between the chatbot backend and mcp-gen. Remove legacy ambiguity, standardize service URLs, and formalize the mcp-gen integration contract.

## Parallelization boundary

This plan can be assigned to an agent focused only on the `langChain-application` repository. Coordinate with the other repository agents only on shared service names, mcp-gen API contract, startup commands, and environment variable naming.

## Priority 0 changes

### 1. Fix setup and runtime documentation mismatches

Current confusion:

- `README.md` says Python `3.10+`, but `pyproject.toml` requires `>=3.12`.
- `README.md` says `sh manage.sh setup` and `sh manage.sh start`, but `manage.sh` does not implement `setup` or `start`.
- `manage.sh up` prints frontend as `http://localhost:3000`, while the chatbot repo uses port `9002`.

Recommended change:

- Align Python version across `README.md`, `pyproject.toml`, Dockerfile, and developer instructions.
- Either implement `setup` and `start` in `manage.sh`, or remove those commands from README.
- Update printed service URLs in `manage.sh`:
  - Frontend: `http://localhost:9002`
  - Chatbot backend: `http://localhost:8000`
  - LangGraph: `http://localhost:2024`
  - mcp-gen manager: `http://localhost:8080`
  - mcp-gen proxy: `http://localhost:8081`
- Document that `mcp-network` must exist before Docker Compose starts because it is external.

Files likely affected:

- `README.md`
- `pyproject.toml`
- `manage.sh`
- `docker-compose.yaml`
- `.env.example`

### 2. Standardize service URLs and environment variables

Current behavior:

- Docker Compose sets `MCP_BASE_URL=http://docker-manager:8080/api`.
- `.env.example` also sets `MCP_BASE_URL=http://docker-manager:8080/api`.
- `create_MCPServer` appends `/mcp/create`, producing `/api/mcp/create`.
- `generator_agent.py` trims `/api` before fetching `/api/mcp/:serverId/files`.

Recommended change:

Document and enforce these conventions:

- `MCP_BASE_URL` means mcp-gen API base and should include `/api`.
  - Docker: `http://docker-manager:8080/api`
  - Host-local: `http://localhost:8080/api`
- If a manager root URL is needed, create a separate variable:
  - `MCP_MANAGER_URL=http://docker-manager:8080`
- Do not infer root URL by trimming `/api` in multiple places. Centralize URL construction in one helper.

Recommended implementation:

- Add a utility function, for example `my_agent/utils/mcp_client.py`, that builds:
  - create URL
  - files URL
  - future status/delete URLs
- Use that helper in `tools/generator_tools/__init__.py` and `agents/sub_agents/generator_agent.py`.

### 3. Formalize the mcp-gen API integration contract

Current implicit contract:

`create_MCPServer` sends:

```json
{
  "request": "string",
  "userId": "string",
  "email": "string",
  "rag_context": []
}
```

It expects:

```json
{
  "serverId": "string",
  "claudeConfig": {},
  "status": "running"
}
```

Then it fetches generated files from `/api/mcp/:serverId/files`.

Recommended change:

- Create a local typed client or dataclass/Pydantic models for mcp-gen requests and responses.
- Validate mcp-gen responses before returning success to the LLM.
- Distinguish these outcomes:
  - server creation failed
  - server created but artifact indexing failed
  - server created and artifact indexing succeeded
  - mcp-gen unavailable
  - mcp-gen timed out

Files likely affected:

- `my_agent/tools/generator_tools/__init__.py`
- `my_agent/agents/sub_agents/generator_agent.py`
- new `my_agent/utils/mcp_client.py`

## Priority 1 changes

### 4. Remove or quarantine legacy supervisor/tool code

Current confusion:

- `my_agent/agents/graph.py` defines the active dynamic routing tools: `delegate_to_examiner_agent`, `delegate_to_generator_agent`, and `mark_task_complete`.
- `my_agent/agents/supervisor.py` defines another `SupervisorAgent` class.
- `my_agent/tools/supervisor_tools/__init__.py` references stale agents such as `weather_agent` and `social_agent`.

Recommended change:

Choose `graph.py` as the canonical orchestration implementation, unless there is a reason to revive `SupervisorAgent`.

Then:

- Remove stale `weather_agent` and `social_agent` references.
- Rename legacy files to make status obvious, for example:
  - `supervisor_legacy.py`
  - `supervisor_tools_legacy`
- Or delete unused modules if tests confirm they are not imported.
- Update architecture docs to state the real flow:
  - supervisor node
  - tools node
  - examiner agent
  - generator agent
  - completion/end state

### 5. Make graph state and routing behavior easier to understand

Current graph strengths:

- State includes `raw_api_doc`, `enriched_context`, `history`, `retry_count`, and `is_complete`.
- Tool argument repair protects against LLM copying errors.

Current confusion:

- Some comments are Vietnamese, some are English.
- Routing rules live inside a long prompt string and code.
- Completion depends on specific phrases like `TASK_SUCCESSFULLY_COMPLETED` and final response wording.

Recommended change:

- Add `docs/GRAPH_ARCHITECTURE.md` describing state fields, nodes, routing decisions, and completion triggers.
- Move magic completion strings to constants.
- Add tests for supervisor routing scenarios:
  - new API doc routes to examiner
  - enriched context routes to generator
  - successful server creation marks complete
  - max retry guard ends gracefully

### 6. Improve RAG/artifact indexing failure handling

Current behavior:

- After successful creation, `generator_agent.py` fetches generated artifacts and indexes them.
- If post-creation processing fails, it logs a warning but may still present creation success.

Recommended change:

- Return structured post-creation metadata from the generator:

```json
{
  "serverCreated": true,
  "serverId": "...",
  "artifactFetchStatus": "success | partial | failed",
  "ragIndexStatus": "success | skipped | failed",
  "warnings": []
}
```

- Ensure final user response clearly distinguishes server creation success from indexing warnings.
- Coordinate with mcp-gen agent if `/files` endpoint changes to return partial artifacts instead of hard `404`.

### 7. Normalize provider configuration

Current behavior:

- `llm_factory.py` reads `METACLAW_ENABLED` directly.
- `config/__init__.py` stores provider config values.
- MetaClaw defaults differ across repositories.
- `PROVIDER_CONFIG` uses default `METACLAW_MODEL=gemini-2.5-flash`, while other repos use `qwen/qwen3-next-80b-a3b-instruct` as a default.

Recommended change:

- Centralize all provider decisions in `config/__init__.py`.
- Make `llm_factory.py` consume only normalized config values.
- Align default MetaClaw model with the chosen ecosystem default.
- Document fallback order:
  1. MetaClaw if enabled and configured
  2. Gemini if key exists
  3. Groq if key exists
  4. explicit startup error if none exist

## Priority 2 changes

### 8. Improve cross-platform developer experience

Current issue:

- `manage.sh` assumes shell availability. On Windows, developers may run Git Bash or WSL, but this should be documented.

Recommended change:

- Add Windows notes to README.
- Optionally add PowerShell equivalents later.
- Avoid Unix-only commands in docs unless explicitly using Git Bash or WSL.

### 9. Add integration smoke checks

Recommended checks:

- LangGraph service starts and exposes graph `agent` from `langgraph.json`.
- Agent can reach ChromaDB at `CHROMA_HOST`/`CHROMA_PORT`.
- Agent can reach Ollama at `OLLAMA_BASE_URL` if embeddings require it.
- Agent can reach mcp-gen create endpoint using `MCP_BASE_URL`.
- `create_MCPServer` handles missing mcp-gen service with a clear error.
- Artifact fetch works after a mocked create response.

## Coordination points with other repository agents

Coordinate before finalizing changes to:

- Canonical `MCP_BASE_URL` meaning: should include `/api`.
- Whether to add `MCP_MANAGER_URL` for root manager URL.
- Exact `POST /api/mcp/create` request and response schemas.
- Whether `GET /api/mcp/:serverId/files` returns partial artifacts or all-or-nothing.
- Cross-project `manage.sh` ownership: keep in this repo or move to a parent orchestration repo.
- Canonical Python version.
- MetaClaw enabled/key/model defaults and fallback behavior.

## Suggested acceptance criteria

- `README.md`, `.env.example`, `pyproject.toml`, Docker Compose, and `manage.sh` agree on Python version, commands, service names, and ports.
- There is one clear canonical supervisor/graph implementation.
- No active docs or tool exports mention unrelated `weather_agent` or `social_agent` unless they are real.
- URL construction for mcp-gen is centralized and tested.
- Generator output distinguishes create success from artifact/RAG indexing success.
- A developer can run only this repo’s tests/smoke checks and know whether LangGraph can reach mcp-gen.
