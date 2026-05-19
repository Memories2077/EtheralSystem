#!/usr/bin/env bun
import fs from "fs";
import path from "path";
import { createHash, randomUUID } from "crypto";
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
  session_id?: string;
  server_id?: string;
  error_code?: string;
  metrics?: JsonRecord;
};

type ToolOutcomeStatus = "success" | "failed" | "skipped";

type ToolOutcome = {
  tool_name: string;
  index: number;
  status: ToolOutcomeStatus;
  error_code: string;
  invocation_count: number;
  result_count: number;
  response_length: number;
  response_hash: string;
  diagnostic: string;
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

function safeText(value: unknown, limit = 240): string {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text.length > limit ? text.slice(0, limit) : text;
}

function redactDiagnostic(value: unknown, limit = 240): string {
  return safeText(value, limit * 2)
    .replace(/(token|secret|password|api[_-]?key|authorization|cookie)=([^&\s]+)/gi, "$1=[REDACTED]")
    .replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [REDACTED]")
    .replace(/eyJ[A-Za-z0-9._-]+/g, "[REDACTED_JWT]")
    .slice(0, limit);
}

function contentHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
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

async function waitForInvocationEvent(buildRequestId: string, sessionId: string): Promise<ResearchEvent> {
  const event = await poll(
    "mcp_tool_invocation_completed research event",
    async () => {
      const events = await readResearchEvents(buildRequestId);
      return [...events]
        .reverse()
        .find((item) => item.event_name === "mcp_tool_invocation_completed" && item.session_id === sessionId) || null;
    },
    (item) => item.event_name === "mcp_tool_invocation_completed",
    Number(env("HEADLESS_MCP_EVENT_TIMEOUT_MS", "120000")),
  );
  return event;
}

async function waitForOutcomeEvent(buildRequestId: string, sessionId: string): Promise<ResearchEvent> {
  return poll(
    "mcp_tool_outcomes_completed research event",
    async () => {
      const events = await readResearchEvents(buildRequestId);
      return [...events]
        .reverse()
        .find((item) => item.event_name === "mcp_tool_outcomes_completed" && item.session_id === sessionId) || null;
    },
    (item) => item.event_name === "mcp_tool_outcomes_completed",
    Number(env("HEADLESS_MCP_EVENT_TIMEOUT_MS", "120000")),
  );
}

function countOutcomes(outcomes: ToolOutcome[]): {
  total: number;
  attempted: number;
  success: number;
  failed: number;
  skipped: number;
  failedToolNames: string[];
  skippedToolNames: string[];
} {
  const failedToolNames = outcomes.filter((item) => item.status === "failed").map((item) => item.tool_name);
  const skippedToolNames = outcomes.filter((item) => item.status === "skipped").map((item) => item.tool_name);
  const success = outcomes.filter((item) => item.status === "success").length;
  const failed = failedToolNames.length;
  const skipped = skippedToolNames.length;
  return {
    total: outcomes.length,
    attempted: success + failed,
    success,
    failed,
    skipped,
    failedToolNames,
    skippedToolNames,
  };
}

function numericMetric(metrics: JsonRecord | undefined, key: string): number {
  const value = metrics?.[key];
  return typeof value === "number" ? value : Number(value || 0);
}

function stringArrayMetric(metrics: JsonRecord | undefined, key: string): string[] {
  const value = metrics?.[key];
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function toolValidationPrompt(toolName: string, description: string): string {
  return [
    `Use exactly the active MCP tool named "${toolName}".`,
    description ? `Tool description: ${description}` : "",
    "Call this tool with safe JSONPlaceholder test arguments inferred from its name and description.",
    "Use id=1, userId=1, postId=1, albumId=1, photoId=1, commentId=1, or todoId=1 when an id-like argument is required.",
    "For JSONPlaceholder write operations, use harmless fake test data because the service does not persist changes.",
    "Do not answer from memory. Return a compact answer after the tool call.",
  ].filter(Boolean).join(" ");
}

function skippedOutcome(tool: MetadataTool, index: number, errorCode: string, diagnostic: string): ToolOutcome {
  return {
    tool_name: safeText(tool.name || `tool-${index + 1}`, 120),
    index,
    status: "skipped",
    error_code: errorCode,
    invocation_count: 0,
    result_count: 0,
    response_length: 0,
    response_hash: "",
    diagnostic: redactDiagnostic(diagnostic),
  };
}

async function validateTool({
  backendUrl,
  mcpUrl,
  tool,
  index,
  buildRequestId,
  traceId,
  experimentId,
  baseSessionId,
}: {
  backendUrl: string;
  mcpUrl: string;
  tool: MetadataTool;
  index: number;
  buildRequestId: string;
  traceId: string;
  experimentId: string;
  baseSessionId: string;
}): Promise<ToolOutcome> {
  const toolName = safeText(tool.name, 120);
  const description = safeText(tool.description, 300);
  if (!toolName || toolName === "unknown") {
    return skippedOutcome(tool, index, "missing_tool_name", "Metadata tool did not include a usable name.");
  }

  const toolSessionId = `${baseSessionId}-tool-${index + 1}`;
  try {
    const followUp = await postChat({
      backendUrl,
      messages: [{ role: "user", content: toolValidationPrompt(toolName, description) }],
      mcpServers: [mcpUrl],
      sessionId: toolSessionId,
      buildRequestId,
      traceId,
      experimentId,
    });

    if (!followUp.response.ok) {
      return {
        tool_name: toolName,
        index,
        status: "failed",
        error_code: "chat_http_error",
        invocation_count: 0,
        result_count: 0,
        response_length: followUp.content.length,
        response_hash: followUp.content ? contentHash(followUp.content) : "",
        diagnostic: redactDiagnostic(`HTTP ${followUp.response.status}`),
      };
    }

    if (followUp.errors.length > 0) {
      return {
        tool_name: toolName,
        index,
        status: "failed",
        error_code: "chat_sse_error",
        invocation_count: 0,
        result_count: 0,
        response_length: followUp.content.length,
        response_hash: followUp.content ? contentHash(followUp.content) : "",
        diagnostic: redactDiagnostic(JSON.stringify(followUp.errors.slice(0, 2))),
      };
    }

    const invocationEvent = await waitForInvocationEvent(buildRequestId, toolSessionId);
    const metrics = invocationEvent.metrics || {};
    const invocationCount = numericMetric(metrics, "mcp_tool_invocation_count");
    const resultCount = numericMetric(metrics, "mcp_tool_result_count");
    const invokedToolNames = stringArrayMetric(metrics, "invoked_tool_names");
    const resultToolNames = stringArrayMetric(metrics, "result_tool_names");
    const expectedInvoked = invokedToolNames.includes(toolName) || resultToolNames.includes(toolName);
    const eventSucceeded = invocationEvent.status === "success" && metrics.mcp_tool_success === true;
    const status: ToolOutcomeStatus = eventSucceeded && expectedInvoked ? "success" : "failed";
    const errorCode = status === "success"
      ? ""
      : (!expectedInvoked ? "expected_tool_not_invoked" : String(invocationEvent.error_code || "mcp_tool_invocation_failed"));

    return {
      tool_name: toolName,
      index,
      status,
      error_code: errorCode,
      invocation_count: invocationCount,
      result_count: resultCount,
      response_length: followUp.content.length,
      response_hash: followUp.content ? contentHash(followUp.content) : "",
      diagnostic: status === "success"
        ? ""
        : redactDiagnostic(`invoked=${invokedToolNames.join(",") || "none"} result=${resultToolNames.join(",") || "none"}`),
    };
  } catch (error) {
    return {
      tool_name: toolName,
      index,
      status: "failed",
      error_code: "tool_validation_error",
      invocation_count: 0,
      result_count: 0,
      response_length: 0,
      response_hash: "",
      diagnostic: redactDiagnostic(error instanceof Error ? error.message : String(error)),
    };
  }
}

async function recordToolOutcomes({
  backendUrl,
  mcpUrl,
  outcomes,
  traceId,
  experimentId,
  sessionId,
  buildRequestId,
  serverId,
  durationMs,
}: {
  backendUrl: string;
  mcpUrl: string;
  outcomes: ToolOutcome[];
  traceId: string;
  experimentId: string;
  sessionId: string;
  buildRequestId: string;
  serverId: string;
  durationMs: number;
}): Promise<void> {
  const response = await fetchJson(
    `${baseUrl(backendUrl)}/mcp/tool-outcomes`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mcpUrl,
        outcomes,
        provider: arg("provider", env("HEADLESS_MCP_PROVIDER", "gemini")),
        model: arg("model", env("HEADLESS_MCP_MODEL", "gemini-2.5-flash")),
        durationMs,
        traceId,
        experimentId,
        sessionId,
        buildRequestId,
        serverId,
      }),
    },
    "mcp tool outcomes",
  );
  if (response.persisted === false) {
    throw new Error("mcp_tool_outcomes_completed was not persisted. Check RESEARCH_METRICS_ENABLED.");
  }
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
  const outcomeStartMs = Date.now();
  const outcomes: ToolOutcome[] = [];
  for (const [index, tool] of tools.entries()) {
    outcomes.push(await validateTool({
      backendUrl,
      mcpUrl,
      tool,
      index,
      buildRequestId,
      traceId,
      experimentId,
      baseSessionId: sessionId,
    }));
  }

  await recordToolOutcomes({
    backendUrl,
    mcpUrl,
    outcomes,
    traceId,
    experimentId,
    sessionId,
    buildRequestId,
    serverId: serverId || String(managerStatus.serverId || ""),
    durationMs: Date.now() - outcomeStartMs,
  });
  const outcomeEvent = await waitForOutcomeEvent(buildRequestId, sessionId);
  const counts = countOutcomes(outcomes);
  const summary = {
    buildRequestId,
    traceId,
    sessionId,
    experimentId,
    serverId: serverId || String(managerStatus.serverId || ""),
    mcpUrl: redactUrl(mcpUrl),
    metadataToolCount: tools.length,
    outcomeStatus: outcomeEvent.status,
    totalToolCount: counts.total,
    attemptedToolCount: counts.attempted,
    successToolCount: counts.success,
    failedToolCount: counts.failed,
    skippedToolCount: counts.skipped,
    failedToolNames: counts.failedToolNames,
    skippedToolNames: counts.skippedToolNames,
  };
  console.info("[headless-mcp-tool-validation-summary]", JSON.stringify(summary));
  if (counts.attempted === 0) {
    throw new Error(`No generated MCP tools were attempted. Summary=${JSON.stringify(summary)}`);
  }
  if (counts.failed > 0) {
    throw new Error(`Generated MCP tool validation failed for ${counts.failed} tool(s): ${counts.failedToolNames.join(", ")}`);
  }
}

main().catch((error) => {
  console.error("[headless-mcp-tool-validation-error]", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
