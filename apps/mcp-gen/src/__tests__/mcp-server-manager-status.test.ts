import { describe, expect, it } from "vitest";
import type { Server } from "http";
import { MCPServerManager } from "../mcp-server-manager.ts";

function createManagerWithServer(status: string = "running") {
  const manager = new MCPServerManager("./", "test-secret") as any;
  const server = {
    serverId: "server-123",
    dockerImage: "mcp-gen",
    containerPort: 3000,
    hostPort: 4001,
    status,
    publicUrl: "http://localhost:8081/mcp/server-123",
    token: "token-123",
    createdAt: new Date(),
    updatedAt: new Date(),
    buildLogs: [],
    inputContent: "openapi: 3.0.0",
    action: "created",
    buildRequestId: "build-123",
    likeCount: 0,
    dislikeCount: 0,
    feedbacks: [],
  };

  manager.servers.set(server.serverId, server);
  return manager;
}

async function getJson(manager: any, path: string) {
  const httpServer: Server = manager.app.listen(0);
  try {
    const address = httpServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Unable to determine test server port");
    }
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
    return {
      status: response.status,
      body: await response.json(),
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe("MCPServerManager status endpoint", () => {
  it("returns status by serverId", async () => {
    const manager = createManagerWithServer("running");

    const response = await getJson(manager, "/api/mcp/server-123/status");

    expect(response.status).toBe(200);
    expect(response.body.serverId).toBe("server-123");
    expect(response.body.status).toBe("running");
    expect(response.body.buildRequestId).toBe("build-123");
    expect(response.body.claudeConfig.mcpServers["server-123"].args[1]).toContain(
      "token=token-123",
    );
  });

  it("returns status by buildRequestId", async () => {
    const manager = createManagerWithServer("building");

    const response = await getJson(manager, "/api/mcp/build-123/status");

    expect(response.status).toBe(200);
    expect(response.body.serverId).toBe("server-123");
    expect(response.body.status).toBe("building");
    expect(response.body.buildRequestId).toBe("build-123");
  });

  it("returns 404 for an unknown identifier", async () => {
    const manager = createManagerWithServer("running");

    const response = await getJson(manager, "/api/mcp/missing/status");

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Server or build request not found");
  });

  it("returns building for a buildRequestId that is indexed but not fully allocated", async () => {
    const manager = createManagerWithServer("running") as any;
    manager.buildRequestIndex.set("build-pending", "server-pending");

    const response = await getJson(manager, "/api/mcp/build-pending/status");

    expect(response.status).toBe(202);
    expect(response.body.serverId).toBe("server-pending");
    expect(response.body.status).toBe("building");
    expect(response.body.buildRequestId).toBe("build-pending");
  });
});
