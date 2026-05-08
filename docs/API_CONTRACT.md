# mcp-gen API Contract

Base manager URLs:

- Docker/internal: `http://docker-manager:8080/api`
- Local host development: `http://localhost:8080/api`

All examples below are shown without the `/api` prefix in the heading and with the local host URL in `curl` examples.

## Common error response

```json
{
  "error": "Human-readable error message",
  "details": "Optional details in development mode"
}
```

## `POST /api/mcp/create`

Creates an MCP server from raw API documentation, JSON OpenAPI input, or YAML OpenAPI input. The endpoint saves input artifacts, creates or validates OpenAPI YAML, generates TypeScript MCP server code, starts a generated container, waits for the generated server to call the ready endpoint, and returns a Claude-compatible config.

### Request body

```json
{
  "request": "string",
  "userId": "string",
  "email": "string",
  "rag_context": []
}
```

### Fields

| Field         | Type                | Required | Notes                                                                             |
| ------------- | ------------------- | -------- | --------------------------------------------------------------------------------- |
| `request`     | `string`            | Yes      | Raw API docs, OpenAPI JSON string, or OpenAPI YAML string.                        |
| `userId`      | `string`            | Yes      | User identifier used as the JWT subject.                                          |
| `email`       | `string`            | Yes      | User email stored in the generated JWT.                                           |
| `rag_context` | `array` or `string` | No       | Optional retrieval context passed to generation and generated server environment. |
| `name`        | `string`            | No       | Accepted for compatibility; currently not part of persisted public response.      |
| `dockerImage` | `string`            | No       | Defaults to `DEFAULT_MCP_IMAGE` or `mcp-gen`.                                     |

### Example

```bash
curl -X POST http://localhost:8080/api/mcp/create \
  -H "Content-Type: application/json" \
  -d '{
    "request": "openapi: 3.0.0\ninfo:\n  title: Demo API\n  version: 1.0.0\npaths: {}",
    "userId": "user123",
    "email": "user@example.com",
    "rag_context": []
  }'
```

### Success response

```json
{
  "serverId": "string",
  "publicUrl": "string",
  "claudeConfig": {},
  "status": "running",
  "message": "Server created and running successfully"
}
```

### Failure responses

- `400`: missing `request`, `userId`, or `email`.
- `500`: generation, validation, build, or startup failure.
- `504`: generated server did not become ready before timeout.

## `GET /api/mcp/servers`

Lists persisted server records for UI and administration use. Sensitive fields are sanitized before response.

### Example

```bash
curl http://localhost:8080/api/mcp/servers
```

### Success response

```json
{
  "servers": [
    {
      "serverId": "string",
      "status": "running",
      "publicUrl": "http://localhost:8081/mcp/server-id",
      "createdAt": "2026-05-08T00:00:00.000Z",
      "updatedAt": "2026-05-08T00:00:00.000Z",
      "likeCount": 0,
      "dislikeCount": 0,
      "feedbacks": []
    }
  ],
  "count": 1
}
```

### Sanitization guarantees

The response removes token, container ID, host port, container port, Docker image, raw input content, build logs, RAG context, MongoDB `_id`, and feedback `userId` values.

## `POST /api/mcp/{serverId}/feedback`

Adds a like or dislike feedback entry for a generated server.

### Request body

```json
{
  "type": "like",
  "userId": "user123",
  "comment": "Useful server"
}
```

### Fields

| Field     | Type                | Required | Notes                                                      |
| --------- | ------------------- | -------- | ---------------------------------------------------------- |
| `type`    | `like` or `dislike` | Yes      | Feedback type.                                             |
| `userId`  | `string`            | No       | Stored for internal tracking; removed from list responses. |
| `comment` | `string`            | No       | HTML tags are stripped. Maximum length is 1000 characters. |

### Success response

```json
{
  "success": true,
  "serverId": "string",
  "likeCount": 1,
  "dislikeCount": 0,
  "totalFeedbacks": 1
}
```

### Failure responses

- `400`: invalid type or comment too long.
- `404`: server not found.
- `429`: feedback rate limit exceeded.
- `503`: database unavailable.

## `GET /api/mcp/{serverId}/files`

Returns generated artifacts for a server. Current behavior returns partial metadata and any available file contents; when one or more artifacts are missing, the response status is `206 Partial Content`.

### Example

```bash
curl http://localhost:8080/api/mcp/server-id/files
```

### Complete response

```json
{
  "serverId": "server-id",
  "complete": true,
  "exists": {
    "input": true,
    "openapi": true,
    "typescript": true
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
    "typescript": {
      "name": "server-id.ts",
      "content": "generated code"
    }
  }
}
```

### Partial response

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

## `POST /api/mcp/{serverId}/ready`

Generated containers call this endpoint after the generated MCP server is ready to accept traffic.

### Example

```bash
curl -X POST http://localhost:8080/api/mcp/server-id/ready
```

### Success response

```json
{
  "success": true,
  "message": "Status updated to running"
}
```

## `DELETE /api/mcp/{serverId}`

Deletes a generated server. Requires the JWT token created for the same server.

### Example

```bash
curl -X DELETE "http://localhost:8080/api/mcp/server-id?token=jwt-token"
```

### Success response

```json
{
  "success": true,
  "message": "Server deleted successfully",
  "serverId": "server-id"
}
```

When RabbitMQ is connected, deletion may be queued and the message becomes `Server deletion queued successfully`.

### Failure responses

- `401`: token missing or invalid.
- `403`: token belongs to another server.
- `404`: server not found.

## `GET /api/mcp/{serverId}/claude-config`

Returns Claude-compatible MCP remote config for a server.

### Example

```bash
curl http://localhost:8080/api/mcp/server-id/claude-config
```

### Success response

```json
{
  "mcpServers": {
    "server-id": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:8081/mcp/server-id?token=jwt-token",
        "--allow-http"
      ]
    }
  }
}
```

## `GET /api/mcp/stats`

Returns aggregate lifecycle counts from MongoDB.

### Example

```bash
curl http://localhost:8080/api/mcp/stats
```

### Success response

```json
{
  "totalServers": 3,
  "runningServers": 2,
  "stoppedServers": 0,
  "errorServers": 1
}
```
