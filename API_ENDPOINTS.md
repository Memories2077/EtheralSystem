# API Endpoints

## src/mcp-server-manager.ts

### POST /api/mcp/create

- **Description:** Tạo MCP server mới
- **Request body:** `{ request, name, dockerImage, userId, email }`
- **Response:** Thông tin server vừa tạo hoặc lỗi

### GET /api/mcp/servers

- **Description:** Lấy danh sách các MCP servers
- **Response:** `{ servers: [...], count: n }`

### GET /api/mcp/:serverId/claude-config

- **Description:** Lấy Claude config cho server cụ thể
- **Params:** `serverId`
- **Response:** Config hoặc lỗi

### DELETE /api/mcp/:serverId

- **Description:** Xóa server
- **Params:** `serverId`, `token` (query)
- **Response:** Kết quả xóa server

### GET /api/mcp/stats

- **Description:** Lấy thống kê server từ MongoDB
- **Response:** Thống kê

---

## src/generator/prompt.ts

### GET /health

- **Description:** Health check
- **Response:** `{ status: 'ok', server: 'server_name' }`

### GET /debug/transports

- **Description:** Debug endpoint, kiểm tra các transport đang hoạt động
- **Response:** `{ activeSessions, count, timestamp }`

### ALL /mcp

- **Description:** Main MCP endpoint, hỗ trợ GET, POST, DELETE (tùy logic trong handleRequest)
- **Response:** Tuỳ thuộc vào logic của MCP server
