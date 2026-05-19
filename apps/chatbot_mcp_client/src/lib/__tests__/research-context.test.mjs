import { afterEach, describe, expect, it } from "bun:test";
import {
  buildChatRunRequestPayload,
  buildChatResearchContext,
  buildDashboardRunVariant,
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

  it("maps dashboard static and RAG-off settings to report-compatible run fields", () => {
    const context = {
      traceId: "trace-123",
      experimentId: "experiment-123",
      sessionId: "session-123",
      buildRequestId: "build-123",
    };

    expect(
      buildChatRunRequestPayload({
        context,
        ragEnabled: false,
        skillSelectionMode: "static",
      }),
    ).toEqual({
      ...context,
      ragEnabled: false,
      dynamicSkillSelection: false,
      skillSelectionVariant: "static",
      variantId: "static-rag-off",
    });
  });

  it("maps dashboard dynamic and RAG-on settings to the same visible variant id", () => {
    const variant = buildDashboardRunVariant({
      ragEnabled: true,
      skillSelectionMode: "dynamic",
    });

    expect(variant).toEqual({
      ragEnabled: true,
      dynamicSkillSelection: true,
      skillSelectionVariant: "dynamic",
      variantId: "dynamic-rag-on",
    });
  });

  it("passes run flags through generated MCP metadata checks", () => {
    const payload = buildMcpMetadataRequestPayload({
      url: "http://localhost:8081/mcp/server-123",
      context: {
        traceId: "trace-123",
        experimentId: "experiment-123",
        sessionId: "session-123",
        buildRequestId: "build-123",
        ragEnabled: false,
        dynamicSkillSelection: false,
        skillSelectionVariant: "static",
        variantId: "static-rag-off",
      },
      serverId: "server-123",
    });

    expect(payload).toMatchObject({
      ragEnabled: false,
      dynamicSkillSelection: false,
      skillSelectionVariant: "static",
      variantId: "static-rag-off",
    });
  });
});
