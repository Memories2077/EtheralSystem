#!/usr/bin/env bun
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { MongoClient } from "mongodb";

type JsonRecord = Record<string, unknown>;

type SseEvent = JsonRecord & {
  type?: string;
  content?: string;
  error?: string;
  message?: string;
  serverId?: string;
  status?: string;
  mcpServerUrl?: string;
  publicUrl?: string;
  config?: { mcpServers?: Record<string, { args?: unknown[] }> };
  claudeConfig?: { mcpServers?: Record<string, { args?: unknown[] }> };
};

type MetadataTool = {
  name?: string;
  description?: string;
};

type MetadataResponse = JsonRecord & {
  status?: string;
  tools?: MetadataTool[];
};

type ResearchEvent = JsonRecord & {
  event_name?: string;
  status?: string;
  build_request_id?: string;
  trace_id?: string;
  experiment_id?: string;
  server_id?: string;
  metrics?: JsonRecord;
};

const root = process.cwd();

function env(name: string, fallback = ""): string {
  return process.env[name] || fallback;
}

function arg(name: string, fallback = ""): string {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : env(name.toUpperCase().replaceAll("-", "_"), fallback);
}

function baseUrl(raw: string): string {
  return raw.replace(/\/$/, "");
}

function redactUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return raw.replace(/\?.*$/, "");
  }
}

function fixturePath(): string {
  const configured = arg("input", env("HEADLESS_MCP_INPUT_PATH", ""));
  if (configured) return path.resolve(root, configured);
  const rootFixture = path.resolve(root, "INPUT_SAMPLE.txt");
  if (fs.existsSync(rootFixture)) return rootFixture;
  return path.resolve(root, "input/jsonplaceholder.txt");
}

function readFixture(): string {
  const filePath = fixturePath();
  if (!fs.existsSync(filePath)) {
    throw new Error(`JSONPlaceholder fixture not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, "utf8").trim();
  if (!content || !content.toLowerCase().includes("jsonplaceholder")) {
    throw new Error(`${filePath} must contain a JSONPlaceholder prompt/guide.`);
  }
  return content;
}

async function fetchJson(url: string, init?: RequestInit, label = url): Promise<JsonRecord> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(Number(env("HEADLESS_MCP_HTTP_TIMEOUT_MS", "30000"))) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${label} failed: HTTP ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload as JsonRecord;
}

async function readSse(response: Response): Promise<{ events: SseEvent[]; content: string; errors: SseEvent[] }> {
  const text = await response.text();
  const events: SseEvent[] = [];
  const contentParts: string[] = [];
  const errors: SseEvent[] = [];

  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const raw = line.slice(5).trim();
    if (!raw || raw === "[DONE]") continue;
    let event: SseEvent;
    try {
      event = JSON.parse(raw) as SseEvent;
    } catch {
      event = { type: "content", content: raw };
    }
    events.push(event);
    if (event.type === "content" && typeof event.content === "string") contentParts.push(event.content);
    if (event.type === "error") errors.push(event);
  }
  return { events, content: contentParts.join(""), errors };
}

async function postChat({
  backendUrl,
  messages,
  mcpServers,
  sessionId,
  buildRequestId,
  traceId,
  experimentId,
}: {
  backendUrl: string;
  messages: Array<{ role: string; content: string }>;
  mcpServers: string[];
  sessionId: string;
  buildRequestId: string;
  traceId: string;
  experimentId: string;
}): Promise<{ response: Response; events: SseEvent[]; content: string; errors: SseEvent[] }> {
  const provider = arg("provider", env("HEADLESS_MCP_PROVIDER", "gemini"));
  const model = arg("model", env("HEADLESS_MCP_MODEL", "gemini-2.5-flash"));
  const response = await fetch(`${baseUrl(backendUrl)}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      provider,
      model,
      temperature: 0,
      mcpServers,
      sessionId,
      buildRequestId,
      traceId,
      experimentId,
      userId: "headless_validator",
      workspaceId: "headless_validation",
      email: "headless-validator@local",
      memoryScope: `experiment:${experimentId}|build:${buildRequestId}`,
    }),
  });
  const parsed = await readSse(response);
  return { response, ...parsed };
}

function extractMcpServerUrl(payload: SseEvent = {}): string {
  if (typeof payload.mcpServerUrl === "string" && payload.mcpServerUrl) return payload.mcpServerUrl;
  if (typeof payload.publicUrl === "string" && payload.publicUrl) return payload.publicUrl;
  const config = payload.config || payload.claudeConfig || {};
  const servers = config.mcpServers || {};
  for (const serverConfig of Object.values(servers)) {
    const args = Array.isArray(serverConfig.args) ? serverConfig.args : [];
    const url = args.find((value) => typeof value === "string" && /^https?:\/\//.test(value));
    if (url) return String(url);
  }
  return "";
}

function extractBuildComplete(events: SseEvent[]): SseEvent {
  return events.find((event) => event.type === "mcp_build_complete") || {};
}

async function poll<T>(
  label: string,
  fn: () => Promise<T | null>,
  predicate: (value: T) => boolean,
  timeoutMs: number,
): Promise<T> {
  const start = Date.now();
  let lastValue: unknown = null;
  let lastError: unknown = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const value = await fn();
      lastValue = value;
      if (value && predicate(value)) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`${label} timed out after ${timeoutMs}ms. Last value=${JSON.stringify(lastValue)} Last error=${lastError instanceof Error ? lastError.message : String(lastError || "")}`);
}

async function waitForManagerStatus(managerUrl: string, serverId: string, buildRequestId: string): Promise<JsonRecord> {
  const key = serverId || buildRequestId;
  if (!key) throw new Error("Cannot poll manager status without serverId or buildRequestId.");
  return poll(
    "mcp manager running status",
    async () => fetchJson(`${baseUrl(managerUrl)}/api/mcp/${key}/status`, undefined, "mcp manager status"),
    (payload) => payload.status === "running",
    Number(env("HEADLESS_MCP_MANAGER_TIMEOUT_MS", "120000")),
  );
}

async function checkMetadata({
  backendUrl,
  mcpUrl,
  traceId,
  experimentId,
  sessionId,
  buildRequestId,
  serverId,
}: {
  backendUrl: string;
  mcpUrl: string;
  traceId: string;
  experimentId: string;
  sessionId: string;
  buildRequestId: string;
  serverId: string;
}): Promise<MetadataResponse> {
  const payload = await fetchJson(
    `${baseUrl(backendUrl)}/mcp/metadata`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: mcpUrl, traceId, experimentId, sessionId, buildRequestId, serverId }),
    },
    "mcp metadata",
  );
  const metadata = payload as MetadataResponse;
  const tools = Array.isArray(metadata.tools) ? metadata.tools : [];
  if (metadata.status !== "connected" || tools.length === 0) {
    throw new Error(`MCP metadata did not connect with tools: ${JSON.stringify(metadata)}`);
  }
  return metadata;
}

function localJsonlPath(): string {
  const configured = env("HEADLESS_MCP_RESEARCH_EVENTS_JSONL_PATH", env("RESEARCH_EVENTS_JSONL_PATH", "reports/jsonplaceholder-ui-metrics/research-events.jsonl"));
  if (configured.startsWith("/repo/")) return path.resolve(root, configured.slice("/repo/".length));
  return path.resolve(root, configured);
}

function readJsonlEvents(buildRequestId: string): ResearchEvent[] {
  const filePath = localJsonlPath();
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as ResearchEvent;
      } catch {
        return null;
      }
    })
    .filter((event): event is ResearchEvent => Boolean(event) && event.build_request_id === buildRequestId);
}

async function readMongoEvents(buildRequestId: string): Promise<ResearchEvent[]> {
  const mongoUri = env("HEADLESS_MCP_MONGO_URI", env("E2E_MONGO_URI", env("MONGO_URI", "mongodb://localhost:27017")));
  const dbName = env("RESEARCH_EVENTS_DB", env("MONGODB_DB", env("MONGO_DB_NAME", "docker")));
  const collectionName = env("RESEARCH_EVENTS_COLLECTION", "research_events");
  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 2000 });
  try {
    await client.connect();
    return await client.db(dbName).collection<ResearchEvent>(collectionName).find({ build_request_id: buildRequestId }).toArray();
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function readResearchEvents(buildRequestId: string): Promise<ResearchEvent[]> {
  try {
    const mongoEvents = await readMongoEvents(buildRequestId);
    if (mongoEvents.length > 0) return mongoEvents;
  } catch {
    // JSONL fallback below keeps the runner useful when Mongo is not exposed on localhost.
  }
  return readJsonlEvents(buildRequestId);
}

async function waitForInvocationEvent(buildRequestId: string): Promise<ResearchEvent> {
  const event = await poll(
    "mcp_tool_invocation_completed research event",
    async () => {
      const events = await readResearchEvents(buildRequestId);
      return events.find((item) => item.event_name === "mcp_tool_invocation_completed") || null;
    },
    (item) => item.event_name === "mcp_tool_invocation_completed",
    Number(env("HEADLESS_MCP_EVENT_TIMEOUT_MS", "120000")),
  );
  if (event.status !== "success" || event.metrics?.mcp_tool_success !== true) {
    throw new Error(`Generated MCP tool was not invoked successfully: ${JSON.stringify(event)}`);
  }
  return event;
}

function usefulJsonPlaceholderAnswer(content: string): boolean {
  const normalized = content.toLowerCase();
  return (
    normalized.includes("jsonplaceholder") ||
    normalized.includes("post") ||
    normalized.includes("user") ||
    /(^|\D)1(\D|$)/.test(normalized)
  );
}

async function main(): Promise<void> {
  const backendUrl = arg("backend-url", env("E2E_BACKEND_URL", "http://localhost:8000"));
  const managerUrl = arg("manager-url", env("E2E_MCP_MANAGER_URL", "http://localhost:8080"));
  const experimentId = arg("experiment-id", env("RESEARCH_EXPERIMENT_ID", "jsonplaceholder-headless-mcp-tool"));
  const runId = randomUUID();
  const traceId = runId;
  const buildRequestId = `headless-mcp-tool-${runId}`;
  const sessionId = `headless-session-${runId}`;
  const fixture = readFixture();

  await fetchJson(`${baseUrl(backendUrl)}/health`, undefined, "backend health");
  await fetchJson(`${baseUrl(managerUrl)}/api/mcp/stats`, undefined, "mcp manager stats");

  const build = await postChat({
    backendUrl,
    messages: [{ role: "user", content: fixture }],
    mcpServers: [],
    sessionId,
    buildRequestId,
    traceId,
    experimentId,
  });
  if (!build.response.ok || build.errors.length > 0) {
    throw new Error(`Build chat failed: HTTP ${build.response.status}; errors=${JSON.stringify(build.errors)}`);
  }

  const buildComplete = extractBuildComplete(build.events);
  const serverId = String(buildComplete.serverId || "");
  let mcpUrl = extractMcpServerUrl(buildComplete);
  const managerStatus = await waitForManagerStatus(managerUrl, serverId, buildRequestId);
  if (!mcpUrl) {
    mcpUrl = extractMcpServerUrl(managerStatus as SseEvent) || String(managerStatus.publicUrl || "");
  }
  if (!mcpUrl) throw new Error(`Could not extract generated MCP URL. Build event=${JSON.stringify(buildComplete)} Manager status=${JSON.stringify(managerStatus)}`);

  const metadata = await checkMetadata({
    backendUrl,
    mcpUrl,
    traceId,
    experimentId,
    sessionId,
    buildRequestId,
    serverId: serverId || String(managerStatus.serverId || ""),
  });
  const tools = Array.isArray(metadata.tools) ? metadata.tools : [];
  const selectedTool = String(tools[0]?.name || "");
  if (!selectedTool) throw new Error(`Metadata returned tools without a tool name: ${JSON.stringify(metadata)}`);

  const followUpPrompt = [
    `Use the active MCP tool named "${selectedTool}" to fetch JSONPlaceholder data.`,
    "Fetch posts for userId=1 or the closest matching JSONPlaceholder posts operation exposed by that tool.",
    "Return a compact answer with at least one post id and title. Do not answer from memory.",
  ].join(" ");

  const followUp = await postChat({
    backendUrl,
    messages: [{ role: "user", content: followUpPrompt }],
    mcpServers: [mcpUrl],
    sessionId,
    buildRequestId,
    traceId,
    experimentId,
  });
  if (!followUp.response.ok || followUp.errors.length > 0) {
    throw new Error(`Follow-up chat failed: HTTP ${followUp.response.status}; errors=${JSON.stringify(followUp.errors)}`);
  }
  if (!usefulJsonPlaceholderAnswer(followUp.content)) {
    throw new Error(`Follow-up answer did not look useful for JSONPlaceholder data: ${followUp.content.slice(0, 500)}`);
  }

  const invocationEvent = await waitForInvocationEvent(buildRequestId);
  const summary = {
    buildRequestId,
    traceId,
    sessionId,
    experimentId,
    serverId: serverId || String(managerStatus.serverId || ""),
    mcpUrl: redactUrl(mcpUrl),
    metadataToolCount: tools.length,
    selectedTool,
    invocationStatus: invocationEvent.status,
    invocationCount: invocationEvent.metrics?.mcp_tool_invocation_count,
    toolResultCount: invocationEvent.metrics?.mcp_tool_result_count,
    followUpPreview: followUp.content.replace(/\s+/g, " ").trim().slice(0, 300),
  };
  console.info("[headless-mcp-tool-validation-summary]", JSON.stringify(summary));
}

main().catch((error) => {
  console.error("[headless-mcp-tool-validation-error]", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
