#!/usr/bin/env bun
import fs from "fs";
import path from "path";
import { randomUUID, createHash } from "crypto";
import { execSync } from "child_process";
import { MongoClient } from "mongodb";

const root = process.cwd();

type JsonRecord = Record<string, unknown>;

type ProbeDefinition = {
  id: string;
  operation: string;
  match: string[];
  prompt: string;
};

type SkipRule = {
  match: string[];
  errorCode: string;
  diagnostic: string;
};

type MatrixCase = {
  id: string;
  apiType: string;
  title: string;
  baseUrl: string;
  prompt?: string;
  inputPath?: string;
  authInfoPath?: string;
  inputDocHash?: string;
  authInfoHash?: string;
  probes: ProbeDefinition[];
  skipRules?: SkipRule[];
};

type Variant = {
  id: string;
  skillSelectionMode: "static" | "dynamic";
  dynamicSkillSelection: "true" | "false";
  skillSelectionVariant: "static" | "dynamic";
  ragEnabled: "true" | "false";
};

type SseEvent = JsonRecord & {
  type?: string;
  content?: string;
  serverId?: string;
  status?: string;
  mcpServerUrl?: string;
  publicUrl?: string;
  config?: { mcpServers?: Record<string, { args?: unknown[] }> };
  claudeConfig?: { mcpServers?: Record<string, { args?: unknown[] }> };
};

type MetadataTool = JsonRecord & {
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
  session_id?: string;
  build_request_id?: string;
  metrics?: JsonRecord;
};

type ToolOutcomeStatus = "success" | "failed" | "skipped";

type ToolOutcome = {
  tool_name: string;
  index: number;
  probe_id?: string;
  operation?: string;
  status: ToolOutcomeStatus;
  error_code: string;
  invocation_count: number;
  result_count: number;
  response_length: number;
  response_hash: string;
  diagnostic: string;
};

type Options = {
  datasetPath: string;
  outputPath: string;
  eventsPath: string;
  experimentId: string;
  variants: string[];
  cases: string[];
  limit: number;
  repeats: number;
  provider: string;
  model: string;
  backendUrl: string;
  managerUrl: string;
  dryRun: boolean;
  restartStack: boolean;
};

const variants: Variant[] = [
  {
    id: "static-rag-off",
    skillSelectionMode: "static",
    dynamicSkillSelection: "false",
    skillSelectionVariant: "static",
    ragEnabled: "false",
  },
  {
    id: "static-rag-on",
    skillSelectionMode: "static",
    dynamicSkillSelection: "false",
    skillSelectionVariant: "static",
    ragEnabled: "true",
  },
  {
    id: "dynamic-rag-off",
    skillSelectionMode: "dynamic",
    dynamicSkillSelection: "true",
    skillSelectionVariant: "dynamic",
    ragEnabled: "false",
  },
  {
    id: "dynamic-rag-on",
    skillSelectionMode: "dynamic",
    dynamicSkillSelection: "true",
    skillSelectionVariant: "dynamic",
    ragEnabled: "true",
  },
];

function env(name: string, fallback = ""): string {
  return process.env[name] || fallback;
}

function arg(name: string, fallback = ""): string {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  return env(name.toUpperCase().replaceAll("-", "_"), fallback);
}

function flag(name: string, fallback = false): boolean {
  if (process.argv.includes(`--${name}`)) return true;
  if (process.argv.includes(`--no-${name}`)) return false;
  const raw = arg(name, fallback ? "true" : "false").toLowerCase();
  return ["1", "true", "yes", "on"].includes(raw);
}

function csvArg(name: string): string[] {
  return arg(name, "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function baseUrl(raw: string): string {
  return raw.replace(/\/$/, "");
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function readOptionalText(filePath?: string): string {
  if (!filePath) return "";
  return fs.readFileSync(path.resolve(root, filePath), "utf8").trim();
}

function materializeCase(item: MatrixCase): MatrixCase {
  const apiDoc = readOptionalText(item.inputPath);
  const authInfo = readOptionalText(item.authInfoPath);
  const promptParts = [
    item.prompt ||
      "Create an MCP Server from the following API documentation. Treat credentials as user-provided tool arguments; do not load secrets from environment variables.",
    apiDoc ? `API documentation source: ${item.inputPath}\n\n${apiDoc}` : "",
    authInfo
      ? `Additional auth/test-call information source: ${item.authInfoPath}\n\n${authInfo}`
      : "",
  ].filter(Boolean);
  return {
    ...item,
    prompt: promptParts.join("\n\n---\n\n"),
    inputDocHash: apiDoc ? contentHash(apiDoc) : undefined,
    authInfoHash: authInfo ? contentHash(authInfo) : undefined,
  };
}

function materializeDataset(dataset: MatrixCase[]): MatrixCase[] {
  return dataset.map(materializeCase);
}

function appendJsonl(filePath: string, value: JsonRecord): void {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`);
}

function gitCommit(): string {
  try {
    return execSync("git rev-parse HEAD", {
      cwd: root,
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function safeText(value: unknown, maxLength: number): string {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function redactDiagnostic(value: string): string {
  return safeText(value, 500)
    .replace(
      /(token|secret|password|api[_-]?key|authorization|cookie)=([^&\s]+)/gi,
      "$1=[REDACTED]",
    )
    .replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [REDACTED]")
    .replace(/eyJ[A-Za-z0-9._-]+/g, "[REDACTED_JWT]");
}

function redactUrl(raw: string): string {
  try {
    const url = new URL(raw);
    for (const key of [...url.searchParams.keys()]) {
      if (/token|secret|key|auth|password/i.test(key))
        url.searchParams.set(key, "[REDACTED]");
    }
    return url.toString();
  } catch {
    return redactDiagnostic(raw);
  }
}

async function readSse(
  response: Response,
): Promise<{ events: SseEvent[]; content: string; errors: SseEvent[] }> {
  const text = await response.text();
  const events: SseEvent[] = [];
  const contentParts: string[] = [];
  const errors: SseEvent[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const raw = line.slice(5).trim();
    if (!raw || raw === "[DONE]") continue;
    try {
      const event = JSON.parse(raw) as SseEvent;
      events.push(event);
      if (event.type === "content" && typeof event.content === "string")
        contentParts.push(event.content);
      if (event.type === "error") errors.push(event);
    } catch {
      events.push({ type: "content", content: raw });
      contentParts.push(raw);
    }
  }
  return { events, content: contentParts.join(""), errors };
}

async function fetchJson(
  url: string,
  init: RequestInit | undefined,
  label: string,
): Promise<JsonRecord> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(
      Number(env("BACKEND_TOOLCALL_HTTP_TIMEOUT_MS", "30000")),
    ),
  });
  const text = await response.text();
  let payload: JsonRecord = {};
  try {
    payload = text ? (JSON.parse(text) as JsonRecord) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    throw new Error(
      `${label} failed: HTTP ${response.status}; body=${redactDiagnostic(JSON.stringify(payload).slice(0, 500))}`,
    );
  }
  return payload;
}

async function poll<T>(
  label: string,
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  timeoutMs: number,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastValue: T | undefined;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      lastValue = await read();
      if (accept(lastValue)) return lastValue;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(
    `${label} timed out after ${timeoutMs}ms. Last value=${JSON.stringify(lastValue)} Last error=${lastError instanceof Error ? lastError.message : String(lastError || "")}`,
  );
}

async function postChat({
  backendUrl,
  messages,
  mcpServers,
  sessionId,
  buildRequestId,
  traceId,
  experimentId,
  ragEnabled,
  dynamicSkillSelection,
  skillSelectionVariant,
  variantId,
  provider,
  model,
  memoryScope,
}: {
  backendUrl: string;
  messages: Array<{ role: string; content: string }>;
  mcpServers: string[];
  sessionId: string;
  buildRequestId: string;
  traceId: string;
  experimentId: string;
  ragEnabled?: boolean;
  dynamicSkillSelection?: boolean;
  skillSelectionVariant?: string;
  variantId?: string;
  provider: string;
  model: string;
  memoryScope: string;
}): Promise<{
  response: Response;
  events: SseEvent[];
  content: string;
  errors: SseEvent[];
}> {
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
      ragEnabled,
      dynamicSkillSelection,
      skillSelectionVariant,
      variantId,
      userId: "backend_toolcall_matrix",
      workspaceId: "backend_toolcall_matrix",
      email: "backend-toolcall-matrix@local",
      memoryScope,
    }),
  });
  const parsed = await readSse(response);
  return { response, ...parsed };
}

function extractBuildComplete(events: SseEvent[]): SseEvent {
  return events.find((event) => event.type === "mcp_build_complete") || {};
}

function extractMcpServerUrl(payload: SseEvent = {}): string {
  if (typeof payload.mcpServerUrl === "string" && payload.mcpServerUrl)
    return payload.mcpServerUrl;
  if (typeof payload.publicUrl === "string" && payload.publicUrl)
    return payload.publicUrl;
  const config = payload.config || payload.claudeConfig || {};
  const servers = config.mcpServers || {};
  for (const serverConfig of Object.values(servers)) {
    const args = Array.isArray(serverConfig.args) ? serverConfig.args : [];
    const url = args.find(
      (value) => typeof value === "string" && /^https?:\/\//.test(value),
    );
    if (url) return String(url);
  }
  return "";
}

async function waitForManagerStatus(
  managerUrl: string,
  serverId: string,
  buildRequestId: string,
): Promise<JsonRecord> {
  const key = serverId || buildRequestId;
  if (!key)
    throw new Error(
      "Cannot poll manager status without serverId or buildRequestId.",
    );
  return poll(
    "mcp manager running status",
    async () =>
      fetchJson(
        `${baseUrl(managerUrl)}/api/mcp/${key}/status`,
        undefined,
        "mcp manager status",
      ),
    (payload) => payload.status === "running",
    Number(env("BACKEND_TOOLCALL_MANAGER_TIMEOUT_MS", "120000")),
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
      body: JSON.stringify({
        url: mcpUrl,
        traceId,
        experimentId,
        sessionId,
        buildRequestId,
        serverId,
      }),
    },
    "mcp metadata",
  );
  return payload as MetadataResponse;
}

function localEventsPath(eventsPath: string): string {
  if (eventsPath.startsWith("/repo/"))
    return path.resolve(root, eventsPath.slice("/repo/".length));
  return path.resolve(root, eventsPath);
}

function readJsonlEvents(
  filePath: string,
  buildRequestId: string,
): ResearchEvent[] {
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
    .filter(
      (event): event is ResearchEvent =>
        Boolean(event) && event.build_request_id === buildRequestId,
    );
}

async function readMongoEvents(
  buildRequestId: string,
): Promise<ResearchEvent[]> {
  const mongoUri = env(
    "BACKEND_TOOLCALL_MONGO_URI",
    env("E2E_MONGO_URI", env("MONGO_URI", "mongodb://localhost:27017")),
  );
  const dbName = env("RESEARCH_EVENTS_DB", env("MONGO_DB_NAME", "docker"));
  const collectionName = env("RESEARCH_EVENTS_COLLECTION", "research_events");
  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 2000 });
  try {
    await client.connect();
    return await client
      .db(dbName)
      .collection<ResearchEvent>(collectionName)
      .find({ build_request_id: buildRequestId })
      .toArray();
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function readResearchEvents(
  buildRequestId: string,
  eventsPath: string,
): Promise<ResearchEvent[]> {
  try {
    const mongoEvents = await readMongoEvents(buildRequestId);
    if (mongoEvents.length > 0) return mongoEvents;
  } catch {
    // JSONL fallback keeps local runs useful when Mongo is not exposed on localhost.
  }
  return readJsonlEvents(localEventsPath(eventsPath), buildRequestId);
}

async function waitForInvocationEvent(
  buildRequestId: string,
  sessionId: string,
  eventsPath: string,
): Promise<ResearchEvent> {
  const event = await poll(
    "mcp_tool_invocation_completed research event",
    async () => {
      const events = await readResearchEvents(buildRequestId, eventsPath);
      return [...events]
        .reverse()
        .find(
          (item) =>
            item.event_name === "mcp_tool_invocation_completed" &&
            item.session_id === sessionId,
        );
    },
    (item) => Boolean(item),
    Number(env("BACKEND_TOOLCALL_EVENT_TIMEOUT_MS", "120000")),
  );
  if (!event)
    throw new Error("mcp_tool_invocation_completed was not persisted.");
  return event;
}

function numericMetric(metrics: JsonRecord | undefined, key: string): number {
  const value = metrics?.[key];
  return typeof value === "number" ? value : Number(value || 0);
}

function stringArrayMetric(
  metrics: JsonRecord | undefined,
  key: string,
): string[] {
  const value = metrics?.[key];
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function toolText(tool: MetadataTool): string {
  return `${tool.name || ""} ${tool.description || ""}`.toLowerCase();
}

function matchedSkipRule(
  item: MatrixCase,
  tool: MetadataTool,
): SkipRule | undefined {
  const text = toolText(tool);
  return (item.skipRules || []).find((rule) =>
    rule.match.some((term) => text.includes(term.toLowerCase())),
  );
}

function matchedProbe(
  item: MatrixCase,
  tool: MetadataTool,
): ProbeDefinition | undefined {
  const text = toolText(tool);
  return item.probes.find((probe) =>
    probe.match.some((term) => text.includes(term.toLowerCase())),
  );
}

function skippedOutcome(
  tool: MetadataTool,
  index: number,
  errorCode: string,
  diagnostic: string,
): ToolOutcome {
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
  item,
  backendUrl,
  mcpUrl,
  tool,
  index,
  buildRequestId,
  traceId,
  experimentId,
  variant,
  baseSessionId,
  provider,
  model,
  eventsPath,
}: {
  item: MatrixCase;
  backendUrl: string;
  mcpUrl: string;
  tool: MetadataTool;
  index: number;
  buildRequestId: string;
  traceId: string;
  experimentId: string;
  variant: Variant;
  baseSessionId: string;
  provider: string;
  model: string;
  eventsPath: string;
}): Promise<ToolOutcome> {
  const toolName = safeText(tool.name, 120);
  if (!toolName || toolName === "unknown") {
    return skippedOutcome(
      tool,
      index,
      "missing_tool_name",
      "Metadata tool did not include a usable name.",
    );
  }

  const skip = matchedSkipRule(item, tool);
  if (skip) {
    return skippedOutcome(tool, index, skip.errorCode, skip.diagnostic);
  }

  const probe = matchedProbe(item, tool);
  if (!probe) {
    return skippedOutcome(
      tool,
      index,
      "no_safe_probe_match",
      "No safe live probe matched this generated tool.",
    );
  }

  const toolSessionId = `${baseSessionId}-tool-${index + 1}`;
  const prompt = probe.prompt.replaceAll("{toolName}", toolName);
  try {
    const followUp = await postChat({
      backendUrl,
      messages: [{ role: "user", content: prompt }],
      mcpServers: [mcpUrl],
      sessionId: toolSessionId,
      buildRequestId,
      traceId,
      experimentId,
      ragEnabled: variant.ragEnabled === "true",
      dynamicSkillSelection: variant.dynamicSkillSelection === "true",
      skillSelectionVariant: variant.skillSelectionVariant,
      variantId: variant.id,
      provider,
      model,
      memoryScope: `experiment:${experimentId}|case:${item.id}|tool:${toolName}`,
    });

    if (!followUp.response.ok) {
      return {
        tool_name: toolName,
        index,
        probe_id: probe.id,
        operation: probe.operation,
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
        probe_id: probe.id,
        operation: probe.operation,
        status: "failed",
        error_code: "chat_sse_error",
        invocation_count: 0,
        result_count: 0,
        response_length: followUp.content.length,
        response_hash: followUp.content ? contentHash(followUp.content) : "",
        diagnostic: redactDiagnostic(
          JSON.stringify(followUp.errors.slice(0, 2)),
        ),
      };
    }

    const invocationEvent = await waitForInvocationEvent(
      buildRequestId,
      toolSessionId,
      eventsPath,
    );
    const metrics = invocationEvent.metrics || {};
    const invocationCount = numericMetric(metrics, "mcp_tool_invocation_count");
    const resultCount = numericMetric(metrics, "mcp_tool_result_count");
    const invokedToolNames = stringArrayMetric(metrics, "invoked_tool_names");
    const resultToolNames = stringArrayMetric(metrics, "result_tool_names");
    const expectedInvoked =
      invokedToolNames.includes(toolName) || resultToolNames.includes(toolName);
    const eventSucceeded =
      invocationEvent.status === "success" && metrics.mcp_tool_success === true;
    const status: ToolOutcomeStatus =
      eventSucceeded && expectedInvoked ? "success" : "failed";

    return {
      tool_name: toolName,
      index,
      probe_id: probe.id,
      operation: probe.operation,
      status,
      error_code:
        status === "success"
          ? ""
          : !expectedInvoked
            ? "expected_tool_not_invoked"
            : String(
                invocationEvent.error_code || "mcp_tool_invocation_failed",
              ),
      invocation_count: invocationCount,
      result_count: resultCount,
      response_length: followUp.content.length,
      response_hash: followUp.content ? contentHash(followUp.content) : "",
      diagnostic:
        status === "success"
          ? ""
          : redactDiagnostic(
              `invoked=${invokedToolNames.join(",") || "none"} result=${resultToolNames.join(",") || "none"}`,
            ),
    };
  } catch (error) {
    return {
      tool_name: toolName,
      index,
      probe_id: probe.id,
      operation: probe.operation,
      status: "failed",
      error_code: "tool_validation_error",
      invocation_count: 0,
      result_count: 0,
      response_length: 0,
      response_hash: "",
      diagnostic: redactDiagnostic(
        error instanceof Error ? error.message : String(error),
      ),
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
  variant,
  provider,
  model,
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
  variant: Variant;
  provider: string;
  model: string;
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
        provider,
        model,
        durationMs,
        traceId,
        experimentId,
        sessionId,
        buildRequestId,
        serverId,
        ragEnabled: variant.ragEnabled === "true",
        dynamicSkillSelection: variant.dynamicSkillSelection === "true",
        skillSelectionVariant: variant.skillSelectionVariant,
        variantId: variant.id,
      }),
    },
    "mcp tool outcomes",
  );
  if (response.persisted === false) {
    throw new Error(
      "mcp_tool_outcomes_completed was not persisted. Check RESEARCH_METRICS_ENABLED.",
    );
  }
}

function countOutcomes(outcomes: ToolOutcome[]): JsonRecord {
  const failedToolNames = outcomes
    .filter((item) => item.status === "failed")
    .map((item) => item.tool_name);
  const skippedToolNames = outcomes
    .filter((item) => item.status === "skipped")
    .map((item) => item.tool_name);
  const success = outcomes.filter((item) => item.status === "success").length;
  const failed = failedToolNames.length;
  const skipped = skippedToolNames.length;
  const total = outcomes.length;
  const attempted = success + failed;
  return {
    totalToolCount: total,
    attemptedToolCount: attempted,
    successToolCount: success,
    failedToolCount: failed,
    skippedToolCount: skipped,
    toolCallPassRate: attempted
      ? Number((success / attempted).toFixed(4))
      : null,
    skippedCoverage: total ? Number((skipped / total).toFixed(4)) : null,
    failedToolNames,
    skippedToolNames,
  };
}

function summarizeEstimatedUsage(events: ResearchEvent[]): JsonRecord {
  const metrics = events.map((event) => event.metrics || {});
  const sum = (keys: string[]) =>
    metrics.reduce((total, item) => {
      for (const key of keys) {
        const value = item[key];
        if (typeof value === "number" && Number.isFinite(value))
          return total + value;
        if (typeof value === "string" && Number.isFinite(Number(value)))
          return total + Number(value);
      }
      return total;
    }, 0);
  return {
    estimatedPromptTokens: sum(["prompt_token_estimate", "prompt_tokens"]),
    estimatedCompletionTokens: sum([
      "completion_token_estimate",
      "completion_tokens",
    ]),
    llmCallCount: sum(["llm_calls", "llm_call_count"]),
    selectedSkillCount: sum(["selected_skill_count", "skills_selected_count"]),
    selectedSkillTokens: sum([
      "skill_total_tokens",
      "selected_skill_tokens",
      "tokenCost",
    ]),
  };
}

function variantEnv(variant: Variant, options: Options): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DYNAMIC_SKILL_SELECTION: variant.dynamicSkillSelection,
    SKILL_SELECTION_VARIANT: variant.skillSelectionVariant,
    RAG_ENABLED: variant.ragEnabled,
    RESEARCH_METRICS_ENABLED: "true",
    RESEARCH_EXPERIMENT_ID: options.experimentId,
    NEXT_PUBLIC_RESEARCH_EXPERIMENT_ID: options.experimentId,
    VARIANT_ID: variant.id,
    RESEARCH_EVENTS_DB: env("RESEARCH_EVENTS_DB", "docker"),
    RESEARCH_EVENTS_COLLECTION: env(
      "RESEARCH_EVENTS_COLLECTION",
      "research_events",
    ),
    RESEARCH_EVENTS_JSONL_PATH: options.eventsPath,
    RESEARCH_EVENTS_JSONL_MIRROR: "true",
  };
}

async function waitForStack(options: Options): Promise<void> {
  await poll(
    "chatbot backend health",
    async () =>
      fetchJson(
        `${baseUrl(options.backendUrl)}/health`,
        undefined,
        "backend health",
      ),
    () => true,
    Number(env("BACKEND_TOOLCALL_STACK_TIMEOUT_MS", "120000")),
  );
  await poll(
    "mcp manager stats",
    async () =>
      fetchJson(
        `${baseUrl(options.managerUrl)}/api/mcp/stats`,
        undefined,
        "mcp manager stats",
      ),
    () => true,
    Number(env("BACKEND_TOOLCALL_STACK_TIMEOUT_MS", "120000")),
  );
}

async function applyVariantEnvironment(
  variant: Variant,
  options: Options,
): Promise<void> {
  const effectiveEnv = variantEnv(variant, options);
  for (const [key, value] of Object.entries(effectiveEnv)) {
    if (
      [
        "DYNAMIC_SKILL_SELECTION",
        "SKILL_SELECTION_VARIANT",
        "RAG_ENABLED",
        "VARIANT_ID",
        "RESEARCH_METRICS_ENABLED",
        "RESEARCH_EXPERIMENT_ID",
        "NEXT_PUBLIC_RESEARCH_EXPERIMENT_ID",
        "RESEARCH_EVENTS_JSONL_PATH",
        "RESEARCH_EVENTS_JSONL_MIRROR",
      ].includes(key)
    ) {
      process.env[key] = value || "";
    }
  }
  ensureDir(path.dirname(localEventsPath(options.eventsPath)));
  if (!options.restartStack) return;
  console.info(
    `[backend-toolcall-matrix] restarting compose stack for variant=${variant.id}`,
  );
  execSync("docker compose up -d --build", {
    cwd: root,
    stdio: "inherit",
    env: effectiveEnv,
  });
  await waitForStack(options);
}

async function runOne(
  item: MatrixCase,
  variant: Variant,
  repeatIndex: number,
  options: Options,
): Promise<JsonRecord> {
  const traceId = randomUUID();
  const buildRequestId = `${options.experimentId}-${variant.id}-${item.id}-r${repeatIndex}-${traceId.slice(0, 8)}`;
  const sessionId = `session-${options.experimentId}-${variant.id}-${item.id}-r${repeatIndex}`;
  const startedAt = Date.now();
  const baseResult: JsonRecord = {
    type: "benchmark_result",
    benchmarkType: "backend_toolcall_matrix",
    timestamp: new Date().toISOString(),
    experimentId: options.experimentId,
    caseId: item.id,
    itemId: item.id,
    apiType: item.apiType,
    caseTitle: item.title,
    baseUrl: item.baseUrl,
    inputPath: item.inputPath || "",
    authInfoPath: item.authInfoPath || "",
    inputDocHash: item.inputDocHash || "",
    authInfoHash: item.authInfoHash || "",
    variantId: variant.id,
    mode: "backend-api-toolcall",
    skillSelectionMode: variant.skillSelectionMode,
    selectionVariant: variant.skillSelectionVariant,
    dynamicSkillSelection: variant.dynamicSkillSelection,
    ragEnabled: variant.ragEnabled,
    metaclawEnabled: env("METACLAW_ENABLED", ""),
    repeatIndex,
    provider: options.provider,
    model: options.model,
    gitCommit: gitCommit(),
    traceId,
    sessionId,
    buildRequestId,
    ok: false,
  };

  try {
    const build = await postChat({
      backendUrl: options.backendUrl,
      messages: [{ role: "user", content: item.prompt || "" }],
      mcpServers: [],
      sessionId,
      buildRequestId,
      traceId,
      experimentId: options.experimentId,
      ragEnabled: variant.ragEnabled === "true",
      dynamicSkillSelection: variant.dynamicSkillSelection === "true",
      skillSelectionVariant: variant.skillSelectionVariant,
      variantId: variant.id,
      provider: options.provider,
      model: options.model,
      memoryScope: `experiment:${options.experimentId}|case:${item.id}|variant:${variant.id}`,
    });
    const buildComplete = extractBuildComplete(build.events);
    const serverId = String(buildComplete.serverId || "");
    let mcpUrl = extractMcpServerUrl(buildComplete);
    const buildStatus = String(buildComplete.status || "");

    if (!build.response.ok || build.errors.length > 0) {
      throw new Error(
        `Build chat failed: HTTP ${build.response.status}; errors=${JSON.stringify(build.errors)}`,
      );
    }

    const managerStatus = await waitForManagerStatus(
      options.managerUrl,
      serverId,
      buildRequestId,
    );
    if (!mcpUrl) {
      mcpUrl =
        extractMcpServerUrl(managerStatus as SseEvent) ||
        String(managerStatus.publicUrl || "");
    }
    if (!mcpUrl)
      throw new Error(
        `Could not extract generated MCP URL. Build event=${JSON.stringify(buildComplete)} Manager status=${JSON.stringify(managerStatus)}`,
      );

    const metadataStartedAt = Date.now();
    const metadata = await checkMetadata({
      backendUrl: options.backendUrl,
      mcpUrl,
      traceId,
      experimentId: options.experimentId,
      sessionId,
      buildRequestId,
      serverId,
    });
    const tools = Array.isArray(metadata.tools) ? metadata.tools : [];
    const runtimeMetadataOk =
      metadata.status === "connected" && tools.length > 0;
    const metadataDurationMs = Date.now() - metadataStartedAt;
    if (!runtimeMetadataOk) {
      throw new Error(
        `MCP metadata did not connect with tools: ${JSON.stringify(metadata)}`,
      );
    }

    const outcomeStartedAt = Date.now();
    const outcomes: ToolOutcome[] = [];
    for (const [index, tool] of tools.entries()) {
      outcomes.push(
        await validateTool({
          item,
          backendUrl: options.backendUrl,
          mcpUrl,
          tool,
          index,
          buildRequestId,
          traceId,
          experimentId: options.experimentId,
          variant,
          baseSessionId: sessionId,
          provider: options.provider,
          model: options.model,
          eventsPath: options.eventsPath,
        }),
      );
    }
    await recordToolOutcomes({
      backendUrl: options.backendUrl,
      mcpUrl,
      outcomes,
      traceId,
      experimentId: options.experimentId,
      sessionId,
      buildRequestId,
      serverId,
      variant,
      provider: options.provider,
      model: options.model,
      durationMs: Date.now() - outcomeStartedAt,
    });

    const events = await readResearchEvents(buildRequestId, options.eventsPath);
    const counts = countOutcomes(outcomes);
    return {
      ...baseResult,
      statusCode: build.response.status,
      ok: true,
      serverId,
      mcpUrl: redactUrl(mcpUrl),
      buildStatus,
      durationMs: Date.now() - startedAt,
      buildDurationMs: Date.now() - startedAt,
      runtimeMetadataChecked: true,
      runtimeMetadataOk,
      runtimeStatusCode: "connected",
      runtimeMetadataDurationMs: metadataDurationMs,
      runtimeToolCount: tools.length,
      outcomeDurationMs: Date.now() - outcomeStartedAt,
      ...counts,
      estimatedUsage: summarizeEstimatedUsage(events),
      eventCount: events.length,
      outcomes,
    };
  } catch (error) {
    return {
      ...baseResult,
      durationMs: Date.now() - startedAt,
      runtimeMetadataChecked: false,
      runtimeMetadataOk: false,
      runtimeToolCount: 0,
      totalToolCount: 0,
      attemptedToolCount: 0,
      successToolCount: 0,
      failedToolCount: 0,
      skippedToolCount: 0,
      errorCode: "benchmark_run_error",
      diagnostic: redactDiagnostic(
        error instanceof Error ? error.message : String(error),
      ),
    };
  }
}

function parseOptions(): Options {
  const experimentId = arg(
    "experiment-id",
    `backend-toolcall-matrix-${new Date().toISOString().slice(0, 10)}`,
  );
  const eventsPath = arg(
    "events",
    env(
      "RESEARCH_EVENTS_JSONL_PATH",
      "/repo/reports/backend-toolcall-matrix/research-events.jsonl",
    ),
  );
  const dryRun = flag("dry-run", false) || flag("validate-only", false);
  return {
    datasetPath: path.resolve(
      root,
      arg(
        "dataset",
        "experiments/research-metrics/backend_toolcall_matrix_dataset.json",
      ),
    ),
    outputPath: path.resolve(
      root,
      arg(
        "output",
        "experiments/research-metrics/backend-toolcall-matrix-runs.jsonl",
      ),
    ),
    eventsPath,
    experimentId,
    variants: csvArg("variants"),
    cases: csvArg("cases"),
    limit: Number(arg("limit", "0")),
    repeats: Number(arg("repeats", "1")),
    provider: arg("provider", env("BACKEND_TOOLCALL_PROVIDER", "gemini")),
    model: arg("model", env("BACKEND_TOOLCALL_MODEL", "gemini-2.5-flash")),
    backendUrl: arg(
      "backend-url",
      env("E2E_BACKEND_URL", "http://localhost:8000"),
    ),
    managerUrl: arg(
      "manager-url",
      env("E2E_MCP_MANAGER_URL", "http://localhost:8080"),
    ),
    dryRun,
    restartStack: flag("restart-stack", !dryRun),
  };
}

function selectCases(dataset: MatrixCase[], options: Options): MatrixCase[] {
  let selected =
    options.cases.length > 0
      ? dataset.filter((item) => options.cases.includes(item.id))
      : dataset;
  if (options.limit > 0) selected = selected.slice(0, options.limit);
  return selected;
}

function selectVariants(options: Options): Variant[] {
  return options.variants.length > 0
    ? variants.filter((item) => options.variants.includes(item.id))
    : variants;
}

function validateDataset(dataset: MatrixCase[]): void {
  if (!Array.isArray(dataset) || dataset.length === 0)
    throw new Error("Dataset must contain at least one case.");
  for (const item of dataset) {
    if (
      !item.id ||
      !item.apiType ||
      !item.baseUrl ||
      (!item.prompt && !item.inputPath)
    )
      throw new Error(
        `Dataset case is missing required fields: ${JSON.stringify(item)}`,
      );
    if (!/^https?:\/\//.test(item.baseUrl))
      throw new Error(
        `Dataset case ${item.id} has invalid baseUrl: ${item.baseUrl}`,
      );
    if (item.inputPath && !fs.existsSync(path.resolve(root, item.inputPath)))
      throw new Error(
        `Dataset case ${item.id} inputPath does not exist: ${item.inputPath}`,
      );
    if (
      item.authInfoPath &&
      !fs.existsSync(path.resolve(root, item.authInfoPath))
    )
      throw new Error(
        `Dataset case ${item.id} authInfoPath does not exist: ${item.authInfoPath}`,
      );
    if (!Array.isArray(item.probes))
      throw new Error(`Dataset case ${item.id} probes must be an array.`);
    if (
      item.probes.length === 0 &&
      (!Array.isArray(item.skipRules) || item.skipRules.length === 0)
    ) {
      throw new Error(
        `Dataset case ${item.id} must define at least one safe probe or explicit skip rule.`,
      );
    }
    for (const probe of item.probes) {
      if (
        !probe.id ||
        !probe.operation ||
        !Array.isArray(probe.match) ||
        probe.match.length === 0 ||
        !probe.prompt.includes("{toolName}")
      ) {
        throw new Error(
          `Dataset case ${item.id} has invalid probe: ${JSON.stringify(probe)}`,
        );
      }
    }
  }
}

async function main(): Promise<void> {
  const options = parseOptions();
  const dataset = materializeDataset(
    readJson<MatrixCase[]>(options.datasetPath),
  );
  validateDataset(dataset);
  const selectedCases = selectCases(dataset, options);
  const selectedVariants = selectVariants(options);
  if (selectedCases.length === 0)
    throw new Error("No benchmark cases selected.");
  if (selectedVariants.length === 0)
    throw new Error("No benchmark variants selected.");

  const plan = {
    type: "backend_toolcall_matrix_plan",
    timestamp: new Date().toISOString(),
    experimentId: options.experimentId,
    datasetPath: options.datasetPath,
    outputPath: options.outputPath,
    eventsPath: options.eventsPath,
    localEventsPath: localEventsPath(options.eventsPath),
    repeats: options.repeats,
    provider: options.provider,
    model: options.model,
    restartStack: options.restartStack,
    caseIds: selectedCases.map((item) => item.id),
    caseInputs: selectedCases.map((item) => ({
      caseId: item.id,
      inputPath: item.inputPath || "",
      authInfoPath: item.authInfoPath || "",
      inputDocHash: item.inputDocHash || "",
      authInfoHash: item.authInfoHash || "",
    })),
    variantIds: selectedVariants.map((item) => item.id),
    totalRuns: selectedCases.length * selectedVariants.length * options.repeats,
  };
  console.info("[backend-toolcall-matrix-plan]", JSON.stringify(plan));
  if (options.dryRun) return;

  ensureDir(path.dirname(options.outputPath));
  appendJsonl(options.outputPath, { ...plan, gitCommit: gitCommit() });

  for (const variant of selectedVariants) {
    await applyVariantEnvironment(variant, options);
    for (const item of selectedCases) {
      for (let repeatIndex = 1; repeatIndex <= options.repeats; repeatIndex++) {
        const result = await runOne(item, variant, repeatIndex, options);
        appendJsonl(options.outputPath, result);
        console.info(
          `[backend-toolcall-matrix-result] variant=${variant.id} case=${item.id} r=${repeatIndex} ok=${result.ok} passRate=${result.toolCallPassRate ?? "n/a"} server=${result.serverId || ""}`,
        );
      }
    }
  }
}

main().catch((error) => {
  console.error(
    "[backend-toolcall-matrix-error]",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
