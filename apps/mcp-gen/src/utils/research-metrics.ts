import { createHash, randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { MongoClient } from "mongodb";

export type ResearchEventStatus = "success" | "failure" | "timeout" | "skipped";

export interface ResearchContext {
  traceId?: string;
  trace_id?: string;
  experimentId?: string;
  experiment_id?: string;
  sessionId?: string;
  session_id?: string;
  buildRequestId?: string;
  build_request_id?: string;
  serverId?: string;
  server_id?: string;
  ragEnabled?: string;
  rag_enabled?: string;
  dynamicSkillSelection?: string;
  dynamic_skill_selection?: string;
  skillSelectionVariant?: string;
  skill_selection_variant?: string;
  variantId?: string;
  variant_id?: string;
}

export interface ResearchEventInput {
  context?: ResearchContext;
  service: string;
  stage: string;
  eventName: string;
  status?: ResearchEventStatus;
  durationMs?: number;
  errorCode?: string;
  provider?: string;
  model?: string;
  metrics?: Record<string, unknown>;
  tags?: Record<string, unknown>;
}

const SENSITIVE_KEY_PARTS = [
  "api_key",
  "apikey",
  "authorization",
  "cookie",
  "jwt",
  "password",
  "secret",
  "token",
];

const SENSITIVE_KEY_NAMES = [
  "input_content",
  "prompt_text",
  "raw_api_doc",
  "raw_input",
  "raw_user_content",
  "request_body",
  "user_content",
];

let mongoClient: MongoClient | null = null;

export function researchMetricsEnabled(): boolean {
  return process.env.RESEARCH_METRICS_ENABLED === "true";
}

export function monotonicMs(): number {
  return Math.round(performance.now());
}

export function durationSinceMs(startMs: number): number {
  return Math.max(0, monotonicMs() - startMs);
}

export function contentHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function isSensitiveKey(key: string): boolean {
  const lowered = key.toLowerCase().replaceAll("-", "_");
  const compact = lowered.replaceAll("_", "");
  return (
    SENSITIVE_KEY_NAMES.includes(lowered) ||
    SENSITIVE_KEY_NAMES.map((name) => name.replaceAll("_", "")).includes(compact) ||
    SENSITIVE_KEY_PARTS.some((part) => lowered.includes(part)) ||
    SENSITIVE_KEY_PARTS.some((part) => compact.includes(part.replaceAll("_", "")))
  );
}

export function redactSensitive<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item)) as T;
  }
  if (value && typeof value === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      redacted[key] = isSensitiveKey(key) ? "[REDACTED]" : redactSensitive(item);
    }
    return redacted as T;
  }
  return value;
}

export function normalizeResearchContext(context: ResearchContext = {}) {
  const traceId = String(context.traceId || context.trace_id || randomUUID()).trim();
  const experimentId = String(
    context.experimentId ||
      context.experiment_id ||
      process.env.RESEARCH_EXPERIMENT_ID ||
      "local-dev",
  ).trim();
  return {
    trace_id: traceId,
    experiment_id: experimentId,
    session_id: String(context.sessionId || context.session_id || "").trim(),
    build_request_id: String(context.buildRequestId || context.build_request_id || "").trim(),
    server_id: String(context.serverId || context.server_id || "").trim(),
    rag_enabled: String(context.ragEnabled || context.rag_enabled || "").trim(),
    dynamic_skill_selection: String(context.dynamicSkillSelection || context.dynamic_skill_selection || "").trim(),
    skill_selection_variant: String(context.skillSelectionVariant || context.skill_selection_variant || "").trim(),
    variant_id: String(context.variantId || context.variant_id || "").trim(),
  };
}

export function buildResearchEvent(input: ResearchEventInput) {
  const context = normalizeResearchContext(input.context);
  return redactSensitive({
    timestamp: new Date().toISOString(),
    ...context,
    service: input.service,
    stage: input.stage,
    event_name: input.eventName,
    status: input.status || "success",
    duration_ms: input.durationMs,
    error_code: input.errorCode,
    provider: input.provider,
    model: input.model,
    metrics: input.metrics || {},
    tags: input.tags || {},
  });
}

function jsonlPath(): string {
  return process.env.RESEARCH_EVENTS_JSONL_PATH || "/tmp/etheral-research-events.jsonl";
}

async function writeJsonl(event: Record<string, unknown>) {
  const outputPath = jsonlPath();
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.appendFile(outputPath, `${JSON.stringify(event)}\n`, "utf8");
}

async function persistToMongo(event: Record<string, unknown>): Promise<boolean> {
  try {
    if (!mongoClient) {
      mongoClient = new MongoClient(process.env.MONGO_URI || "mongodb://localhost:27017", {
        serverSelectionTimeoutMS: 1000,
      });
      await mongoClient.connect();
    }
    const dbName = process.env.RESEARCH_EVENTS_DB || process.env.MONGO_DB_NAME || "docker";
    const collectionName = process.env.RESEARCH_EVENTS_COLLECTION || "research_events";
    await mongoClient.db(dbName).collection(collectionName).insertOne(event);
    return true;
  } catch {
    return false;
  }
}

export async function recordResearchEvent(input: ResearchEventInput) {
  if (!researchMetricsEnabled()) return null;
  const event = buildResearchEvent(input);
  const persisted = await persistToMongo(event);
  if (!persisted || process.env.RESEARCH_EVENTS_JSONL_MIRROR === "true") {
    try {
      await writeJsonl(event);
    } catch {
      // Metrics must never break runtime behavior.
    }
  }
  return event;
}
