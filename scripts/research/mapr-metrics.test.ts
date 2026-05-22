import { describe, expect, it } from "bun:test";
import path from "path";
import { validateInputDocFixture } from "./input-doc-format";
import {
  computeRetrievalMetrics,
  evaluateGeneratedToolQuality,
  loadMaprLabelFile,
  normalizeEstimatedUsage,
  safeRate,
  safeRatio,
  summarizeRagRetrievalForRun,
  successfulServerRatios,
  validateCaseMaprLabels,
  type ExpectedOperationLabel,
} from "./mapr-metrics";

const root = path.resolve(import.meta.dir, "../..");
const labelsPath = path.join(root, "experiments/research-metrics/backend_toolcall_matrix_labels.json");

describe("MAPR metric helpers", () => {
  it("validates MAPR labels against all checked-in input docs", () => {
    const labels = loadMaprLabelFile(labelsPath);
    const cases = [
      ["jsonplaceholder-input-doc", "input/jsonplaceholder.txt"],
      ["dummyjson-input-doc", "input/dummyjson.txt"],
      ["pokeapi-input-doc", "input/pokeapi.txt"],
    ] as const;

    for (const [caseId, inputPath] of cases) {
      const fixture = validateInputDocFixture(path.join(root, inputPath));
      validateCaseMaprLabels({ caseId, labels: labels.cases[caseId], fixture });
      expect(labels.cases[caseId]?.expectedOperations).toHaveLength(fixture.declaredEndpointCount);
    }
  });

  it("computes nullable rates and per-successful-server ratios", () => {
    expect(safeRate(2, 4)).toBe(0.5);
    expect(safeRate(1, 0)).toBeNull();
    expect(safeRatio(300, 3)).toBe(100);
    expect(successfulServerRatios({
      estimatedTotalTokens: 900,
      estimatedCostUsd: 0.45,
      successfulBuilds: 3,
    })).toEqual({
      tokens_per_successful_server: 300,
      estimated_cost_per_successful_server: 0.15,
    });
  });

  it("maps generated tools to expected operations and detects hallucinated tools", () => {
    const expected: ExpectedOperationLabel[] = [
      {
        id: "get-post-by-id",
        method: "GET",
        path: "/posts/{id}",
        aliases: ["get post", "get-post-by-id"],
        requiredParams: ["id"],
        schemaHints: ["id"],
      },
      {
        id: "create-post",
        method: "POST",
        path: "/posts",
        aliases: ["create post", "create-post"],
        requiredParams: ["title", "body", "userId"],
        schemaHints: ["title", "body", "userId"],
      },
    ];
    const result = evaluateGeneratedToolQuality(expected, [
      {
        name: "get_post_by_id",
        inputSchema: { type: "object", properties: { id: { type: "number" } }, required: ["id"] },
      },
      {
        name: "create_post",
        inputSchema: { type: "object", properties: { title: { type: "string" }, userId: { type: "number" } } },
      },
      { name: "weather_now", description: "Not part of the API" },
    ]);

    expect(result.mapped_operation_count).toBe(2);
    expect(result.hallucinated_tool_count).toBe(1);
    expect(result.schema_valid_tool_count).toBe(1);
    expect(result.endpoint_coverage).toBe(1);
    expect(result.hallucinated_tool_rate).toBe(0.3333);
    expect(result.schema_validity_rate).toBe(0.5);
  });

  it("computes precision@3, recall@3, and MRR@3", () => {
    const result = computeRetrievalMetrics({
      rankedEvidence: ["api_doc", "wrong", "posts"],
      relevantEvidence: ["api_doc", "posts"],
    });

    expect(result.retrieval_metric_applicable).toBe(true);
    expect(result.retrieval_hit_count).toBe(2);
    expect(result.precision_at_3).toBe(0.6667);
    expect(result.recall_at_3).toBe(1);
    expect(result.mrr_at_3).toBe(1);

    const disabled = computeRetrievalMetrics({
      rankedEvidence: [],
      relevantEvidence: ["api_doc"],
      applicable: false,
    });
    expect(disabled.precision_at_3).toBeNull();
  });

  it("normalizes estimated usage from mixed event field names", () => {
    const usage = normalizeEstimatedUsage([
      { metrics: { prompt_token_estimate: 100, completion_tokens: 50, estimated_cost_usd: 0.02 } },
      { estimatedUsage: { estimatedPromptTokens: 20, estimatedCompletionTokens: 10, estimatedCostUsd: 0.01 } },
    ]);

    expect(usage.estimated_prompt_tokens).toBe(120);
    expect(usage.estimated_completion_tokens).toBe(60);
    expect(usage.estimated_total_tokens).toBe(180);
    expect(usage.estimated_cost_usd).toBe(0.03);
    expect(usage.usage_status).toBe("complete");
    expect(usage.usage_source).toBe("provider_usage");
  });

  it("derives Gemini 2.5 Flash cost from deterministic input and output estimates", () => {
    const usage = normalizeEstimatedUsage([
      { metrics: { estimated_prompt_chars: 400, estimated_completion_chars: 200 } },
    ]);

    expect(usage.estimated_prompt_tokens).toBe(100);
    expect(usage.estimated_completion_tokens).toBe(50);
    expect(usage.estimated_total_tokens).toBe(150);
    expect(usage.estimated_cost_usd).toBe(0.000155);
    expect(usage.usage_status).toBe("complete");
    expect(usage.usage_source).toBe("deterministic_estimate");
  });

  it("uses the effective Gemini 2.5 Flash price for MetaClaw-backed usage", () => {
    const usage = normalizeEstimatedUsage([
      {
        provider: "metaclaw",
        model: "metaclaw-router",
        metrics: {
          prompt_tokens: 1_000_000,
          completion_tokens: 1_000_000,
        },
      },
    ]);

    expect(usage.estimated_prompt_tokens).toBe(1_000_000);
    expect(usage.estimated_completion_tokens).toBe(1_000_000);
    expect(usage.estimated_total_tokens).toBe(2_000_000);
    expect(usage.estimated_cost_usd).toBe(2.8);
    expect(usage.usage_status).toBe("complete");
  });

  it("marks missing or redacted usage as unavailable instead of zero", () => {
    const missing = normalizeEstimatedUsage([]);
    expect(missing.estimated_prompt_tokens).toBeNull();
    expect(missing.estimated_cost_usd).toBeNull();
    expect(missing.usage_status).toBe("unavailable_missing_usage");

    const redacted = normalizeEstimatedUsage([
      { metrics: { prompt_token_estimate: "[REDACTED]", completion_tokens: 30 } },
    ]);
    expect(redacted.estimated_prompt_tokens).toBeNull();
    expect(redacted.estimated_completion_tokens).toBe(30);
    expect(redacted.estimated_cost_usd).toBeNull();
    expect(redacted.usage_status).toBe("unavailable_redacted");
  });

  it("uses only real LangGraph examiner events for RAG retrieval metrics", () => {
    const result = summarizeRagRetrievalForRun({
      ragEnabled: true,
      caseLabels: {
        relevantRagEvidence: ["posts"],
        expectedOperations: [],
      },
      events: [
        {
          service: "chatbot-backend",
          event_name: "examiner_completed",
          tags: { source: "backend_langgraph_fallback" },
          metrics: {
            rag_returned_count: 3,
            rag_context_tokens: 999,
            rag_top_3_evidence_labels: ["posts"],
          },
        },
        {
          service: "langgraph-agent",
          event_name: "examiner_completed",
          metrics: {
            rag_returned_count: 2,
            rag_context_tokens: 40,
            rag_top_3_evidence_labels: ["wrong", "posts"],
          },
        },
        {
          service: "langgraph-agent",
          event_name: "examiner_completed",
          tags: { source: "langgraph_stream_summary" },
          metrics: {
            rag_returned_count: 0,
            rag_context_tokens: 0,
            rag_top_3_evidence_labels: [],
          },
        },
      ],
    });

    expect(result.rag_retrieval_status).toBe("evaluated");
    expect(result.rag_retrieval_source).toBe("langgraph-agent");
    expect(result.rag_real_examiner_event_count).toBe(1);
    expect(result.rag_returned_count).toBe(2);
    expect(result.rag_context_tokens).toBe(40);
    expect(result.precision_at_3).toBe(0.3333);
    expect(result.mrr_at_3).toBe(0.5);
  });

  it("does not convert missing real examiner evidence into zero-valued retrieval success", () => {
    const result = summarizeRagRetrievalForRun({
      ragEnabled: true,
      caseLabels: {
        relevantRagEvidence: ["posts"],
        expectedOperations: [],
      },
      events: [
        {
          service: "chatbot-backend",
          event_name: "examiner_completed",
          tags: { source: "backend_langgraph_fallback" },
          metrics: { rag_top_3_evidence_labels: ["posts"] },
        },
      ],
    });

    expect(result.retrieval_metric_applicable).toBe(false);
    expect(result.precision_at_3).toBeNull();
    expect(result.rag_retrieval_status).toBe("missing_real_examiner_evidence");
  });
});
