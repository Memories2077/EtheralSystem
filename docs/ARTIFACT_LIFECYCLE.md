# Generated Artifact Lifecycle

This document describes the generated MCP server artifact lifecycle owned by `mcp-gen`.

## Artifact locations

| Stage                       | Artifact           | Path in manager container    | Shared volume         | File pattern                                                                            |
| --------------------------- | ------------------ | ---------------------------- | --------------------- | --------------------------------------------------------------------------------------- |
| Raw input saved             | User request body  | `/app/input`                 | `shared_input`        | `api-input-{serverId}.txt`, `api-input-{serverId}.json`, or `api-input-{serverId}.yaml` |
| OpenAPI generated or copied | OpenAPI YAML       | `/app/src-generated-yaml`    | `shared_openapi_spec` | `{serverId}.yaml`                                                                       |
| TypeScript generated        | MCP server source  | `/app/src-generated-ts`      | `shared_mcpserver_ts` | `{serverId}.ts`                                                                         |
| Runtime token secret        | JWT signing secret | `/app/data/persistence.json` | `jwt_data`            | `persistence.json`                                                                      |
| Lifecycle record            | Server metadata    | MongoDB `docker.logs`        | `mongodb_data`        | One document per `serverId`                                                             |

## Lifecycle states

| State                  | Meaning                                                                | Main observable signal                                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `created`              | Server record and JWT token exist.                                     | MongoDB record exists and manager memory has a server entry.                                                                                                     |
| `input_saved`          | Raw input artifact was saved under `/app/input`.                       | `GET /api/mcp/{serverId}/files` has `exists.input=true`. This is currently implicit in code and represented in artifact metadata rather than a persisted status. |
| `openapi_generated`    | OpenAPI YAML exists under `/app/src-generated-yaml`.                   | `exists.openapi=true`. For YAML input this is copied directly; for JSON input this is converted; for text input this is LLM-generated.                           |
| `openapi_validated`    | OpenAPI YAML passed validator checks.                                  | Build begins only after validation succeeds. Validation failures move the request to `error`.                                                                    |
| `typescript_generated` | TypeScript MCP server source exists under `/app/src-generated-ts`.     | `exists.typescript=true`. Generation happens during image/container startup flow.                                                                                |
| `building`             | Container build or startup work has started.                           | Status update from RabbitMQ or direct manager flow.                                                                                                              |
| `running`              | Generated server called the ready endpoint.                            | `POST /api/mcp/{serverId}/ready` updated status to `running`; create response can return success.                                                                |
| `indexed`              | Downstream LangGraph fetched artifacts and saved RAG records.          | Owned by downstream repositories; `mcp-gen` exposes artifacts through the files endpoint but does not currently persist `indexed`.                               |
| `error`                | A failure happened with an explicit stage and message where available. | MongoDB status is `error`; build logs or API response contain the error message.                                                                                 |
| `deleted`              | Server was deleted or deletion was queued and applied.                 | MongoDB status is `deleted`; container removed when possible.                                                                                                    |

## Current create flow

1. `POST /api/mcp/create` validates required fields: `request`, `userId`, and `email`.
2. The manager allocates `serverId`, `hostPort`, and a JWT token.
3. The manager creates an initial server record with status `created`.
4. The manager detects input type as JSON, YAML, or text.
5. The raw input is saved to `/app/input`.
6. JSON input is converted to YAML, YAML input is copied, or text input is sent through LLM OpenAPI generation.
7. The OpenAPI YAML is validated.
8. The manager queues or directly performs generated container build/start.
9. The generated server writes TypeScript output and starts serving MCP traffic.
10. The generated server calls `POST /api/mcp/{serverId}/ready` using `MANAGER_URL`.
11. The manager marks the server `running` and returns the stabilized create response.

## Files endpoint behavior

`GET /api/mcp/{serverId}/files` returns all available artifact contents plus an `exists` map.

When all artifacts exist, the endpoint returns `200 OK` with `complete: true`.

When one or more artifacts are missing, the endpoint returns `206 Partial Content` with:

```json
{
  "serverId": "server-id",
  "complete": false,
  "message": "One or more artifacts are not available yet",
  "exists": {
    "input": true,
    "openapi": true,
    "typescript": false
  },
  "files": {
    "input": {
      "name": "api-input-server-id.yaml",
      "content": "openapi: 3.0.0"
    },
    "openapi": {
      "name": "server-id.yaml",
      "content": "openapi: 3.0.0"
    },
    "typescript": null
  }
}
```

This lets downstream indexers retry intelligently instead of treating every partial artifact state as a hard missing-server failure.

## Downstream indexing responsibility

The `indexed` state is a cross-repository workflow milestone. `mcp-gen` is responsible for making artifacts retrievable and observable. The downstream LangGraph/RAG service is responsible for fetching `/api/mcp/{serverId}/files`, storing RAG records, and tracking its own indexing success or failure.
