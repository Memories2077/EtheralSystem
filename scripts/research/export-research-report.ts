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
  metrics?: JsonRecord;
};

type BenchmarkRun = JsonRecord & {
  type?: string;
  experimentId?: string;
  itemId?: string;
  apiType?: string;
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
  const eventsPath = path.resolve(arg("events", process.env.RESEARCH_EVENTS_JSONL_PATH || "/tmp/etheral-research-events.jsonl"));
  const runsPath = path.resolve(arg("runs", "experiments/research-metrics/runs.jsonl"));
  const outputDir = path.resolve(arg("output-dir", `experiments/research-metrics/reports/${experimentId || "all"}`));
  ensureDir(outputDir);

  const allEvents = readJsonl<ResearchEvent>(eventsPath);
  const events = experimentId ? allEvents.filter((event) => event.experiment_id === experimentId) : allEvents;
  const runs = readJsonl<BenchmarkRun>(runsPath).filter((row) => row.type === "benchmark_result" && (!experimentId || row.experimentId === experimentId));

  const stageRows = summarizeStages(events);
  const buildRows = summarizeBuilds(events);
  const modeRows = summarizeModeComparison(runs);
  const ragRows = summarizeBenchmarkGroups(runs, "rag_key", (run) => run.ragEnabled === "true" ? "rag" : "no_rag");
  const apiTypeRows = summarizeBenchmarkGroups(runs, "apiType", (run) => run.apiType || "unknown");
  const runtimeRows = summarizeRuntimeReliability(events, runs);
  const feedbackRows = summarizeFeedback(events);
  writeCsv(path.join(outputDir, "events.csv"), events);
  writeCsv(path.join(outputDir, "stage_summary.csv"), stageRows);
  writeCsv(path.join(outputDir, "build_summary.csv"), buildRows);
  writeCsv(path.join(outputDir, "benchmark_runs.csv"), runs);
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
    `## Benchmark Runs`,
    markdownTable(runs, ["itemId", "apiType", "mode", "repeatIndex", "ok", "serverId", "durationMs"]),
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
