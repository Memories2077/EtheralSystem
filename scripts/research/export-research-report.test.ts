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

  it("writes API-doc batch reports with Inspector and cleanup columns", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "etheral-report-export-batch-"));
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
        experiment_id: "batch-test",
        build_request_id: "build-jsonplaceholder",
        server_id: "server-jsonplaceholder",
      },
      {
        event_name: "mcp_create_completed",
        service: "mcp-gen",
        status: "success",
        duration_ms: 100,
        experiment_id: "batch-test",
        build_request_id: "build-dummyjson",
        server_id: "server-dummyjson",
      },
    ]);
    writeJsonl(runsPath, []);
    writeJsonl(matrixPath, [
      {
        type: "benchmark_result",
        benchmarkType: "backend_toolcall_matrix",
        experimentId: "batch-test",
        apiDocId: "jsonplaceholder-input-doc",
        caseId: "jsonplaceholder-input-doc",
        itemId: "jsonplaceholder-input-doc",
        apiType: "public_crud_input_doc",
        variantId: "static-rag-off",
        skillSelectionMode: "static",
        ragEnabled: "false",
        repeatIndex: 1,
        buildRequestId: "build-jsonplaceholder",
        ok: true,
        runtimeMetadataOk: true,
        durationMs: 100,
        totalToolCount: 2,
        attemptedToolCount: 1,
        successToolCount: 1,
        skippedToolCount: 1,
        inspectorAttemptedToolCount: 1,
        inspectorSuccessToolCount: 1,
        inspectorSkippedToolCount: 1,
        cleanupAttempted: true,
        cleanupStatus: "removed",
        containerRemovedCount: 1,
      },
      {
        type: "benchmark_result",
        benchmarkType: "backend_toolcall_matrix",
        experimentId: "batch-test",
        apiDocId: "dummyjson-input-doc",
        caseId: "dummyjson-input-doc",
        itemId: "dummyjson-input-doc",
        apiType: "public_fake_crud_input_doc",
        variantId: "static-rag-off",
        skillSelectionMode: "static",
        ragEnabled: "false",
        repeatIndex: 1,
        buildRequestId: "build-dummyjson",
        ok: true,
        runtimeMetadataOk: true,
        durationMs: 100,
        totalToolCount: 1,
        attemptedToolCount: 0,
        successToolCount: 0,
        skippedToolCount: 1,
        inspectorAttemptedToolCount: 0,
        inspectorSuccessToolCount: 0,
        inspectorSkippedToolCount: 1,
        cleanupAttempted: true,
        cleanupStatus: "failed",
        containerFailedCount: 1,
      },
    ]);

    const result = spawnSync("bun", [
      "scripts/research/export-research-report.ts",
      `--events=${eventsPath}`,
      `--runs=${runsPath}`,
      `--matrix-runs=${matrixPath}`,
      "--experiment-id=batch-test",
      "--api-doc-id=jsonplaceholder-input-doc",
      `--output-dir=${outputDir}`,
    ], { cwd: path.resolve(import.meta.dir, "../.."), encoding: "utf8" });

    expect(result.status).toBe(0);
    const byApiDoc = readFileSync(path.join(outputDir, "toolcall_by_api_doc.csv"), "utf8");
    expect(byApiDoc).toContain("inspector_pass_rate");
    expect(byApiDoc).toContain("cleanup_success_rate");
    expect(byApiDoc).toContain("jsonplaceholder-input-doc");
    expect(byApiDoc).not.toContain("dummyjson-input-doc");

    const summary = readFileSync(path.join(outputDir, "summary.md"), "utf8");
    expect(summary).toContain("API Doc Batch: jsonplaceholder-input-doc");
  });

  it("writes MAPR quality, retrieval, ablation, and summary outputs", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "etheral-report-export-mapr-"));
    const eventsPath = path.join(dir, "events.jsonl");
    const runsPath = path.join(dir, "runs.jsonl");
    const matrixPath = path.join(dir, "matrix.jsonl");
    const outputDir = path.join(dir, "report");

    writeJsonl(eventsPath, []);
    writeJsonl(runsPath, []);
    writeJsonl(matrixPath, [
      {
        type: "benchmark_result",
        benchmarkType: "backend_toolcall_matrix",
        experimentId: "mapr-test",
        apiDocId: "jsonplaceholder-input-doc",
        caseId: "jsonplaceholder-input-doc",
        itemId: "jsonplaceholder-input-doc",
        variantId: "static-rag-off",
        skillSelectionMode: "static",
        ragEnabled: "false",
        ok: true,
        runtimeMetadataOk: true,
        mcpHandshakePass: true,
        compileStartValidationPassed: true,
        durationMs: 100,
        buildDurationMs: 90,
        totalToolCount: 4,
        attemptedToolCount: 2,
        successToolCount: 1,
        expected_operation_count: 8,
        mapped_operation_count: 4,
        mapped_tool_count: 4,
        generated_tool_count: 5,
        hallucinated_tool_count: 1,
        schema_valid_tool_count: 3,
        endpoint_coverage: 0.5,
        hallucinated_tool_rate: 0.2,
        schema_validity_rate: 0.75,
        retrieval_metric_applicable: false,
        estimated_prompt_tokens: 100,
        estimated_completion_tokens: 50,
        estimated_total_tokens: 150,
        estimated_cost_usd: 0.01,
      },
      {
        type: "benchmark_result",
        benchmarkType: "backend_toolcall_matrix",
        experimentId: "mapr-test",
        apiDocId: "jsonplaceholder-input-doc",
        caseId: "jsonplaceholder-input-doc",
        itemId: "jsonplaceholder-input-doc",
        variantId: "static-rag-on",
        skillSelectionMode: "static",
        ragEnabled: "true",
        ok: true,
        runtimeMetadataOk: true,
        mcpHandshakePass: true,
        compileStartValidationPassed: true,
        durationMs: 120,
        buildDurationMs: 100,
        totalToolCount: 5,
        attemptedToolCount: 3,
        successToolCount: 2,
        expected_operation_count: 8,
        mapped_operation_count: 6,
        mapped_tool_count: 6,
        generated_tool_count: 6,
        hallucinated_tool_count: 0,
        schema_valid_tool_count: 5,
        retrieval_metric_applicable: true,
        retrieved_evidence_count: 3,
        relevant_evidence_count: 4,
        retrieval_hit_count: 2,
        precision_at_3: 0.6667,
        recall_at_3: 0.5,
        mrr_at_3: 1,
        rag_retrieval_status: "evaluated",
        rag_retrieval_source: "langgraph-agent",
        rag_real_examiner_event_count: 1,
        estimated_prompt_tokens: 120,
        estimated_completion_tokens: 60,
        estimated_total_tokens: 180,
        estimated_cost_usd: 0.02,
        usage_status: "complete",
        usage_source: "provider_usage",
      },
      {
        type: "benchmark_result",
        benchmarkType: "backend_toolcall_matrix",
        experimentId: "mapr-test",
        apiDocId: "jsonplaceholder-input-doc",
        caseId: "jsonplaceholder-input-doc",
        itemId: "jsonplaceholder-input-doc",
        variantId: "dynamic-rag-off",
        skillSelectionMode: "dynamic",
        ragEnabled: "false",
        ok: false,
        runtimeMetadataOk: false,
        durationMs: 80,
        expected_operation_count: 8,
        mapped_operation_count: 3,
        mapped_tool_count: 3,
        generated_tool_count: 4,
        hallucinated_tool_count: 1,
        schema_valid_tool_count: 2,
      },
      {
        type: "benchmark_result",
        benchmarkType: "backend_toolcall_matrix",
        experimentId: "mapr-test",
        apiDocId: "jsonplaceholder-input-doc",
        caseId: "jsonplaceholder-input-doc",
        itemId: "jsonplaceholder-input-doc",
        variantId: "dynamic-rag-on",
        skillSelectionMode: "dynamic",
        ragEnabled: "true",
        ok: true,
        runtimeMetadataOk: true,
        mcpHandshakePass: true,
        compileStartValidationPassed: true,
        durationMs: 110,
        expected_operation_count: 8,
        mapped_operation_count: 7,
        mapped_tool_count: 7,
        generated_tool_count: 7,
        hallucinated_tool_count: 0,
        schema_valid_tool_count: 6,
        retrieval_metric_applicable: true,
        retrieved_evidence_count: 2,
        relevant_evidence_count: 4,
        retrieval_hit_count: 1,
        precision_at_3: 0.3333,
        recall_at_3: 0.25,
        mrr_at_3: 0.5,
        rag_retrieval_status: "evaluated",
        rag_retrieval_source: "langgraph-agent",
        rag_real_examiner_event_count: 1,
      },
    ]);

    const result = spawnSync("bun", [
      "scripts/research/export-research-report.ts",
      `--events=${eventsPath}`,
      `--runs=${runsPath}`,
      `--matrix-runs=${matrixPath}`,
      "--experiment-id=mapr-test",
      `--output-dir=${outputDir}`,
    ], { cwd: path.resolve(import.meta.dir, "../.."), encoding: "utf8" });

    expect(result.status).toBe(0);
    const quality = readFileSync(path.join(outputDir, "quality_by_variant.csv"), "utf8");
    expect(quality).toContain("endpoint_coverage");
    expect(quality).toContain("schema_validity_rate");
    expect(quality).toContain("dynamic-rag-on");

    const retrieval = readFileSync(path.join(outputDir, "rag_retrieval_by_variant.csv"), "utf8");
    expect(retrieval).toContain("precision_at_3");
    expect(retrieval).toContain("mrr_at_3");
    expect(retrieval).toContain("retrieval_statuses");
    expect(retrieval).toContain("evaluated");
    expect(retrieval).toContain("static-rag-on");
    expect(retrieval).not.toContain("static-rag-off");

    const ablation = readFileSync(path.join(outputDir, "ablation_effects.csv"), "utf8");
    expect(ablation).toContain("rag_uplift");
    expect(ablation).toContain("static_vs_dynamic_success_delta");

    const matrixRuns = readFileSync(path.join(outputDir, "toolcall_matrix_runs.csv"), "utf8");
    expect(matrixRuns).toContain("estimated_total_tokens");
    expect(matrixRuns).toContain("usage_status");
    expect(matrixRuns).toContain("usage_source");
    expect(matrixRuns).toContain("endpoint_coverage");

    const summary = readFileSync(path.join(outputDir, "summary.md"), "utf8");
    expect(summary).toContain("## 2x2 Variant Matrix");
    expect(summary).toContain("## Ablation Effects");
    expect(summary).toContain("## RAG Retrieval By Variant");
    expect(summary).toContain("usage_complete_rate");
  });
});
