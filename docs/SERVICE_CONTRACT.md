# mcp-gen Service Contract

This document defines the canonical integration contract for the `mcp-gen` backend service. Other repositories should use this file as the source of truth for service names, ports, URLs, Docker networking, and shared artifacts.

## Canonical services and ports

| Component                                            | Canonical value              | Purpose                                                                                                    |
| ---------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Docker Compose manager service                       | `docker-manager`             | Express API that creates, tracks, and deletes generated MCP servers.                                       |
| Manager host port                                    | `8080`                       | Host/browser access to manager APIs.                                                                       |
| Proxy host port                                      | `8081`                       | Host/browser access to generated MCP server proxy routes.                                                  |
| Internal manager URL                                 | `http://docker-manager:8080` | URL that containers on `mcp-network` use to call the manager.                                              |
| Public manager URL for local development             | `http://localhost:8080`      | URL used by host tools and browser UIs in local development.                                               |
| Public generated MCP proxy URL for local development | `http://localhost:8081`      | Base URL used to build generated MCP public URLs.                                                          |
| Required external network                            | `mcp-network`                | Shared Docker network used by manager, proxy, infrastructure, generated servers, and other app containers. |

Create the external network before starting Docker Compose if it does not already exist:

```bash
docker network create mcp-network
```

## Integration variables and URLs

| Audience              | Variable or URL           | Value in Docker                  | Value in local host dev     | Notes                                                                                               |
| --------------------- | ------------------------- | -------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------- |
| LangGraph agent       | `MCP_BASE_URL`            | `http://docker-manager:8080/api` | `http://localhost:8080/api` | Python generator appends `/mcp/create`.                                                             |
| Browser UI            | `NEXT_PUBLIC_MCP_GEN_URL` | Browser-reachable manager URL    | `http://localhost:8080`     | Must satisfy CORS. For browser code, this must be reachable from the browser, not just from Docker. |
| Generated MCP clients | `PUBLIC_URL`              | Externally reachable proxy URL   | `http://localhost:8081`     | Used by the manager to build generated MCP public URLs such as `/mcp/{serverId}`.                   |
| Generated containers  | `MANAGER_URL`             | `http://docker-manager:8080`     | `http://localhost:8080`     | Ready callback target used by generated servers.                                                    |
| Generated containers  | `JWT_TOKEN`               | Server JWT from manager          | Server JWT from manager     | Bearer token used by the launcher when calling the authenticated ready callback.                     |

## Required shared Docker volumes

| Volume                | Mounted path in manager   | Mounted path in generated containers | Purpose                                                                                                           |
| --------------------- | ------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `shared_input`        | `/app/input`              | `/app/input`                         | Stores raw user input as `api-input-{serverId}.txt`, `api-input-{serverId}.json`, or `api-input-{serverId}.yaml`. |
| `shared_openapi_spec` | `/app/src-generated-yaml` | `/app/src-generated-yaml`            | Stores generated or copied OpenAPI YAML as `{serverId}.yaml`.                                                     |
| `shared_mcpserver_ts` | `/app/src-generated-ts`   | `/app/src-generated-ts`              | Stores generated TypeScript MCP server code as `{serverId}.ts`.                                                   |
| `jwt_data`            | `/app/data`               | Not mounted in generated containers  | Persists the manager JWT secret used to sign and validate generated MCP access tokens.                            |
| `mongodb_data`        | MongoDB internal path     | Not mounted in generated containers  | Persists MongoDB lifecycle records.                                                                               |
| `rabbitmq_data`       | RabbitMQ internal path    | Not mounted in generated containers  | Persists RabbitMQ queue state.                                                                                    |

## Local development startup checklist

1. Copy `.env.example` to `.env` and configure provider credentials.
2. Ensure `MCP_NETWORK=mcp-network`.
3. Ensure `PUBLIC_URL=http://localhost:8081` for local generated MCP URLs.
4. Ensure `MANAGER_URL=http://docker-manager:8080` when generated servers run inside Docker Compose.
5. Ensure `CORS_ORIGINS=http://localhost:9002` when the local browser UI runs on port `9002`.
6. Create the external network: `docker network create mcp-network`.
7. Build the base generated-server image: `docker build -t mcp-gen .`.
8. Start services: `docker compose up -d --build`.

## CORS contract

Browser-facing routes such as `GET /api/mcp/servers` and `POST /api/mcp/{serverId}/feedback` require the browser origin to be listed in `CORS_ORIGINS`. For local development with the Next.js UI, set:

```bash
CORS_ORIGINS=http://localhost:9002
```

Use a comma-separated list for multiple origins:

```bash
CORS_ORIGINS=http://localhost:9002,http://localhost:3000
```

## Service ownership

`mcp-gen` owns the manager API, generated artifact creation, generated container lifecycle, generated MCP public URL construction, and proxy routing. Other repositories should not depend on private implementation details in `src/mcp-server-manager.ts`; use this service contract and `docs/API_CONTRACT.md` instead.
