import { afterEach, describe, expect, it } from "bun:test";
import {
  buildChatResearchContext,
  buildMcpMetadataRequestPayload,
  DEFAULT_RESEARCH_EXPERIMENT_ID,
} from "../research-context.ts";

const originalExperimentId = process.env.NEXT_PUBLIC_RESEARCH_EXPERIMENT_ID;

afterEach(() => {
  if (originalExperimentId === undefined) {
    delete process.env.NEXT_PUBLIC_RESEARCH_EXPERIMENT_ID;
  } else {
    process.env.NEXT_PUBLIC_RESEARCH_EXPERIMENT_ID = originalExperimentId;
  }
});

describe("research context helpers", () => {
  it("builds a stable chat correlation context from session and build ids", () => {
    process.env.NEXT_PUBLIC_RESEARCH_EXPERIMENT_ID = "jsonplaceholder-e2e";

    const context = buildChatResearchContext({
      sessionId: "chat-123",
      buildRequestId: "build-123",
    });

    expect(context).toEqual({
      traceId: "build-123",
      experimentId: "jsonplaceholder-e2e",
      sessionId: "chat-123",
      buildRequestId: "build-123",
    });
  });

  it("falls back to the default experiment id", () => {
    delete process.env.NEXT_PUBLIC_RESEARCH_EXPERIMENT_ID;

    const context = buildChatResearchContext({
      sessionId: "chat-123",
      buildRequestId: "build-123",
    });

    expect(context.experimentId).toBe(DEFAULT_RESEARCH_EXPERIMENT_ID);
  });

  it("includes correlation fields in generated MCP metadata requests", () => {
    const payload = buildMcpMetadataRequestPayload({
      url: "http://localhost:8081/mcp/server-123",
      context: {
        traceId: "trace-123",
        experimentId: "experiment-123",
        sessionId: "session-123",
        buildRequestId: "build-123",
      },
      serverId: "server-123",
    });

    expect(payload).toEqual({
      url: "http://localhost:8081/mcp/server-123",
      traceId: "trace-123",
      experimentId: "experiment-123",
      sessionId: "session-123",
      buildRequestId: "build-123",
      serverId: "server-123",
    });
  });
});
