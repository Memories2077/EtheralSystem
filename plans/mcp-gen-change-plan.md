# mcp-gen repository change plan

Repository: `mcp-gen`
Primary role: MCP/OpenAPI generation service, Docker container manager, generated MCP server proxy, MongoDB/RabbitMQ-backed lifecycle service.

## Goal

Make `mcp-gen` a clear, stable backend service with explicit API contracts, consistent environment variables, accurate docs, and predictable generated artifact lifecycle so other repositories can integrate against it safely.

## Parallelization boundary

This plan can be assigned to an agent focused only on the `mcp-gen` repository. Coordinate with the other repository agents only on shared service names, URLs, and API contracts.

## Priority 0 changes

### 1. Define and document the canonical mcp-gen service contract

Create or update documentation that defines:

- Docker service name: `docker-manager`.
- Manager host port: `8080`.
- Proxy host port: `8081`.
- Internal Docker URL used by other containers: `http://docker-manager:8080`.
- Public/browser URL for manager APIs: `http://localhost:8080` in local development.
- Public MCP server proxy URL: `http://localhost:8081` in local development.
- Required external network: `mcp-network`.
- Required shared volumes and their artifact purpose.

Recommended file:

- `docs/SERVICE_CONTRACT.md`

Include a table with these columns:

| Audience              | Variable or URL           | Value in Docker                  | Value in local host dev     | Notes                                  |
| --------------------- | ------------------------- | -------------------------------- | --------------------------- | -------------------------------------- |
| LangGraph agent       | `MCP_BASE_URL`            | `http://docker-manager:8080/api` | `http://localhost:8080/api` | Python generator appends `/mcp/create` |
| Browser UI            | `NEXT_PUBLIC_MCP_GEN_URL` | browser-reachable manager URL    | `http://localhost:8080`     | Must satisfy CORS                      |
| Generated MCP clients | `PUBLIC_URL`              | externally reachable proxy URL   | `http://localhost:8081`     | Used to build MCP public URLs          |
| Generated containers  | `MANAGER_URL`             | `http://docker-manager:8080`     | `http://localhost:8080`     | Ready callback target                  |

### 2. Formalize API endpoints used by other repositories

Document the internal API contract for all externally used routes:

- `POST /api/mcp/create`
- `GET /api/mcp/servers`
- `POST /api/mcp/:serverId/feedback`
- `GET /api/mcp/:serverId/files`
- `POST /api/mcp/:serverId/ready`
- `DELETE /api/mcp/:serverId`
- `GET /api/mcp/:serverId/claude-config`
- `GET /api/mcp/stats`

Recommended deliverables:

- `docs/API_CONTRACT.md` with request and response examples.
- Optional `docs/mcp-gen.openapi.yaml` for machine-readable contract.

Critical schema to stabilize:

```json
{
  "request": "string",
  "userId": "string",
  "email": "string",
  "rag_context": []
}
```

Success response to stabilize:

```json
{
  "serverId": "string",
  "publicUrl": "string",
  "claudeConfig": {},
  "status": "running",
  "message": "Server created and running successfully"
}
```

### 3. Fix stale or confusing startup scripts

Current confusion:

- `package.json` has `server: npx tsx src/server.ts`, but `src/server.ts` is not present.

Recommended change:

- Remove the stale `server` script, or replace it with the actual manager/proxy entrypoint.
- Ensure all scripts listed in `README.md` run successfully.
- Add scripts for common lifecycle checks:
  - `npm run typecheck`
  - `npm test`
  - `npm run manager` if appropriate
  - `npm run proxy` if appropriate

### 4. Normalize environment variable naming and comments

Current confusion:

- Gemini and Groq config use `OPENAI_TEMPERATURE` and `OPENAI_TIMEOUT_MS`.
- MetaClaw API key defaults differ from other repos.
- CORS defaults to empty, but frontend requires access to list/feedback APIs.

Recommended change:

- Introduce provider-neutral variables:
  - `LLM_TEMPERATURE`
  - `LLM_TIMEOUT_MS`
- Keep `OPENAI_TEMPERATURE` and `OPENAI_TIMEOUT_MS` as deprecated fallback for one transition period.
- Document MetaClaw behavior consistently:
  - If `METACLAW_ENABLED=true`, either require `METACLAW_API_KEY` explicitly or document the local dummy default.
- Update `.env.example` to include:
  - `PUBLIC_URL=http://localhost:8081`
  - `MANAGER_URL=http://docker-manager:8080`
  - `CORS_ORIGINS=http://localhost:9002`
  - `MONGO_URI=mongodb://mongodb:27017` for Docker
  - `RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672` for Docker

## Priority 1 changes

### 5. Document generated artifact lifecycle

Current lifecycle is implicit:

- Raw input is written under `input`.
- OpenAPI YAML is written under `src-generated-yaml`.
- TypeScript MCP server is expected under `src-generated-ts`.
- Docker container starts from generated TypeScript.
- `/api/mcp/:serverId/files` requires all three artifacts.

Recommended change:

Create `docs/ARTIFACT_LIFECYCLE.md` with states:

1. `created`: server record and token exist.
2. `input_saved`: input artifact saved.
3. `openapi_generated`: YAML exists.
4. `openapi_validated`: YAML passed validator.
5. `typescript_generated`: MCP TypeScript exists.
6. `building`: container build started.
7. `running`: generated server called ready endpoint.
8. `indexed`: LangGraph successfully fetched artifacts and saved RAG records.
9. `error`: failure with explicit stage and message.

Optional code improvement:

- Make `GET /api/mcp/:serverId/files` return partial artifacts plus an `exists` map instead of hard `404` when some files are missing.

### 6. Improve CORS and browser-facing behavior

Current confusion:

- Frontend directly calls `GET /api/mcp/servers` and feedback routes.
- CORS is disabled unless `CORS_ORIGINS` is configured.

Recommended change:

- Add docs explaining that browser origin `http://localhost:9002` must be included.
- Consider a startup warning if `CORS_ORIGINS` is empty while `NODE_ENV` is not production.
- Include CORS setup in `.env.example`.

### 7. Align Docker Compose with cross-repo expectations

Recommended checks:

- Keep `docker-manager` as the canonical service name unless all repos are changed together.
- Ensure `mcp-network` creation is documented before `docker compose up` because it is external.
- Verify `PUBLIC_URL` points to the proxy URL, not the manager URL.
- Verify generated containers can call `MANAGER_URL`.

## Priority 2 changes

### 8. Clean mixed-language comments and operational logging

Current code contains a mix of English and Vietnamese comments. This is not functionally wrong, but it reduces handoff clarity for multiple agents.

Recommended change:

- Keep user-facing docs and key operational comments in one language, preferably English for cross-agent work.
- Preserve detailed comments where useful, but remove stale commented-out code blocks.

### 9. Add contract and integration tests

Recommended tests:

- `POST /api/mcp/create` rejects missing required fields.
- `POST /api/mcp/create` accepts OpenAPI YAML input.
- `GET /api/mcp/:serverId/files` behavior is documented and tested for complete and partial artifacts.
- `GET /api/mcp/servers` sanitizes token, host port, and user feedback IDs.
- CORS preflight works for configured frontend origin.

## Coordination points with other repository agents

Coordinate before finalizing changes to:

- Canonical manager URL: `http://docker-manager:8080/api` from containers and `http://localhost:8080/api` from host.
- Whether `NEXT_PUBLIC_MCP_GEN_URL` should point directly to `mcp-gen` or be proxied through the FastAPI backend.
- Exact API contract for create and files endpoints.
- MetaClaw key requirement and default behavior.
- Cross-repository startup command and printed URLs.

## Suggested acceptance criteria

- A new developer can start this repository with documented commands and no dead scripts.
- Other repositories can integrate using only the documented service contract, without reading `src/mcp-server-manager.ts`.
- `.env.example` values are coherent for local and Docker usage.
- API request and response schemas used by LangGraph and frontend are stable and documented.
- Generated artifact lifecycle is understandable from docs and observable through status or logs.
