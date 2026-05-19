import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function writeJsonl(filePath: string, rows: unknown[]) {
  writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join("\n"));
}

describe("research report export dashboard run rows", () => {
  it("keeps dashboard builds reportable without treating missing or skipped validation as failures", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "etheral-report-export-"));
    const eventsPath = path.join(dir, "events.jsonl");
    const runsPath = path.join(dir, "runs.jsonl");
    const matrixPath = path.join(dir, "matrix.jsonl");
    const outputDir = path.join(dir, "report");

    writeJsonl(eventsPath, [
      {
        event_name: "mcp_create_completed",
        service: "mcp-gen",
        status: "success",
        duration_ms: 100,
        experiment_id: "dashboard-test",
        build_request_id: "dash-success",
        server_id: "server-success",
        metrics: { rag_enabled: "false", dynamic_skill_selection: "false", skill_selection_variant: "static", variant_id: "static-rag-off" },
      },
      {
        event_name: "mcp_metadata_checked",
        service: "chatbot-backend",
        status: "success",
        duration_ms: 10,
        experiment_id: "dashboard-test",
        build_request_id: "dash-success",
        server_id: "server-success",
        metrics: { mcp_tool_count: 2 },
      },
      {
        event_name: "mcp_create_completed",
        service: "mcp-gen",
        status: "failure",
        duration_ms: 25,
        experiment_id: "dashboard-test",
        build_request_id: "dash-failed",
        server_id: "server-failed",
        metrics: { rag_enabled: "true", dynamic_skill_selection: "true", skill_selection_variant: "dynamic", variant_id: "dynamic-rag-on" },
      },
      {
        event_name: "mcp_create_completed",
        service: "mcp-gen",
        status: "success",
        duration_ms: 80,
        experiment_id: "dashboard-test",
        build_request_id: "dash-skipped",
        server_id: "server-skipped",
        metrics: { rag_enabled: "true", dynamic_skill_selection: "false", skill_selection_variant: "static", variant_id: "static-rag-on" },
      },
      {
        event_name: "mcp_tool_outcomes_completed",
        service: "chatbot-backend",
        status: "success",
        experiment_id: "dashboard-test",
        build_request_id: "dash-skipped",
        server_id: "server-skipped",
        metrics: { total_tool_count: 2, attempted_tool_count: 0, success_tool_count: 0, failed_tool_count: 0, skipped_tool_count: 2 },
      },
      {
        event_name: "mcp_create_completed",
        service: "mcp-gen",
        status: "success",
        duration_ms: 90,
        experiment_id: "dashboard-test",
        build_request_id: "dash-attempted",
        server_id: "server-attempted",
        metrics: { rag_enabled: "true", dynamic_skill_selection: "true", skill_selection_variant: "dynamic", variant_id: "dynamic-rag-on" },
      },
      {
        event_name: "mcp_tool_outcomes_completed",
        service: "chatbot-backend",
        status: "success",
        experiment_id: "dashboard-test",
        build_request_id: "dash-attempted",
        server_id: "server-attempted",
        metrics: { total_tool_count: 2, attempted_tool_count: 2, success_tool_count: 1, failed_tool_count: 1, skipped_tool_count: 0 },
      },
    ]);
    writeJsonl(runsPath, []);
    writeJsonl(matrixPath, []);

    const result = spawnSync("bun", [
      "scripts/research/export-research-report.ts",
      `--events=${eventsPath}`,
      `--runs=${runsPath}`,
      `--matrix-runs=${matrixPath}`,
      "--experiment-id=dashboard-test",
      `--output-dir=${outputDir}`,
    ], { cwd: path.resolve(import.meta.dir, "../.."), encoding: "utf8" });

    expect(result.status).toBe(0);
    const dashboardRuns = readFileSync(path.join(outputDir, "dashboard_runs.csv"), "utf8");
    expect(dashboardRuns).toContain("dash-success");
    expect(dashboardRuns).toContain("unknown");
    expect(dashboardRuns).toContain("dash-skipped");
    expect(dashboardRuns).toContain("skipped_only");
    expect(dashboardRuns).toContain("dash-attempted");
    expect(dashboardRuns).toContain("attempted");

    const byVariant = readFileSync(path.join(outputDir, "toolcall_by_variant.csv"), "utf8");
    expect(byVariant).toContain("unknown_tool_validation_count");
    expect(byVariant).toContain("static-rag-off");
    expect(byVariant).toContain("dynamic-rag-on");
  });
});
