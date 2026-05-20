import { describe, expect, it } from "bun:test";
import { inspectorCallTool, inspectorListTools, summarizeInspectorOutcomes } from "./inspector-cli";

describe("Inspector CLI wrapper", () => {
  it("normalizes tools/list output", () => {
    const result = inspectorListTools("http://localhost:3000/mcp", () => ({
      status: 0,
      stdout: JSON.stringify({ tools: [{ name: "list-posts" }] }),
      stderr: "",
    }));
    expect(result.connected).toBe(true);
    expect(result.toolCount).toBe(1);
  });

  it("passes tool arguments to tools/call", () => {
    const seen: string[][] = [];
    const outcome = inspectorCallTool({
      mcpUrl: "http://localhost:3000/mcp",
      toolName: "create-post",
      index: 0,
      probeId: "create-post",
      operation: "POST /posts",
      toolArgs: { title: "benchmark", userId: 1 },
      executor: (args) => {
        seen.push(args);
        return { status: 0, stdout: JSON.stringify({ content: [{ type: "text", text: "ok" }] }), stderr: "" };
      },
    });
    expect(outcome.status).toBe("success");
    expect(seen[0]).toContain("--tool-name");
    expect(seen[0]).toContain("create-post");
    expect(seen[0]).toContain("title=benchmark");
    expect(seen[0]).toContain("userId=1");
  });

  it("summarizes Inspector pass rate from attempted calls only", () => {
    const summary = summarizeInspectorOutcomes([
      { tool_name: "a", index: 0, status: "success", error_code: "", response_length: 1, response_hash: "x", diagnostic: "" },
      { tool_name: "b", index: 1, status: "failed", error_code: "err", response_length: 1, response_hash: "y", diagnostic: "bad" },
      { tool_name: "c", index: 2, status: "skipped", error_code: "skip", response_length: 0, response_hash: "", diagnostic: "skip" },
    ]);
    expect(summary.inspectorPassRate).toBe(0.5);
    expect(summary.inspectorSkippedToolCount).toBe(1);
  });
});
