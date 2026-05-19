#!/usr/bin/env bun
import fs from "fs";
import path from "path";

type JsonRecord = Record<string, unknown>;

type ResearchEvent = JsonRecord & {
  service?: string;
  stage?: string;
  event_name?: string;
  status?: string;
  duration_ms?: number | string;
  build_request_id?: string;
  server_id?: string;
  experiment_id?: string;
  provider?: string;
  model?: string;
  rag_enabled?: string;
  dynamic_skill_selection?: string;
  skill_selection_variant?: string;
  variant_id?: string;
  metrics?: JsonRecord;
};

type BenchmarkRun = JsonRecord & {
  type?: string;
  benchmarkType?: string;
  experimentId?: string;
  caseId?: string;
  itemId?: string;
  apiType?: string;
  variantId?: string;
  skillSelectionMode?: string;
  mode?: string;
  repeatIndex?: number;
  ok?: boolean;
  serverId?: string;
  durationMs?: number | string;
  runtimeMetadataChecked?: boolean;
  runtimeMetadataOk?: boolean;
  runtimeToolCount?: number | string;
  selectionVariant?: string;
  dynamicSkillSelection?: string;
  ragEnabled?: string;
  metaclawEnabled?: string;
  totalToolCount?: number | string;
  attemptedToolCount?: number | string;
  successToolCount?: number | string;
  failedToolCount?: number | string;
  skippedToolCount?: number | string;
  toolCallPassRate?: number | string | null;
  skippedCoverage?: number | string | null;
  estimatedUsage?: JsonRecord;
};

type CsvRow = Record<string, unknown>;

function arg(name: string, fallback = ""): string {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : process.env[name.toUpperCase().replaceAll("-", "_")] || fallback;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function resolveRepoPath(raw: string): string {
  if (raw.startsWith("/repo/")) return path.resolve(raw.slice("/repo/".length));
  return path.resolve(raw);
}

function csvEscape(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(filePath: string, rows: CsvRow[]): void {
  if (rows.length === 0) {
    fs.writeFileSync(filePath, "");
    return;
  }
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function readJsonl<T extends JsonRecord>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as T;
      } catch {
        return null;
      }
    })
    .filter((row): row is T => Boolean(row));
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function groupBy<T>(rows: T[], keyFn: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  return groups;
}

function summarizeStages(events: ResearchEvent[]): CsvRow[] {
  const rows: CsvRow[] = [];
  for (const [key, group] of groupBy(events, (event) => `${event.service || ""}:${event.stage || ""}:${event.event_name || ""}`)) {
    const durations = group.map((event) => Number(event.duration_ms)).filter((value) => Number.isFinite(value));
    rows.push({
      event: key,
      count: group.length,
      success: group.filter((event) => event.status === "success").length,
      failure: group.filter((event) => event.status === "failure").length,
      timeout: group.filter((event) => event.status === "timeout").length,
      p50_ms: percentile(durations, 50),
      p95_ms: percentile(durations, 95),
    });
  }
  return rows.sort((a, b) => String(a.event).localeCompare(String(b.event)));
}

function summarizeBuilds(events: ResearchEvent[]): CsvRow[] {
  const buildEvents = events.filter((event) =>
    ["mcp_create_completed", "chat_stream_completed", "mcp_generation_completed", "openapi_generation_completed"].includes(event.event_name),
  );
  const rows: CsvRow[] = [];
  for (const [buildRequestId, group] of groupBy(buildEvents, (event) => event.build_request_id || event.server_id || "unknown")) {
    const final = group.find((event) => event.event_name === "mcp_create_completed") || group[group.length - 1];
    rows.push({
      build_request_id: buildRequestId,
      server_id: final.server_id || "",
      status: final.status || "",
      total_duration_ms: final.duration_ms || "",
      event_count: group.length,
      experiment_id: final.experiment_id || "",
    });
  }
  return rows;
}

function rate(part: number, total: number): number | null {
  if (!total) return null;
  return Number((part / total).toFixed(4));
}

function numeric(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return 0;
}

function nestedNumber(row: JsonRecord | undefined, key: string): number {
  return numeric(row?.[key]);
}

function textValue(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function eventMetricText(event: ResearchEvent | undefined, key: string): string {
  if (!event) return "";
  return textValue(event[key], event.metrics?.[key]);
}

function summarizeEstimatedUsage(events: ResearchEvent[]): JsonRecord {
  const metrics = events.map((event) => event.metrics || {});
  const sum = (keys: string[]) => metrics.reduce((total, item) => {
    for (const key of keys) {
      const value = item[key];
      if (typeof value === "number" && Number.isFinite(value)) return total + value;
      if (typeof value === "string" && Number.isFinite(Number(value))) return total + Number(value);
    }
    return total;
  }, 0);
  return {
    estimatedPromptTokens: sum(["prompt_token_estimate", "prompt_tokens", "estimated_prompt_tokens"]),
    estimatedCompletionTokens: sum(["completion_token_estimate", "completion_tokens", "estimated_completion_tokens"]),
    llmCallCount: sum(["llm_calls", "llm_call_count"]),
    selectedSkillCount: sum(["selected_skill_count", "skills_selected_count"]),
    selectedSkillTokens: sum(["skill_total_tokens", "selected_skill_tokens", "tokenCost"]),
    estimatedCostUsd: sum(["estimated_cost_usd", "estimatedCostUsd", "cost_usd"]),
  };
}

function outcomeCounts(event: ResearchEvent | undefined): JsonRecord {
  const metrics = event?.metrics || {};
  const outcomes = Array.isArray(metrics.mcp_tool_outcomes) ? metrics.mcp_tool_outcomes as JsonRecord[] : [];
  const total = numeric(metrics.total_tool_count) || numeric(metrics.totalToolCount) || outcomes.length;
  const success = numeric(metrics.success_tool_count) || numeric(metrics.successToolCount) || outcomes.filter((item) => item.status === "success").length;
  const failed = numeric(metrics.failed_tool_count) || numeric(metrics.failedToolCount) || outcomes.filter((item) => item.status === "failed").length;
  const skipped = numeric(metrics.skipped_tool_count) || numeric(metrics.skippedToolCount) || outcomes.filter((item) => item.status === "skipped").length;
  const attempted = numeric(metrics.attempted_tool_count) || numeric(metrics.attemptedToolCount) || success + failed;
  return {
    totalToolCount: total,
    attemptedToolCount: attempted,
    successToolCount: success,
    failedToolCount: failed,
    skippedToolCount: skipped,
    toolCallPassRate: rate(success, attempted),
    skippedCoverage: rate(skipped, total),
    toolValidationStatus: event ? (attempted > 0 ? "attempted" : skipped > 0 ? "skipped_only" : "not_run") : "unknown",
  };
}

function buildDashboardRunRows(events: ResearchEvent[], knownBenchmarkBuildIds: Set<string>): BenchmarkRun[] {
  const buildEvents = events.filter((event) => {
    if (event.event_name !== "mcp_create_completed") return false;
    const buildRequestId = String(event.build_request_id || "").trim();
    return !buildRequestId || !knownBenchmarkBuildIds.has(buildRequestId);
  });
  const eventsByBuild = groupBy(events, (event) => event.build_request_id || event.server_id || "unknown");
  return buildEvents.map((event): BenchmarkRun => {
    const buildRequestId = event.build_request_id || event.server_id || "unknown";
    const group = eventsByBuild.get(buildRequestId) || [event];
    const metadataEvent = group.find((item) => item.event_name === "mcp_metadata_checked");
    const outcomeEvent = group.find((item) => item.event_name === "mcp_tool_outcomes_completed");
    const providerEvent = group.find((item) => item.provider || item.model);
    const dynamicSkillSelection = eventMetricText(event, "dynamic_skill_selection");
    const ragEnabled = eventMetricText(event, "rag_enabled") || "true";
    const selectionVariant =
      eventMetricText(event, "skill_selection_variant") ||
      (dynamicSkillSelection === "true" ? "dynamic" : "static");
    const variantId =
      eventMetricText(event, "variant_id") ||
      `${selectionVariant}-rag-${ragEnabled === "false" ? "off" : "on"}`;
    const metadataToolCount = numeric(metadataEvent?.metrics?.mcp_tool_count);
    return {
      type: "benchmark_result",
      benchmarkType: "dashboard_manual_run",
      source: "dashboard",
      mode: "dashboard",
      itemId: buildRequestId,
      caseId: "dashboard-manual-run",
      apiType: "dashboard_manual",
      variantId,
      selectionVariant,
      skillSelectionMode: selectionVariant,
      dynamicSkillSelection,
      ragEnabled,
      provider: textValue(event.provider, providerEvent?.provider),
      model: textValue(event.model, providerEvent?.model),
      traceId: event.trace_id || "",
      experimentId: event.experiment_id || "",
      sessionId: event.session_id || "",
      buildRequestId,
      serverId: event.server_id || "",
      ok: event.status === "success",
      buildStatus: event.status || "unknown",
      durationMs: event.duration_ms || event.metrics?.build_total_latency_ms || "",
      buildDurationMs: event.duration_ms || event.metrics?.build_total_latency_ms || "",
      runtimeMetadataChecked: Boolean(metadataEvent),
      runtimeMetadataOk: metadataEvent?.status === "success",
      runtimeToolCount: metadataToolCount || "",
      ...outcomeCounts(outcomeEvent),
      estimatedUsage: summarizeEstimatedUsage(group),
    };
  });
}

function summarizeBenchmarkGroups(
  runs: BenchmarkRun[],
  groupName: string,
  keyFn: (run: BenchmarkRun) => string,
): CsvRow[] {
  const rows: CsvRow[] = [];
  for (const [key, group] of groupBy(runs, keyFn)) {
    const durations = group.map((run) => Number(run.durationMs)).filter((value) => Number.isFinite(value));
    const runtimeChecked = group.filter((run) => run.runtimeMetadataChecked === true);
    const runtimeOk = group.filter((run) => run.runtimeMetadataOk === true);
    rows.push({
      [groupName]: key,
      count: group.length,
      success_rate: rate(group.filter((run) => run.ok === true).length, group.length),
      runtime_success_rate: rate(runtimeOk.length, runtimeChecked.length),
      p50_ms: percentile(durations, 50),
      p95_ms: percentile(durations, 95),
      median_tool_count: percentile(
        group.map((run) => Number(run.runtimeToolCount)).filter((value) => Number.isFinite(value)),
        50,
      ),
    });
  }
  return rows.sort((a, b) => String(a[groupName]).localeCompare(String(b[groupName])));
}

function summarizeModeComparison(runs: BenchmarkRun[]): CsvRow[] {
  return summarizeBenchmarkGroups(runs, "mode_key", (run) => {
    const selection =
      run.selectionVariant ||
      (run.dynamicSkillSelection === "true" ? "dynamic" : "static");
    const rag = run.ragEnabled === "true" ? "rag" : "no_rag";
    const metaclaw = run.metaclawEnabled === "true" ? "metaclaw" : "standard";
    return `${run.mode || "unknown"}:${selection}:${rag}:${metaclaw}`;
  });
}

function summarizeToolcallMatrixGroups(
  runs: BenchmarkRun[],
  groupName: string,
  keyFn: (run: BenchmarkRun) => string,
): CsvRow[] {
  const rows: CsvRow[] = [];
  for (const [key, group] of groupBy(runs, keyFn)) {
    const durations = group.map((run) => Number(run.durationMs)).filter((value) => Number.isFinite(value));
    const totalTools = group.reduce((sum, run) => sum + numeric(run.totalToolCount), 0);
    const attemptedTools = group.reduce((sum, run) => sum + numeric(run.attemptedToolCount), 0);
    const successfulTools = group.reduce((sum, run) => sum + numeric(run.successToolCount), 0);
    const skippedTools = group.reduce((sum, run) => sum + numeric(run.skippedToolCount), 0);
    const estimatedPromptTokens = group.reduce((sum, run) => sum + nestedNumber(run.estimatedUsage, "estimatedPromptTokens"), 0);
    const estimatedCompletionTokens = group.reduce((sum, run) => sum + nestedNumber(run.estimatedUsage, "estimatedCompletionTokens"), 0);
    const llmCallCount = group.reduce((sum, run) => sum + nestedNumber(run.estimatedUsage, "llmCallCount"), 0);
    const selectedSkillTokens = group.reduce((sum, run) => sum + nestedNumber(run.estimatedUsage, "selectedSkillTokens"), 0);
    const estimatedCostUsd = group.reduce((sum, run) => sum + nestedNumber(run.estimatedUsage, "estimatedCostUsd"), 0);
    const unknownToolValidation = group.filter((run) => !run.toolValidationStatus || run.toolValidationStatus === "unknown" || run.toolValidationStatus === "not_run").length;
    const skippedOnlyValidation = group.filter((run) => run.toolValidationStatus === "skipped_only").length;
    const attemptedValidation = group.filter((run) => numeric(run.attemptedToolCount) > 0).length;
    rows.push({
      [groupName]: key,
      count: group.length,
      build_success_rate: rate(group.filter((run) => run.ok === true).length, group.length),
      metadata_readiness_rate: rate(group.filter((run) => run.runtimeMetadataOk === true).length, group.length),
      tool_call_pass_rate: rate(successfulTools, attemptedTools),
      skipped_coverage: rate(skippedTools, totalTools),
      attempted_tool_count: attemptedTools,
      successful_tool_count: successfulTools,
      skipped_tool_count: skippedTools,
      attempted_validation_count: attemptedValidation,
      skipped_only_validation_count: skippedOnlyValidation,
      unknown_tool_validation_count: unknownToolValidation,
      p50_ms: percentile(durations, 50),
      p95_ms: percentile(durations, 95),
      estimated_prompt_tokens: estimatedPromptTokens,
      estimated_completion_tokens: estimatedCompletionTokens,
      llm_call_count: llmCallCount,
      selected_skill_tokens: selectedSkillTokens,
      estimated_cost_usd: estimatedCostUsd,
    });
  }
  return rows.sort((a, b) => String(a[groupName]).localeCompare(String(b[groupName])));
}

function summarizeRuntimeReliability(events: ResearchEvent[], runs: BenchmarkRun[]): CsvRow[] {
  const runtimeEvents = events.filter((event) => event.event_name === "mcp_metadata_checked");
  const eventRows: CsvRow[] = [];
  for (const [status, group] of groupBy(runtimeEvents, (event) => event.status || "unknown")) {
    const durations = group.map((event) => Number(event.duration_ms)).filter((value) => Number.isFinite(value));
    const toolCounts = group.map((event) => Number(event.metrics?.mcp_tool_count)).filter((value) => Number.isFinite(value));
    eventRows.push({
      source: `event:${status}`,
      count: group.length,
      success_rate: status === "success" ? 1 : 0,
      p50_ms: percentile(durations, 50),
      p95_ms: percentile(durations, 95),
      median_tool_count: percentile(toolCounts, 50),
    });
  }
  const runRows = summarizeBenchmarkGroups(runs, "source", (run) => run.mode || "unknown").map((row) => ({
    source: `benchmark:${String(row.source || "unknown")}`,
    count: row.count,
    success_rate: row.runtime_success_rate,
    p50_ms: row.p50_ms,
    p95_ms: row.p95_ms,
    median_tool_count: row.median_tool_count,
  }));
  return [...eventRows, ...runRows];
}

function summarizeFeedback(events: ResearchEvent[]): CsvRow[] {
  const feedbackEvents = events.filter((event) =>
    ["mcp_feedback_submitted", "mcp_feedback_received", "generation_feedback_recorded"].includes(event.event_name),
  );
  const rows: CsvRow[] = [];
  for (const [eventName, group] of groupBy(feedbackEvents, (event) => event.event_name || "unknown")) {
    rows.push({
      feedback_event: eventName,
      count: group.length,
      success: group.filter((event) => event.status === "success").length,
      failure: group.filter((event) => event.status === "failure").length,
      likes: group.filter((event) => event.metrics?.feedback_type === "like").length,
      dislikes: group.filter((event) => event.metrics?.feedback_type === "dislike").length,
    });
  }
  return rows.sort((a, b) => String(a.feedback_event).localeCompare(String(b.feedback_event)));
}

function markdownTable(rows: CsvRow[], headers: string[]): string {
  if (rows.length === 0) return "_No data._\n";
  const lines = [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
  ];
  for (const row of rows) {
    lines.push(`| ${headers.map((header) => String(row[header] ?? "")).join(" | ")} |`);
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const experimentId = arg("experiment-id", "");
  const eventsPath = resolveRepoPath(arg("events", process.env.RESEARCH_EVENTS_JSONL_PATH || "/tmp/etheral-research-events.jsonl"));
  const runsPath = resolveRepoPath(arg("runs", "experiments/research-metrics/runs.jsonl"));
  const matrixRunsPath = resolveRepoPath(arg("matrix-runs", "experiments/research-metrics/backend-toolcall-matrix-runs.jsonl"));
  const outputDir = path.resolve(arg("output-dir", `experiments/research-metrics/reports/${experimentId || "all"}`));
  ensureDir(outputDir);

  const allEvents = readJsonl<ResearchEvent>(eventsPath);
  const events = experimentId ? allEvents.filter((event) => event.experiment_id === experimentId) : allEvents;
  const rawRuns = [
    ...readJsonl<BenchmarkRun>(runsPath),
    ...(matrixRunsPath === runsPath ? [] : readJsonl<BenchmarkRun>(matrixRunsPath)),
  ];
  const runs = rawRuns.filter((row) => row.type === "benchmark_result" && (!experimentId || row.experimentId === experimentId));
  const knownBenchmarkBuildIds = new Set(runs.map((row) => String(row.buildRequestId || "").trim()).filter(Boolean));
  const dashboardRuns = buildDashboardRunRows(events, knownBenchmarkBuildIds);
  const matrixRuns = [
    ...runs.filter((row) => row.benchmarkType === "backend_toolcall_matrix"),
    ...dashboardRuns,
  ];

  const stageRows = summarizeStages(events);
  const buildRows = summarizeBuilds(events);
  const modeRows = summarizeModeComparison(runs);
  const ragRows = summarizeBenchmarkGroups(runs, "rag_key", (run) => run.ragEnabled === "true" ? "rag" : "no_rag");
  const apiTypeRows = summarizeBenchmarkGroups(runs, "apiType", (run) => run.apiType || "unknown");
  const runtimeRows = summarizeRuntimeReliability(events, runs);
  const feedbackRows = summarizeFeedback(events);
  const toolcallVariantRows = summarizeToolcallMatrixGroups(matrixRuns, "variantId", (run) => run.variantId || "unknown");
  const toolcallCaseRows = summarizeToolcallMatrixGroups(matrixRuns, "caseId", (run) => run.caseId || run.itemId || "unknown");
  const toolcallApiTypeRows = summarizeToolcallMatrixGroups(matrixRuns, "apiType", (run) => run.apiType || "unknown");
  const toolcallSkillRows = summarizeToolcallMatrixGroups(matrixRuns, "skillSelectionMode", (run) => run.skillSelectionMode || run.selectionVariant || "unknown");
  const toolcallRagRows = summarizeToolcallMatrixGroups(matrixRuns, "ragEnabled", (run) => run.ragEnabled === "true" ? "rag_on" : "rag_off");
  writeCsv(path.join(outputDir, "events.csv"), events);
  writeCsv(path.join(outputDir, "stage_summary.csv"), stageRows);
  writeCsv(path.join(outputDir, "build_summary.csv"), buildRows);
  writeCsv(path.join(outputDir, "benchmark_runs.csv"), runs);
  writeCsv(path.join(outputDir, "dashboard_runs.csv"), dashboardRuns);
  writeCsv(path.join(outputDir, "toolcall_matrix_runs.csv"), matrixRuns);
  writeCsv(path.join(outputDir, "toolcall_by_variant.csv"), toolcallVariantRows);
  writeCsv(path.join(outputDir, "toolcall_by_case.csv"), toolcallCaseRows);
  writeCsv(path.join(outputDir, "toolcall_by_api_type.csv"), toolcallApiTypeRows);
  writeCsv(path.join(outputDir, "toolcall_by_skill_selection.csv"), toolcallSkillRows);
  writeCsv(path.join(outputDir, "toolcall_by_rag.csv"), toolcallRagRows);
  writeCsv(path.join(outputDir, "mode_comparison.csv"), modeRows);
  writeCsv(path.join(outputDir, "rag_comparison.csv"), ragRows);
  writeCsv(path.join(outputDir, "runtime_reliability.csv"), runtimeRows);
  writeCsv(path.join(outputDir, "robustness_by_api_type.csv"), apiTypeRows);
  writeCsv(path.join(outputDir, "feedback_summary.csv"), feedbackRows);

  const md = [
    `# Research Metrics Report`,
    ``,
    `Experiment: ${experimentId || "all"}`,
    `Generated: ${new Date().toISOString()}`,
    ``,
    `## Backend Tool-Call Matrix By Variant`,
    markdownTable(toolcallVariantRows, ["variantId", "count", "build_success_rate", "metadata_readiness_rate", "tool_call_pass_rate", "skipped_coverage", "unknown_tool_validation_count", "p50_ms", "p95_ms", "estimated_prompt_tokens", "llm_call_count", "selected_skill_tokens", "estimated_cost_usd"]),
    `## Backend Tool-Call Matrix By Case`,
    markdownTable(toolcallCaseRows, ["caseId", "count", "build_success_rate", "metadata_readiness_rate", "tool_call_pass_rate", "skipped_coverage", "unknown_tool_validation_count", "p50_ms", "p95_ms", "estimated_prompt_tokens", "llm_call_count", "selected_skill_tokens", "estimated_cost_usd"]),
    `## Backend Tool-Call Matrix By API Type`,
    markdownTable(toolcallApiTypeRows, ["apiType", "count", "build_success_rate", "metadata_readiness_rate", "tool_call_pass_rate", "skipped_coverage", "unknown_tool_validation_count", "p50_ms", "p95_ms", "estimated_prompt_tokens", "llm_call_count", "selected_skill_tokens", "estimated_cost_usd"]),
    `## Backend Tool-Call Matrix By Skill Selection`,
    markdownTable(toolcallSkillRows, ["skillSelectionMode", "count", "build_success_rate", "metadata_readiness_rate", "tool_call_pass_rate", "skipped_coverage", "unknown_tool_validation_count", "p50_ms", "p95_ms", "estimated_prompt_tokens", "llm_call_count", "selected_skill_tokens", "estimated_cost_usd"]),
    `## Backend Tool-Call Matrix By RAG`,
    markdownTable(toolcallRagRows, ["ragEnabled", "count", "build_success_rate", "metadata_readiness_rate", "tool_call_pass_rate", "skipped_coverage", "unknown_tool_validation_count", "p50_ms", "p95_ms", "estimated_prompt_tokens", "llm_call_count", "selected_skill_tokens", "estimated_cost_usd"]),
    ``,
    `## Benchmark Runs`,
    markdownTable(runs, ["itemId", "apiType", "mode", "repeatIndex", "ok", "serverId", "durationMs"]),
    `## Dashboard Runs`,
    markdownTable(dashboardRuns, ["buildRequestId", "variantId", "ok", "runtimeMetadataOk", "toolValidationStatus", "toolCallPassRate", "durationMs", "serverId"]),
    `## Static vs Dynamic / Mode Comparison`,
    markdownTable(modeRows, ["mode_key", "count", "success_rate", "runtime_success_rate", "p50_ms", "p95_ms", "median_tool_count"]),
    `## RAG Comparison`,
    markdownTable(ragRows, ["rag_key", "count", "success_rate", "runtime_success_rate", "p50_ms", "p95_ms", "median_tool_count"]),
    `## Runtime Reliability`,
    markdownTable(runtimeRows, ["source", "count", "success_rate", "p50_ms", "p95_ms", "median_tool_count"]),
    `## Robustness By API Type`,
    markdownTable(apiTypeRows, ["apiType", "count", "success_rate", "runtime_success_rate", "p50_ms", "p95_ms", "median_tool_count"]),
    `## Feedback`,
    markdownTable(feedbackRows, ["feedback_event", "count", "success", "failure", "likes", "dislikes"]),
    `## Build Summary`,
    markdownTable(buildRows, ["build_request_id", "server_id", "status", "total_duration_ms", "event_count"]),
    `## Stage Summary`,
    markdownTable(stageRows, ["event", "count", "success", "failure", "timeout", "p50_ms", "p95_ms"]),
  ].join("\n");

  fs.writeFileSync(path.join(outputDir, "summary.md"), md);
  console.log(`Wrote report to ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
