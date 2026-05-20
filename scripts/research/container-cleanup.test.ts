import { describe, expect, it } from "bun:test";
import { cleanupGeneratedContainer, tokenFromMcpUrl } from "./container-cleanup";

describe("generated container cleanup", () => {
  it("extracts the manager delete token from MCP URLs", () => {
    expect(tokenFromMcpUrl("http://localhost:4000/mcp?token=abc")).toBe("abc");
  });

  it("uses manager delete when server id and token are available", async () => {
    const urls: string[] = [];
    const result = await cleanupGeneratedContainer({
      managerUrl: "http://manager:8080",
      serverId: "server-1",
      mcpUrl: "http://localhost:4000/mcp?token=secret",
      fetchImpl: async (url) => {
        urls.push(url);
        return new Response("{}", { status: 200 });
      },
      execImpl: () => {
        throw new Error("docker fallback should not run");
      },
    });
    expect(result.cleanupStatus).toBe("removed");
    expect(result.cleanupMethod).toBe("manager-delete");
    expect(urls[0]).toContain("/api/mcp/server-1?token=secret");
  });

  it("falls back to docker removal when manager delete returns but the container is still running", async () => {
    const calls: string[][] = [];
    const result = await cleanupGeneratedContainer({
      managerUrl: "http://manager:8080",
      serverId: "server-1",
      containerId: "container-123",
      mcpUrl: "http://localhost:4000/mcp?token=secret",
      fetchImpl: async () => new Response("{}", { status: 200 }),
      execImpl: (file, args) => {
        calls.push([file, ...args]);
        if (args[0] === "ps") return "container-123\n";
        return "";
      },
    });
    expect(result.cleanupStatus).toBe("removed");
    expect(result.cleanupMethod).toBe("docker-rm");
    expect(calls).toEqual([
      ["docker", "ps", "-q", "--filter", "id=container-123"],
      ["docker", "rm", "-f", "container-123"],
    ]);
  });

  it("falls back to exact docker container removal when manager delete cannot run", async () => {
    const calls: string[][] = [];
    const result = await cleanupGeneratedContainer({
      managerUrl: "http://manager:8080",
      containerId: "container-123",
      fetchImpl: async () => new Response("{}", { status: 500 }),
      execImpl: (file, args) => calls.push([file, ...args]),
    });
    expect(result.cleanupStatus).toBe("removed");
    expect(result.cleanupMethod).toBe("docker-rm");
    expect(calls).toEqual([["docker", "rm", "-f", "container-123"]]);
  });

  it("skips cleanup without generated identity", async () => {
    const result = await cleanupGeneratedContainer({ managerUrl: "http://manager:8080" });
    expect(result.cleanupStatus).toBe("skipped");
    expect(result.containerSkippedCount).toBe(1);
  });

  it("refuses to remove protected baseline Compose containers", async () => {
    const result = await cleanupGeneratedContainer({
      managerUrl: "http://manager:8080",
      containerId: "mongodb",
      execImpl: () => {
        throw new Error("protected container should not be removed");
      },
    });
    expect(result.cleanupStatus).toBe("failed");
    expect(result.cleanupError).toContain("protected Compose container");
  });
});
