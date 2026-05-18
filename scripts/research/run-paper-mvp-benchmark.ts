#!/usr/bin/env bun
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { execSync } from "child_process";

const root = process.cwd();

type DatasetItem = {
  id: string;
  apiType: string;
  prompt: string;
};

type SseEvent = Record<string, unknown> & {
  type?: string;
  content?: string;
  serverId?: string;
  status?: string;
};

type McpConfigPayload = Record<string, unknown> & {
  mcpServerUrl?: string;
  config?: { mcpServers?: Record<string, { args?: unknown[] }> };
  claudeConfig?: { mcpServers?: Record<string, { args?: unknown[] }> };
  serverId?: string;
  status?: string;
};

type RuntimeMetadataResult = {
  runtimeMetadataChecked: boolean;
  runtimeMetadataOk: boolean;
  runtimeStatusCode: number | "error" | "";
  runtimeToolCount: number | "";
  runtimeError?: string;
};

type BenchmarkResult = RuntimeMetadataResult & {
  itemId: string;
  apiType: string;
  mode: "chat" | "direct";
  repeatIndex: number;
  provider: string;
  model: string;
  selectionVariant: string;
  dynamicSkillSelection: string;
  ragEnabled: string;
  metaclawEnabled: string;
  traceId: string;
  buildRequestId: string;
  statusCode: number;
  ok: boolean;
  serverId: string;
  buildStatus: string;
  durationMs: number;
  type?: "benchmark_result";
  timestamp?: string;
  experimentId?: string;
  gitCommit?: string;
};

function arg(name: string, fallback = ""): string {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : process.env[name.toUpperCase().replaceAll("-", "_")] || fallback;
}

function readJson(filePath: string): DatasetItem[] {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as DatasetItem[];
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function gitCommit(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function normalizeMcpGenUrl(raw: string): string {
  const base = raw.replace(/\/$/, "");
  return base.endsWith("/api") ? base : `${base}/api`;
}

function extractMcpServerUrl(payload: McpConfigPayload = {}): string {
  if (typeof payload.mcpServerUrl === "string" && payload.mcpServerUrl) {
    return payload.mcpServerUrl;
  }
  const config = payload.config || payload.claudeConfig || {};
  const servers = config.mcpServers || {};
  for (const serverConfig of Object.values(servers)) {
    const args = Array.isArray(serverConfig.args) ? serverConfig.args : [];
    const url = args.find((value) => typeof value === "string" && /^https?:\/\//.test(value));
    if (url) return String(url);
  }
  return "";
}

async function readSse(response: Response): Promise<{ text: string; events: SseEvent[] }> {
  const text = await response.text();
  const events: SseEvent[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const raw = line.slice(5).trim();
    if (!raw || raw === "[DONE]") continue;
    try {
      events.push(JSON.parse(raw));
    } catch {
      events.push({ type: "content", content: raw });
    }
  }
  return { text, events };
}

async function checkRuntimeMetadata({
  backendUrl,
  mcpServerUrl,
  traceId,
  experimentId,
  sessionId,
  buildRequestId,
  serverId,
}: {
  backendUrl: string;
  mcpServerUrl: string;
  traceId: string;
  experimentId: string;
  sessionId: string;
  buildRequestId: string;
  serverId: string;
}): Promise<RuntimeMetadataResult> {
  if (!mcpServerUrl) {
    return {
      runtimeMetadataChecked: false,
      runtimeMetadataOk: false,
      runtimeStatusCode: "",
      runtimeToolCount: "",
    };
  }

  try {
    const response = await fetch(`${backendUrl.replace(/\/$/, "")}/mcp/metadata`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: mcpServerUrl,
        traceId,
        experimentId,
        sessionId,
        buildRequestId,
        serverId,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    return {
      runtimeMetadataChecked: true,
      runtimeMetadataOk: response.ok && payload.status === "connected",
      runtimeStatusCode: response.status,
      runtimeToolCount: Array.isArray(payload.tools) ? payload.tools.length : 0,
    };
  } catch (error) {
    return {
      runtimeMetadataChecked: true,
      runtimeMetadataOk: false,
      runtimeStatusCode: "error",
      runtimeToolCount: "",
      runtimeError: error instanceof Error ? error.message : String(error),
    };
  }
}

function runModeFlags() {
  return {
    selectionVariant: process.env.SKILL_SELECTION_VARIANT || "unspecified",
    dynamicSkillSelection: process.env.DYNAMIC_SKILL_SELECTION || "",
    ragEnabled: process.env.RAG_ENABLED || "",
    metaclawEnabled: process.env.METACLAW_ENABLED || "",
  };
}

async function runChatItem({
  item,
  repeatIndex,
  experimentId,
  backendUrl,
  provider,
  model,
}: {
  item: DatasetItem;
  repeatIndex: number;
  experimentId: string;
  backendUrl: string;
  provider: string;
  model: string;
}): Promise<BenchmarkResult> {
  const traceId = randomUUID();
  const buildRequestId = `${experimentId}-${item.id}-r${repeatIndex}`;
  const sessionId = `session-${experimentId}-${item.id}`;
  const startedAt = Date.now();
  const response = await fetch(`${backendUrl.replace(/\/$/, "")}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: item.prompt }],
      provider,
      model,
      temperature: 0,
      mcpServers: [],
      sessionId,
      buildRequestId,
      traceId,
      experimentId,
      userId: "research_runner",
      workspaceId: "paper_mvp",
      email: "research_runner@local",
      memoryScope: `experiment:${experimentId}|dataset:${item.id}`,
    }),
  });
  const { events } = await readSse(response);
  const buildComplete = events.find((event) => event.type === "mcp_build_complete") || {};
  const runtime = await checkRuntimeMetadata({
    backendUrl,
    mcpServerUrl: extractMcpServerUrl(buildComplete as McpConfigPayload),
    traceId,
    experimentId,
    sessionId,
    buildRequestId,
    serverId: String(buildComplete.serverId || ""),
  });
  return {
    itemId: item.id,
    apiType: item.apiType,
    mode: "chat",
    repeatIndex,
    provider,
    model,
    ...runModeFlags(),
    traceId,
    buildRequestId,
    statusCode: response.status,
    ok: response.ok,
    serverId: String(buildComplete.serverId || ""),
    buildStatus: String(buildComplete.status || ""),
    durationMs: Date.now() - startedAt,
    ...runtime,
  };
}

async function runDirectItem({
  item,
  repeatIndex,
  experimentId,
  backendUrl,
  mcpGenUrl,
  provider,
  model,
}: {
  item: DatasetItem;
  repeatIndex: number;
  experimentId: string;
  backendUrl: string;
  mcpGenUrl: string;
  provider: string;
  model: string;
}): Promise<BenchmarkResult> {
  const traceId = randomUUID();
  const buildRequestId = `${experimentId}-${item.id}-direct-r${repeatIndex}`;
  const sessionId = `session-${experimentId}-${item.id}`;
  const startedAt = Date.now();
  const response = await fetch(`${normalizeMcpGenUrl(mcpGenUrl)}/mcp/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Trace-Id": traceId,
      "X-Experiment-Id": experimentId,
    },
    body: JSON.stringify({
      request: item.prompt,
      userId: "research_runner",
      email: "research_runner@local",
      rag_context: [],
      sessionId,
      buildRequestId,
      traceId,
      experimentId,
      workspaceId: "paper_mvp",
      memoryScope: `experiment:${experimentId}|dataset:${item.id}`,
    }),
  });
  let payload: McpConfigPayload = {};
  try {
    payload = await response.json() as McpConfigPayload;
  } catch {
    payload = {};
  }
  const runtime = await checkRuntimeMetadata({
    backendUrl,
    mcpServerUrl: extractMcpServerUrl(payload),
    traceId,
    experimentId,
    sessionId,
    buildRequestId,
    serverId: String(payload.serverId || ""),
  });
  return {
    itemId: item.id,
    apiType: item.apiType,
    mode: "direct",
    repeatIndex,
    provider,
    model,
    ...runModeFlags(),
    traceId,
    buildRequestId,
    statusCode: response.status,
    ok: response.ok,
    serverId: String(payload.serverId || ""),
    buildStatus: String(payload.status || ""),
    durationMs: Date.now() - startedAt,
    ...runtime,
  };
}

async function main() {
  const datasetPath = path.resolve(root, arg("dataset", "experiments/research-metrics/paper_mvp_dataset.json"));
  const outputPath = path.resolve(root, arg("output", "experiments/research-metrics/runs.jsonl"));
  const experimentId = arg("experiment-id", `paper-mvp-${new Date().toISOString().slice(0, 10)}`);
  const mode = arg("mode", "chat");
  const repeats = Number(arg("repeats", "1"));
  const limit = Number(arg("limit", "0"));
  const backendUrl = arg("backend-url", "http://localhost:8000");
  const mcpGenUrl = arg("mcp-gen-url", "http://localhost:8080");
  const provider = arg("provider", "gemini");
  const model = arg("model", "gemini-2.5-flash");
  const dataset = readJson(datasetPath);
  const selectedItems = limit > 0 ? dataset.slice(0, limit) : dataset;
  process.env.RESEARCH_METRICS_ENABLED ||= "true";
  process.env.RESEARCH_EXPERIMENT_ID ||= experimentId;

  ensureDir(path.dirname(outputPath));
  const header = {
    type: "benchmark_start",
    timestamp: new Date().toISOString(),
    experimentId,
    mode,
    repeats,
    datasetPath,
    gitCommit: gitCommit(),
    researchMetricsEnabled: process.env.RESEARCH_METRICS_ENABLED || "",
    provider,
    model,
    dynamicSkillSelection: process.env.DYNAMIC_SKILL_SELECTION || "",
    skillSelectionVariant: process.env.SKILL_SELECTION_VARIANT || "",
    ragEnabled: process.env.RAG_ENABLED || "",
    metaclawEnabled: process.env.METACLAW_ENABLED || "",
  };
  fs.appendFileSync(outputPath, `${JSON.stringify(header)}\n`);

  for (const item of selectedItems) {
    for (let repeatIndex = 1; repeatIndex <= repeats; repeatIndex++) {
      const result =
        mode === "direct"
          ? await runDirectItem({ item, repeatIndex, experimentId, backendUrl, mcpGenUrl, provider, model })
          : await runChatItem({ item, repeatIndex, experimentId, backendUrl, provider, model });
      result.type = "benchmark_result";
      result.timestamp = new Date().toISOString();
      result.experimentId = experimentId;
      result.gitCommit = header.gitCommit;
      fs.appendFileSync(outputPath, `${JSON.stringify(result)}\n`);
      console.log(`${result.mode} ${result.itemId} r${repeatIndex}: ${result.ok ? "ok" : "failed"} ${result.serverId}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
