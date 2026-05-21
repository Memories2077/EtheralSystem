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
  });
});
