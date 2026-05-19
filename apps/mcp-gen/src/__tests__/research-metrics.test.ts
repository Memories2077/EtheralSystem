import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("mongodb", () => {
  class MongoClient {
    constructor(_uri: string, _options?: unknown) {}
    async connect() {}
    db() {
      return {
        collection() {
          return {
            async insertOne() {
              throw new Error("mongo unavailable in unit test");
            },
          };
        },
      };
    }
  }
  return { MongoClient };
});

import {
  buildResearchEvent,
  normalizeResearchContext,
  recordResearchEvent,
  redactSensitive,
} from "../utils/research-metrics.ts";

const originalEnv = { ...process.env };

function tempJsonlPath() {
  return path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "etheral-research-metrics-")),
    "events.jsonl",
  );
}

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

describe("research metrics helper", () => {
  it("redacts secrets and raw prompt fields without redacting safe hashes", () => {
    const redacted = redactSensitive({
      apiKey: "secret-key",
      authorization: "Bearer secret",
      input_hash: "safe-hash",
      nested: {
        rawUserContent: "private prompt",
        promptText: "private prompt",
      },
    });

    expect(redacted.apiKey).toBe("[REDACTED]");
    expect(redacted.authorization).toBe("[REDACTED]");
    expect(redacted.input_hash).toBe("safe-hash");
    expect(redacted.nested.rawUserContent).toBe("[REDACTED]");
    expect(redacted.nested.promptText).toBe("[REDACTED]");
  });

  it("normalizes mixed camelCase and snake_case research context", () => {
    const context = normalizeResearchContext({
      traceId: "trace-123",
      experiment_id: "paper-mvp",
      sessionId: "session-123",
      build_request_id: "build-123",
      serverId: "server-123",
    });

    expect(context).toEqual({
      trace_id: "trace-123",
      experiment_id: "paper-mvp",
      session_id: "session-123",
      build_request_id: "build-123",
      server_id: "server-123",
      rag_enabled: "",
      dynamic_skill_selection: "",
      skill_selection_variant: "",
      variant_id: "",
    });
  });

  it("builds a correlated event shape", () => {
    const event = buildResearchEvent({
      service: "mcp-gen",
      stage: "runtime",
      eventName: "mcp_status_updated",
      context: {
        traceId: "trace-123",
        experimentId: "paper-mvp",
        sessionId: "session-123",
        buildRequestId: "build-123",
        serverId: "server-123",
        ragEnabled: "false",
        dynamicSkillSelection: "false",
        skillSelectionVariant: "static",
        variantId: "static-rag-off",
      },
      metrics: { mcpToolCount: 4 },
    });

    expect(event.trace_id).toBe("trace-123");
    expect(event.experiment_id).toBe("paper-mvp");
    expect(event.session_id).toBe("session-123");
    expect(event.build_request_id).toBe("build-123");
    expect(event.server_id).toBe("server-123");
    expect(event.rag_enabled).toBe("false");
    expect(event.dynamic_skill_selection).toBe("false");
    expect(event.skill_selection_variant).toBe("static");
    expect(event.variant_id).toBe("static-rag-off");
    expect(event.metrics).toEqual({ mcpToolCount: 4 });
  });

  it("returns null and does not persist when disabled", async () => {
    const outputPath = tempJsonlPath();
    process.env.RESEARCH_METRICS_ENABLED = "false";
    process.env.RESEARCH_EVENTS_JSONL_PATH = outputPath;

    const event = await recordResearchEvent({
      service: "mcp-gen",
      stage: "build",
      eventName: "mcp_create_completed",
    });

    expect(event).toBeNull();
    expect(fs.existsSync(outputPath)).toBe(false);
  });

  it("writes a correlated JSONL fallback event when enabled", async () => {
    const outputPath = tempJsonlPath();
    process.env.RESEARCH_METRICS_ENABLED = "true";
    process.env.RESEARCH_EVENTS_JSONL_PATH = outputPath;

    const event = await recordResearchEvent({
      service: "mcp-gen",
      stage: "build",
      eventName: "mcp_create_completed",
      context: { traceId: "trace-123", experimentId: "paper-mvp" },
      metrics: { token: "secret", buildTotalLatencyMs: 12 },
    });

    expect(event).not.toBeNull();
    const saved = JSON.parse(fs.readFileSync(outputPath, "utf8").trim());
    expect(saved.trace_id).toBe("trace-123");
    expect(saved.experiment_id).toBe("paper-mvp");
    expect(saved.metrics.token).toBe("[REDACTED]");
    expect(saved.metrics.buildTotalLatencyMs).toBe(12);
  });
});
