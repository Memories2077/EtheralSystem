#!/usr/bin/env bun
import fs from "fs";
import path from "path";
import {
  normalizeEstimatedUsage as normalizeMaprEstimatedUsage,
  successfulServerRatios,
} from "./mapr-metrics";

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
  apiDocId?: string;
  apiType?: string;
  declaredEndpointCount?: number | string;
  expectedBuildCount?: number | string;
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
  inspectorConnected?: boolean;
  inspectorToolCount?: number | string;
  inspectorAttemptedToolCount?: number | string;
  inspectorSuccessToolCount?: number | string;
  inspectorFailedToolCount?: number | string;
  inspectorSkippedToolCount?: number | string;
  inspectorPassRate?: number | string | null;
  cleanupAttempted?: boolean;
  cleanupStatus?: string;
  cleanupMethod?: string;
  cleanupDurationMs?: number | string;
  containerRemovedCount?: number | string;
  containerSkippedCount?: number | string;
  containerFailedCount?: number | string;
  estimatedUsage?: JsonRecord;
  estimated_prompt_tokens?: number | string;
  estimated_completion_tokens?: number | string;
  estimated_total_tokens?: number | string;
  estimated_cost_usd?: number | string;
  usage_status?: string;
  usage_source?: string;
  expected_operation_count?: number | string;
  mapped_operation_count?: number | string;
  mapped_tool_count?: number | string;
  generated_tool_count?: number | string;
  hallucinated_tool_count?: number | string;
  schema_valid_tool_count?: number | string;
  endpoint_coverage?: number | string | null;
  hallucinated_tool_rate?: number | string | null;
  schema_validity_rate?: number | string | null;
  retrieval_metric_applicable?: boolean;
  retrieved_evidence_count?: number | string;
  relevant_evidence_count?: number | string;
  retrieval_hit_count?: number | string;
  precision_at_3?: number | string | null;
  recall_at_3?: number | string | null;
  mrr_at_3?: number | string | null;
  rag_retrieval_status?: string;
  rag_retrieval_source?: string;
  rag_real_examiner_event_count?: number | string;
  buildDurationMs?: number | string;
  chatTotalLatencyMs?: number | string;
  compileStartValidationPassed?: boolean;
  mcpHandshakePass?: boolean;
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

function optionalNumeric(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function boolValue(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  if (typeof value === "number") return value !== 0;
  return fallback;
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
  return normalizeMaprEstimatedUsage(events);
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

function estimatedUsageForRun(run: BenchmarkRun): JsonRecord {
  return normalizeMaprEstimatedUsage([run]);
}

function normalizeBenchmarkRun(run: BenchmarkRun): BenchmarkRun {
  const usage = estimatedUsageForRun(run);
  const estimatedPromptTokens = optionalNumeric(run.estimated_prompt_tokens, usage.estimated_prompt_tokens);
  const estimatedCompletionTokens = optionalNumeric(run.estimated_completion_tokens, usage.estimated_completion_tokens);
  const estimatedTotalTokens = optionalNumeric(run.estimated_total_tokens, usage.estimated_total_tokens);
  const estimatedCostUsd = optionalNumeric(run.estimated_cost_usd, usage.estimated_cost_usd);
  const usageStatus = textValue(run.usage_status, usage.usage_status) || (
    estimatedPromptTokens !== null && estimatedCompletionTokens !== null && estimatedTotalTokens !== null && estimatedCostUsd !== null
      ? "complete"
      : "unavailable_missing_usage"
  );
  const usageSource = textValue(run.usage_source, usage.usage_source) || (usageStatus === "complete" ? "provider_usage" : "unavailable");
  const runtimeMetadataOk = boolValue(run.runtimeMetadataOk);
  const mcpHandshakePass = boolValue(run.mcpHandshakePass, boolValue(run.mcp_initialize_success, runtimeMetadataOk));
  const compileStartValidationPassed = boolValue(run.compileStartValidationPassed, boolValue(run.compile_pass, run.ok === true));
  const buildDurationMs = numeric(run.buildDurationMs) || numeric(run.build_total_latency_ms) || numeric(run.durationMs);
  const chatTotalLatencyMs = numeric(run.chatTotalLatencyMs) || numeric(run.chat_total_latency_ms);
  return {
    ...run,
    estimatedUsage: {
      ...(run.estimatedUsage || {}),
      ...usage,
    },
    estimated_prompt_tokens: estimatedPromptTokens,
    estimated_completion_tokens: estimatedCompletionTokens,
    estimated_total_tokens: estimatedTotalTokens,
    estimated_cost_usd: estimatedCostUsd,
    usage_status: usageStatus,
    usage_source: usageSource,
    build_success: run.ok === true,
    metadata_ready: runtimeMetadataOk,
    mcpHandshakePass,
    mcp_initialize_success: mcpHandshakePass,
    compileStartValidationPassed,
    compile_pass: compileStartValidationPassed,
    build_total_latency_ms: buildDurationMs || "",
    chat_total_latency_ms: chatTotalLatencyMs || "",
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
    return normalizeBenchmarkRun({
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
    });
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
    const inspectorAttemptedTools = group.reduce((sum, run) => sum + numeric(run.inspectorAttemptedToolCount), 0);
    const inspectorSuccessfulTools = group.reduce((sum, run) => sum + numeric(run.inspectorSuccessToolCount), 0);
    const inspectorSkippedTools = group.reduce((sum, run) => sum + numeric(run.inspectorSkippedToolCount), 0);
    const cleanupAttempted = group.filter((run) => run.cleanupAttempted === true).length;
    const cleanupRemoved = group.reduce((sum, run) => sum + (numeric(run.containerRemovedCount) || (run.cleanupStatus === "removed" ? 1 : 0)), 0);
    const cleanupFailed = group.reduce((sum, run) => sum + (numeric(run.containerFailedCount) || (run.cleanupStatus === "failed" ? 1 : 0)), 0);
    const cleanupSkipped = group.reduce((sum, run) => sum + (numeric(run.containerSkippedCount) || (run.cleanupStatus === "skipped" ? 1 : 0)), 0);
    const usageComplete = group.filter((run) => run.usage_status === "complete");
    const usageUnavailable = group.length - usageComplete.length;
    const usageStatuses = [...new Set(group.map((run) => String(run.usage_status || "unknown")))].sort().join("|");
    const usageSources = [...new Set(group.map((run) => String(run.usage_source || "unknown")))].sort().join("|");
    const estimatedPromptTokens = usageComplete.reduce((sum, run) => sum + numeric(run.estimated_prompt_tokens), 0);
    const estimatedCompletionTokens = usageComplete.reduce((sum, run) => sum + numeric(run.estimated_completion_tokens), 0);
    const estimatedTotalTokens = usageComplete.reduce((sum, run) => sum + numeric(run.estimated_total_tokens), 0);
    const llmCallCount = group.reduce((sum, run) => sum + nestedNumber(run.estimatedUsage, "llmCallCount"), 0);
    const selectedSkillTokens = group.reduce((sum, run) => sum + nestedNumber(run.estimatedUsage, "selectedSkillTokens"), 0);
    const estimatedCostUsd = usageComplete.reduce((sum, run) => sum + numeric(run.estimated_cost_usd), 0);
    const expectedOperations = group.reduce((sum, run) => sum + numeric(run.expected_operation_count), 0);
    const mappedOperations = group.reduce((sum, run) => sum + numeric(run.mapped_operation_count), 0);
    const mappedTools = group.reduce((sum, run) => sum + (numeric(run.mapped_tool_count) || numeric(run.mapped_operation_count)), 0);
    const generatedTools = group.reduce((sum, run) => sum + numeric(run.generated_tool_count), 0);
    const hallucinatedTools = group.reduce((sum, run) => sum + numeric(run.hallucinated_tool_count), 0);
    const schemaValidTools = group.reduce((sum, run) => sum + numeric(run.schema_valid_tool_count), 0);
    const successfulBuilds = group.filter((run) => run.ok === true).length;
    const metadataReady = group.filter((run) => run.runtimeMetadataOk === true).length;
    const handshakes = group.filter((run) => run.mcpHandshakePass === true || run.mcp_initialize_success === true || run.runtimeMetadataOk === true).length;
    const compilePassed = group.filter((run) => run.compileStartValidationPassed === true || run.compile_pass === true).length;
    const buildDurations = group.map((run) => numeric(run.build_total_latency_ms) || numeric(run.buildDurationMs) || numeric(run.durationMs)).filter((value) => Number.isFinite(value) && value > 0);
    const chatDurations = group.map((run) => numeric(run.chat_total_latency_ms) || numeric(run.chatTotalLatencyMs)).filter((value) => Number.isFinite(value) && value > 0);
    const unknownToolValidation = group.filter((run) => !run.toolValidationStatus || run.toolValidationStatus === "unknown" || run.toolValidationStatus === "not_run").length;
    const skippedOnlyValidation = group.filter((run) => run.toolValidationStatus === "skipped_only").length;
    const attemptedValidation = group.filter((run) => numeric(run.attemptedToolCount) > 0).length;
    const usageRatios = usageUnavailable === 0
      ? successfulServerRatios({ estimatedTotalTokens, estimatedCostUsd, successfulBuilds })
      : { tokens_per_successful_server: null, estimated_cost_per_successful_server: null };
    rows.push({
      [groupName]: key,
      count: group.length,
      build_success_rate: rate(successfulBuilds, group.length),
      metadata_readiness_rate: rate(metadataReady, group.length),
      mcp_handshake_pass_rate: rate(handshakes, group.length),
      tool_call_pass_rate: rate(successfulTools, attemptedTools),
      compile_pass_rate: rate(compilePassed, group.length),
      inspector_pass_rate: rate(inspectorSuccessfulTools, inspectorAttemptedTools),
      skipped_coverage: rate(skippedTools, totalTools),
      expected_operation_count: expectedOperations,
      mapped_operation_count: mappedOperations,
      generated_tool_count: generatedTools,
      hallucinated_tool_count: hallucinatedTools,
      schema_valid_tool_count: schemaValidTools,
      endpoint_coverage: rate(mappedOperations, expectedOperations),
      hallucinated_tool_rate: rate(hallucinatedTools, generatedTools),
      schema_validity_rate: rate(schemaValidTools, mappedTools),
      attempted_tool_count: attemptedTools,
      successful_tool_count: successfulTools,
      skipped_tool_count: skippedTools,
      inspector_attempted_tool_count: inspectorAttemptedTools,
      inspector_successful_tool_count: inspectorSuccessfulTools,
      inspector_skipped_tool_count: inspectorSkippedTools,
      cleanup_success_rate: rate(cleanupRemoved, cleanupAttempted),
      cleanup_attempted_count: cleanupAttempted,
      cleanup_removed_count: cleanupRemoved,
      cleanup_failed_count: cleanupFailed,
      cleanup_skipped_count: cleanupSkipped,
      attempted_validation_count: attemptedValidation,
      skipped_only_validation_count: skippedOnlyValidation,
      unknown_tool_validation_count: unknownToolValidation,
      usage_complete_count: usageComplete.length,
      usage_unavailable_count: usageUnavailable,
      usage_complete_rate: rate(usageComplete.length, group.length),
      usage_statuses: usageStatuses,
      usage_sources: usageSources,
      p50_ms: percentile(durations, 50),
      p95_ms: percentile(durations, 95),
      p50_build_total_latency_ms: percentile(buildDurations, 50),
      p95_build_total_latency_ms: percentile(buildDurations, 95),
      p50_chat_total_latency_ms: percentile(chatDurations, 50),
      p95_chat_total_latency_ms: percentile(chatDurations, 95),
      estimated_prompt_tokens: estimatedPromptTokens,
      estimated_completion_tokens: estimatedCompletionTokens,
      estimated_total_tokens: estimatedTotalTokens,
      llm_call_count: llmCallCount,
      selected_skill_tokens: selectedSkillTokens,
      estimated_cost_usd: estimatedCostUsd,
      ...usageRatios,
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

function finiteMetricRows(rows: CsvRow[], metric: string, variantIds: string[]): number[] {
  const allowed = new Set(variantIds);
  return rows
    .filter((row) => allowed.has(String(row.variantId || "")))
    .map((row) => Number(row[metric]))
    .filter((value) => Number.isFinite(value));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4));
}

function delta(left: number | null, right: number | null): number | null {
  if (left === null || right === null) return null;
  return Number((left - right).toFixed(4));
}

function summarizeQualityByVariant(runs: BenchmarkRun[]): CsvRow[] {
  return summarizeToolcallMatrixGroups(runs, "variantId", (run) => run.variantId || "unknown")
    .map((row) => ({
      variantId: row.variantId,
      count: row.count,
      expected_operation_count: row.expected_operation_count,
      mapped_operation_count: row.mapped_operation_count,
      generated_tool_count: row.generated_tool_count,
      hallucinated_tool_count: row.hallucinated_tool_count,
      schema_valid_tool_count: row.schema_valid_tool_count,
      endpoint_coverage: row.endpoint_coverage,
      hallucinated_tool_rate: row.hallucinated_tool_rate,
      schema_validity_rate: row.schema_validity_rate,
      build_success_rate: row.build_success_rate,
      metadata_readiness_rate: row.metadata_readiness_rate,
      tool_call_pass_rate: row.tool_call_pass_rate,
      usage_complete_count: row.usage_complete_count,
      usage_unavailable_count: row.usage_unavailable_count,
      usage_complete_rate: row.usage_complete_rate,
      usage_statuses: row.usage_statuses,
      estimated_prompt_tokens: row.estimated_prompt_tokens,
      estimated_completion_tokens: row.estimated_completion_tokens,
      estimated_total_tokens: row.estimated_total_tokens,
      estimated_cost_usd: row.estimated_cost_usd,
      tokens_per_successful_server: row.tokens_per_successful_server,
      estimated_cost_per_successful_server: row.estimated_cost_per_successful_server,
    }));
}

function summarizeRagRetrievalByVariant(runs: BenchmarkRun[]): CsvRow[] {
  const rows: CsvRow[] = [];
  const ragRuns = runs.filter((run) => run.ragEnabled === "true");
  for (const [variantId, group] of groupBy(ragRuns, (run) => run.variantId || "unknown")) {
    const applicable = group.filter((run) => run.retrieval_metric_applicable === true);
    const precisionValues = applicable.map((run) => Number(run.precision_at_3)).filter((value) => Number.isFinite(value));
    const recallValues = applicable.map((run) => Number(run.recall_at_3)).filter((value) => Number.isFinite(value));
    const mrrValues = applicable.map((run) => Number(run.mrr_at_3)).filter((value) => Number.isFinite(value));
    const retrievalStatuses = [...new Set(group.map((run) => String(run.rag_retrieval_status || "unknown")))].sort().join("|");
    const missingRealExaminerCount = group.filter((run) => run.rag_retrieval_status === "missing_real_examiner_evidence").length;
    const noEvidenceCount = group.filter((run) => run.rag_retrieval_status === "no_real_rag_evidence").length;
    const evaluatedCount = group.filter((run) => run.rag_retrieval_status === "evaluated").length;
    rows.push({
      variantId,
      count: group.length,
      applicable_count: applicable.length,
      evaluated_count: evaluatedCount,
      evaluated_retrieval_count: evaluatedCount,
      missing_real_examiner_count: missingRealExaminerCount,
      no_evidence_count: noEvidenceCount,
      retrieval_statuses: retrievalStatuses,
      retrieved_evidence_count: group.reduce((sum, run) => sum + numeric(run.retrieved_evidence_count), 0),
      relevant_evidence_count: group.reduce((sum, run) => sum + numeric(run.relevant_evidence_count), 0),
      retrieval_hit_count: group.reduce((sum, run) => sum + numeric(run.retrieval_hit_count), 0),
      precision_at_3: average(precisionValues),
      recall_at_3: average(recallValues),
      mrr_at_3: average(mrrValues),
    });
  }
  return rows.sort((a, b) => String(a.variantId).localeCompare(String(b.variantId)));
}

function summarizeAblationEffects(variantRows: CsvRow[]): CsvRow[] {
  const metrics = [
    "build_success_rate",
    "metadata_readiness_rate",
    "mcp_handshake_pass_rate",
    "tool_call_pass_rate",
    "compile_pass_rate",
    "endpoint_coverage",
    "hallucinated_tool_rate",
    "schema_validity_rate",
  ];
  return metrics.map((metric) => {
    const ragOn = finiteMetricRows(variantRows, metric, ["static-rag-on", "dynamic-rag-on"]);
    const ragOff = finiteMetricRows(variantRows, metric, ["static-rag-off", "dynamic-rag-off"]);
    const dynamic = finiteMetricRows(variantRows, metric, ["dynamic-rag-on", "dynamic-rag-off"]);
    const staticRows = finiteMetricRows(variantRows, metric, ["static-rag-on", "static-rag-off"]);
    const ragOnAverage = average(ragOn);
    const ragOffAverage = average(ragOff);
    const dynamicAverage = average(dynamic);
    const staticAverage = average(staticRows);
    const ragUplift = delta(ragOnAverage, ragOffAverage);
    const staticVsDynamicDelta = delta(dynamicAverage, staticAverage);
    return {
      effect: "fixed_variant_ablation",
      metric,
      rag_on_average: ragOnAverage,
      rag_off_average: ragOffAverage,
      rag_uplift: ragUplift,
      delta: ragUplift,
      dynamic_average: dynamicAverage,
      static_average: staticAverage,
      static_vs_dynamic_success_delta: staticVsDynamicDelta,
      static_vs_dynamic_delta: staticVsDynamicDelta,
      rag_on_count: ragOn.length,
      rag_off_count: ragOff.length,
      dynamic_count: dynamic.length,
      static_count: staticRows.length,
    };
  });
}

function summarizeVariantMatrix(variantRows: CsvRow[]): CsvRow[] {
  const byVariant = new Map(variantRows.map((row) => [String(row.variantId || ""), row]));
  return [
    { skill_selection: "static", rag_off_variant: "static-rag-off", rag_on_variant: "static-rag-on" },
    { skill_selection: "dynamic", rag_off_variant: "dynamic-rag-off", rag_on_variant: "dynamic-rag-on" },
  ].map((row) => {
    const off = byVariant.get(row.rag_off_variant) || {};
    const on = byVariant.get(row.rag_on_variant) || {};
    return {
      skill_selection: row.skill_selection,
      rag_off_variant: row.rag_off_variant,
      rag_off_count: off.count ?? "",
      rag_off_build_success_rate: off.build_success_rate ?? "",
      rag_off_endpoint_coverage: off.endpoint_coverage ?? "",
      rag_off_tool_call_pass_rate: off.tool_call_pass_rate ?? "",
      rag_on_variant: row.rag_on_variant,
      rag_on_count: on.count ?? "",
      rag_on_build_success_rate: on.build_success_rate ?? "",
      rag_on_endpoint_coverage: on.endpoint_coverage ?? "",
      rag_on_tool_call_pass_rate: on.tool_call_pass_rate ?? "",
    };
  });
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
  const apiDocId = arg("api-doc-id", arg("case-id", ""));
  const eventsPath = resolveRepoPath(arg("events", process.env.RESEARCH_EVENTS_JSONL_PATH || "/tmp/etheral-research-events.jsonl"));
  const runsPath = resolveRepoPath(arg("runs", "experiments/research-metrics/runs.jsonl"));
  const matrixRunsPath = resolveRepoPath(arg("matrix-runs", "experiments/research-metrics/backend-toolcall-matrix-runs.jsonl"));
  const outputDir = path.resolve(arg("output-dir", `experiments/research-metrics/reports/${experimentId || "all"}`));
  ensureDir(outputDir);

  const allEvents = readJsonl<ResearchEvent>(eventsPath);
  const rawRuns = [
    ...readJsonl<BenchmarkRun>(runsPath),
    ...(matrixRunsPath === runsPath ? [] : readJsonl<BenchmarkRun>(matrixRunsPath)),
  ];
  const runs = rawRuns.filter((row) =>
    row.type === "benchmark_result" &&
    (!experimentId || row.experimentId === experimentId) &&
    (!apiDocId || row.apiDocId === apiDocId || row.caseId === apiDocId || row.itemId === apiDocId)
  ).map(normalizeBenchmarkRun);
  const knownBenchmarkBuildIds = new Set(runs.map((row) => String(row.buildRequestId || "").trim()).filter(Boolean));
  const eventsByExperiment = experimentId ? allEvents.filter((event) => event.experiment_id === experimentId) : allEvents;
  const events = apiDocId && knownBenchmarkBuildIds.size > 0
    ? eventsByExperiment.filter((event) => knownBenchmarkBuildIds.has(String(event.build_request_id || "").trim()))
    : eventsByExperiment;
  const dashboardRuns = apiDocId ? [] : buildDashboardRunRows(events, knownBenchmarkBuildIds);
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
  const toolcallApiDocRows = summarizeToolcallMatrixGroups(matrixRuns, "apiDocId", (run) => run.apiDocId || run.caseId || run.itemId || "unknown");
  const qualityByVariantRows = summarizeQualityByVariant(matrixRuns);
  const ragRetrievalByVariantRows = summarizeRagRetrievalByVariant(matrixRuns);
  const ablationEffectRows = summarizeAblationEffects(toolcallVariantRows);
  const variantMatrixRows = summarizeVariantMatrix(toolcallVariantRows);
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
  writeCsv(path.join(outputDir, "toolcall_by_api_doc.csv"), toolcallApiDocRows);
  writeCsv(path.join(outputDir, "quality_by_variant.csv"), qualityByVariantRows);
  writeCsv(path.join(outputDir, "rag_retrieval_by_variant.csv"), ragRetrievalByVariantRows);
  writeCsv(path.join(outputDir, "ablation_effects.csv"), ablationEffectRows);
  writeCsv(path.join(outputDir, "mode_comparison.csv"), modeRows);
  writeCsv(path.join(outputDir, "rag_comparison.csv"), ragRows);
  writeCsv(path.join(outputDir, "runtime_reliability.csv"), runtimeRows);
  writeCsv(path.join(outputDir, "robustness_by_api_type.csv"), apiTypeRows);
  writeCsv(path.join(outputDir, "feedback_summary.csv"), feedbackRows);

  const md = [
    `# Research Metrics Report`,
    ``,
    `Experiment: ${experimentId || "all"}`,
    apiDocId ? `API Doc Batch: ${apiDocId}` : `API Doc Batch: all`,
    `Generated: ${new Date().toISOString()}`,
    ``,
    `## 2x2 Variant Matrix`,
    markdownTable(variantMatrixRows, ["skill_selection", "rag_off_variant", "rag_off_count", "rag_off_build_success_rate", "rag_off_endpoint_coverage", "rag_off_tool_call_pass_rate", "rag_on_variant", "rag_on_count", "rag_on_build_success_rate", "rag_on_endpoint_coverage", "rag_on_tool_call_pass_rate"]),
    `## Ablation Effects`,
    markdownTable(ablationEffectRows, ["metric", "rag_on_average", "rag_off_average", "rag_uplift", "dynamic_average", "static_average", "static_vs_dynamic_success_delta", "rag_on_count", "rag_off_count"]),
    `## Quality By Variant`,
    markdownTable(qualityByVariantRows, ["variantId", "count", "endpoint_coverage", "hallucinated_tool_rate", "schema_validity_rate", "expected_operation_count", "mapped_operation_count", "generated_tool_count", "hallucinated_tool_count", "schema_valid_tool_count"]),
    `## RAG Retrieval By Variant`,
    markdownTable(ragRetrievalByVariantRows, ["variantId", "count", "applicable_count", "evaluated_count", "missing_real_examiner_count", "no_evidence_count", "retrieval_statuses", "precision_at_3", "recall_at_3", "mrr_at_3", "retrieved_evidence_count", "relevant_evidence_count", "retrieval_hit_count"]),
    `## Backend Tool-Call Matrix By API Doc`,
    markdownTable(toolcallApiDocRows, ["apiDocId", "count", "build_success_rate", "metadata_readiness_rate", "mcp_handshake_pass_rate", "compile_pass_rate", "endpoint_coverage", "hallucinated_tool_rate", "schema_validity_rate", "inspector_pass_rate", "tool_call_pass_rate", "skipped_coverage", "cleanup_success_rate", "cleanup_removed_count", "cleanup_failed_count", "usage_complete_count", "usage_unavailable_count", "usage_complete_rate", "usage_statuses", "p50_build_total_latency_ms", "p95_build_total_latency_ms", "estimated_total_tokens", "tokens_per_successful_server", "estimated_cost_usd", "estimated_cost_per_successful_server"]),
    `## Backend Tool-Call Matrix By Variant`,
    markdownTable(toolcallVariantRows, ["variantId", "count", "build_success_rate", "metadata_readiness_rate", "mcp_handshake_pass_rate", "compile_pass_rate", "endpoint_coverage", "hallucinated_tool_rate", "schema_validity_rate", "inspector_pass_rate", "tool_call_pass_rate", "skipped_coverage", "cleanup_success_rate", "unknown_tool_validation_count", "usage_complete_count", "usage_unavailable_count", "usage_complete_rate", "usage_statuses", "p50_build_total_latency_ms", "p95_build_total_latency_ms", "estimated_total_tokens", "tokens_per_successful_server", "estimated_cost_usd", "estimated_cost_per_successful_server"]),
    `## Backend Tool-Call Matrix By Case`,
    markdownTable(toolcallCaseRows, ["caseId", "count", "build_success_rate", "metadata_readiness_rate", "inspector_pass_rate", "tool_call_pass_rate", "skipped_coverage", "cleanup_success_rate", "unknown_tool_validation_count", "p50_ms", "p95_ms", "estimated_prompt_tokens", "llm_call_count", "selected_skill_tokens", "estimated_cost_usd"]),
    `## Backend Tool-Call Matrix By API Type`,
    markdownTable(toolcallApiTypeRows, ["apiType", "count", "build_success_rate", "metadata_readiness_rate", "inspector_pass_rate", "tool_call_pass_rate", "skipped_coverage", "cleanup_success_rate", "unknown_tool_validation_count", "p50_ms", "p95_ms", "estimated_prompt_tokens", "llm_call_count", "selected_skill_tokens", "estimated_cost_usd"]),
    `## Backend Tool-Call Matrix By Skill Selection`,
    markdownTable(toolcallSkillRows, ["skillSelectionMode", "count", "build_success_rate", "metadata_readiness_rate", "inspector_pass_rate", "tool_call_pass_rate", "skipped_coverage", "cleanup_success_rate", "unknown_tool_validation_count", "p50_ms", "p95_ms", "estimated_prompt_tokens", "llm_call_count", "selected_skill_tokens", "estimated_cost_usd"]),
    `## Backend Tool-Call Matrix By RAG`,
    markdownTable(toolcallRagRows, ["ragEnabled", "count", "build_success_rate", "metadata_readiness_rate", "inspector_pass_rate", "tool_call_pass_rate", "skipped_coverage", "cleanup_success_rate", "unknown_tool_validation_count", "p50_ms", "p95_ms", "estimated_prompt_tokens", "llm_call_count", "selected_skill_tokens", "estimated_cost_usd"]),
    ``,
    `## Benchmark Runs`,
    markdownTable(runs, ["itemId", "apiDocId", "apiType", "mode", "repeatIndex", "ok", "inspectorPassRate", "cleanupStatus", "serverId", "durationMs", "rag_retrieval_status", "rag_real_examiner_event_count", "estimated_prompt_tokens", "estimated_completion_tokens", "estimated_total_tokens", "estimated_cost_usd", "usage_status", "usage_source"]),
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
