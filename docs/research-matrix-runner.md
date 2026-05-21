# Research Matrix Runner

## Demo Command

Dry-run the default demo matrix:

```bash
bun run research -- --dry-run
```

Default demo shape:

- API docs: `jsonplaceholder-input-doc`
- Variants: `static-rag-off`, `static-rag-on`, `dynamic-rag-off`, `dynamic-rag-on`
- Repeats: `3`
- Expected builds: `1 * 4 * 3 = 12`

Run a single A-Z smoke build when you only need to verify the full build,
MCP validation, export, and cleanup path:

```bash
bun run research -- --smoke
```

Smoke shape:

- API docs: `jsonplaceholder-input-doc`
- Variants: `static-rag-off`
- Repeats: `1`
- Expected builds: `1`

The regular non-dry-run demo remains available as `bun run research`; use it when
you want to execute all 12 planned demo cells.

## Full Three-Doc Command

Run all checked-in API-doc fixtures:

```bash
bun run research -- --all-api-docs
```

Full shape:

- API docs: `jsonplaceholder-input-doc`, `dummyjson-input-doc`, `pokeapi-input-doc`
- Variants: all 4 required variants
- Repeats: `3`
- Expected builds: `3 * 4 * 3 = 36`

## Reports

The orchestrator runs export after each API-doc batch. By default reports are written under:

```text
experiments/research-metrics/reports/<experiment-id>/<api-doc-id>/
```

When `--experiment-id` is omitted, `bun run research` creates a timestamped id such as `research-2026-05-20T15-30-00Z` so repeated demos on the same day do not mix reports.

Batch exports include `toolcall_by_api_doc.csv`, `toolcall_by_variant.csv`, `toolcall_by_rag.csv`, raw run CSVs, and `summary.md`.

## MCP Validation

Build creation goes through the application flow: `chatbot -> MetaClaw/LangChain -> mcp-gen`.

After the generated server is running, the runner validates it in two layers:

1. Backend metadata connects to the generated MCP URL and lists tools through the MCP client.
2. Backend direct MCP probes call safe mapped tools with fixture-provided `toolArgs`, without asking an LLM to choose or invoke tools.

The raw run record stores this as `toolValidationMethod=backend-direct-mcp`,
with `attemptedToolCount`, `successToolCount`, `toolCallPassRate`, and per-tool
outcomes. Inspector CLI is still executed when available and its metrics are
recorded as diagnostics (`inspectorConnected`, `inspectorPassRate`,
`inspectorDiagnostic`), but smoke success is gated on metadata plus direct MCP
tool probes.

## Required Environment

The runner expects the development Compose stack to be available and the backend/manager URLs to resolve:

```bash
E2E_BACKEND_URL=http://localhost:8000
E2E_MCP_MANAGER_URL=http://localhost:8080
BACKEND_TOOLCALL_PROVIDER=gemini
BACKEND_TOOLCALL_MODEL=gemini-2.5-flash
RESEARCH_EVENTS_JSONL_PATH=/repo/reports/backend-toolcall-matrix/research-events.jsonl
```

The runner restarts Compose per variant by default so `RAG_ENABLED` and skill-selection flags are applied to `agent-service` and `chatbot-backend`. Use `--no-restart-stack` only when the stack is already configured for the selected variant.

## Cleanup

Each generated MCP server run records `serverId`, MCP URL, and `containerId` when available. Cleanup runs only after the run validates successfully. Failed validation runs keep the generated container available for inspection and record `cleanupStatus=skipped`.

1. Prefer manager `DELETE /api/mcp/:serverId?token=...` when the MCP URL contains the server token.
2. Fall back to `docker rm -f <containerId>` for the exact generated container id.
3. Refuse to remove protected baseline Compose containers such as `mongodb`, `rabbitmq`, `docker-manager`, `agent-service`, and `chatbot-backend`.

If cleanup fails, inspect the run record fields:

- `cleanupStatus`
- `cleanupMethod`
- `cleanupError`
- `generatedContainerId`
- `serverId`

Then remove only the generated container manually after confirming it is not a baseline Compose service.
