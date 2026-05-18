# JSONPlaceholder UI Metrics E2E

This E2E validates the root `INPUT_SAMPLE.txt` flow from browser chat submission through generated MCP server activation and correlated research metrics.

## Required Environment

- Docker is running.
- The EtheralSystem Compose stack is reachable at:
  - Frontend: `http://localhost:9002`
  - Backend: `http://localhost:8000`
  - MCP manager: `http://localhost:8080`
  - MongoDB: `mongodb://localhost:27017` by default, or the host port from `docker compose port mongodb 27017`
- MetaClaw is reachable on the configured host port, usually `http://localhost:30000`.
- At least one LLM provider key is configured.
- Metrics are enabled in the running containers with a shared research database:

```bash
RESEARCH_METRICS_ENABLED=true
RESEARCH_EXPERIMENT_ID=jsonplaceholder-ui-e2e
NEXT_PUBLIC_RESEARCH_EXPERIMENT_ID=jsonplaceholder-ui-e2e
RESEARCH_EVENTS_DB=docker
RESEARCH_EVENTS_COLLECTION=research_events
RESEARCH_EVENTS_JSONL_PATH=/repo/reports/jsonplaceholder-ui-metrics/research-events.jsonl
RESEARCH_EVENTS_JSONL_MIRROR=true
```

## Run

```bash
RESEARCH_METRICS_ENABLED=true \
RESEARCH_EXPERIMENT_ID=jsonplaceholder-ui-e2e \
NEXT_PUBLIC_RESEARCH_EXPERIMENT_ID=jsonplaceholder-ui-e2e \
RESEARCH_EVENTS_DB=docker \
RESEARCH_EVENTS_COLLECTION=research_events \
RESEARCH_EVENTS_JSONL_PATH=/repo/reports/jsonplaceholder-ui-metrics/research-events.jsonl \
RESEARCH_EVENTS_JSONL_MIRROR=true \
docker compose up -d --build
```

In another shell:

```bash
bun run test:e2e:jsonplaceholder
```

Optional overrides:

```bash
E2E_FRONTEND_URL=http://localhost:9002 \
E2E_BACKEND_URL=http://localhost:8000 \
E2E_MCP_MANAGER_URL=http://localhost:8080 \
E2E_MONGO_URI=mongodb://localhost:27017 \
RESEARCH_EVENTS_DB=docker \
bun run test:e2e:jsonplaceholder
```

If Compose maps MongoDB to a non-default host port:

```bash
E2E_MONGO_URI=mongodb://localhost:27018 bun run test:e2e:jsonplaceholder
```

## Expected Flow

- The test reads root `INPUT_SAMPLE.txt` and submits it through the chatbot UI.
- The UI `POST /chat` payload includes `buildRequestId`, `traceId`, `sessionId`, and `experimentId`.
- The generated server is confirmed through mcp-gen manager `GET /api/mcp/:serverId/status`.
- The generated MCP URL is activated through backend `POST /mcp/metadata`.
- Browser local storage contains the active generated MCP server with a non-empty tool list.

## Expected Metric Events

All required events must share the captured `buildRequestId`, `traceId`, and `experimentId`:

- `chat_stream_completed`
- `langgraph_stream_completed`
- `supervisor_routed`
- `examiner_completed`
- `generator_completed`
- `mcp_create_input_normalized`
- `openapi_generation_completed`
- `docker_build_completed`
- `container_start_completed`
- `mcp_create_completed`
- `mcp_metadata_checked`

The test prints a compact `[jsonplaceholder-ui-metrics-summary]` line with server identity, MCP URL, tool count, event count, and latency fields.

## Report Artifacts

For paper/report runs, keep `RESEARCH_EVENTS_JSONL_MIRROR=true` and `RESEARCH_EVENTS_JSONL_PATH=/repo/reports/jsonplaceholder-ui-metrics/research-events.jsonl` in the Compose environment. The Compose stack bind-mounts `./reports/jsonplaceholder-ui-metrics` into the metric-emitting services, so JSONL metrics are written back into the repository.

If manager-side JSONL events are missing while Mongo contains them, make the bind-mounted report directory writable by the containers and recreate the services:

```bash
chmod -R u+rwX,go+rwX reports/jsonplaceholder-ui-metrics
docker compose --env-file .env.jsonplaceholder-e2e up -d --force-recreate docker-manager proxy agent chatbot-backend
```

The current validated run is also exported as stable files under `reports/jsonplaceholder-ui-metrics/`:

- `*.events.json`: complete event documents.
- `*.events.jsonl`: newline-delimited event documents.
- `*.metrics.csv`: table-friendly event and metric fields.
- `*.summary.json`: compact report summary with latency, event coverage, server identity, and tool count.

## Troubleshooting Boundaries

- Fails before browser submission: check frontend, backend `/health`, mcp-gen `/api/mcp/stats`, and root `INPUT_SAMPLE.txt`.
- Fails with `RESEARCH_METRICS_ENABLED=false`: restart Compose with the metric environment above.
- Fails connecting to MongoDB: set `E2E_MONGO_URI` to the port shown by `docker compose port mongodb 27017`.
- Fails after server generation but before activation: inspect backend `POST /mcp/metadata` and the generated server `/api/mcp/:serverId/status`.
- Fails waiting for metric events: inspect `docker.research_events` filtered by the captured `buildRequestId`.
