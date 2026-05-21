import fs from "fs";

export type JsonRecord = Record<string, unknown>;

export type ExpectedOperationLabel = {
  id: string;
  method: string;
  path: string;
  aliases: string[];
  requiredParams?: string[];
  schemaHints?: string[];
  authRequired?: boolean;
  relevantRagEvidence?: string[];
};

export type CaseMaprLabels = {
  relevantRagEvidence?: string[];
  expectedOperations: ExpectedOperationLabel[];
};

export type MaprLabelFile = {
  formatVersion: number;
  description?: string;
  cases: Record<string, CaseMaprLabels>;
};

export type InputDocEndpointLike = {
  method: string;
  endpointPath: string;
};

export type InputDocFixtureLike = {
  endpoints: InputDocEndpointLike[];
};

export type GeneratedToolLike = JsonRecord & {
  name?: string;
  description?: string;
};

export type QualityEvaluation = JsonRecord & {
  expected_operation_count: number;
  mapped_operation_count: number;
  mapped_tool_count: number;
  generated_tool_count: number;
  hallucinated_tool_count: number;
  schema_valid_tool_count: number;
  endpoint_coverage: number | null;
  hallucinated_tool_rate: number | null;
  schema_validity_rate: number | null;
};

export type RetrievalMetrics = JsonRecord & {
  retrieval_metric_applicable: boolean;
  retrieved_evidence_count: number;
  relevant_evidence_count: number;
  retrieval_hit_count: number;
  precision_at_3: number | null;
  recall_at_3: number | null;
  mrr_at_3: number | null;
};

const PROMPT_TOKEN_KEYS = ["prompt_token_estimate", "prompt_tokens", "estimated_prompt_tokens", "estimatedPromptTokens"];
const COMPLETION_TOKEN_KEYS = ["completion_token_estimate", "completion_tokens", "estimated_completion_tokens", "estimatedCompletionTokens"];
const TOTAL_TOKEN_KEYS = ["total_token_estimate", "total_tokens", "estimated_total_tokens", "estimatedTotalTokens"];
const COST_KEYS = ["estimated_cost_usd", "estimatedCostUsd", "cost_usd"];

export function safeRate(part: number, total: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return null;
  return Number((part / total).toFixed(4));
}

export function safeRatio(total: number, denominator: number): number | null {
  if (!Number.isFinite(total) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return Number((total / denominator).toFixed(4));
}

export function percentile(values: number[], p: number): number | null {
  const finite = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (finite.length === 0) return null;
  const idx = Math.min(finite.length - 1, Math.ceil((p / 100) * finite.length) - 1);
  return finite[idx];
}

export function normalizeMetricToken(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactToken(value: unknown): string {
  return normalizeMetricToken(value).replaceAll(" ", "");
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function numericValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return 0;
}

export function loadMaprLabelFile(filePath: string): MaprLabelFile {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as MaprLabelFile;
  if (!parsed || typeof parsed !== "object" || !parsed.cases || typeof parsed.cases !== "object") {
    throw new Error(`${filePath}: MAPR labels must contain a cases object.`);
  }
  for (const [caseId, labels] of Object.entries(parsed.cases)) {
    if (!Array.isArray(labels.expectedOperations) || labels.expectedOperations.length === 0) {
      throw new Error(`${filePath}: case ${caseId} must define expectedOperations.`);
    }
    for (const operation of labels.expectedOperations) {
      if (!operation.id || !operation.method || !operation.path || !Array.isArray(operation.aliases) || operation.aliases.length === 0) {
        throw new Error(`${filePath}: case ${caseId} has an invalid expected operation label.`);
      }
    }
  }
  return parsed;
}

export function validateCaseMaprLabels({
  caseId,
  labels,
  fixture,
}: {
  caseId: string;
  labels?: CaseMaprLabels;
  fixture?: InputDocFixtureLike;
}): void {
  if (!labels) throw new Error(`Dataset case ${caseId} has no MAPR labels.`);
  const expected = labels.expectedOperations || [];
  if (fixture && expected.length !== fixture.endpoints.length) {
    throw new Error(`Dataset case ${caseId} expected operation labels (${expected.length}) do not match declared endpoints (${fixture.endpoints.length}).`);
  }

  const endpointKeys = new Set(
    (fixture?.endpoints || []).map((endpoint) => `${endpoint.method.toUpperCase()} ${endpoint.endpointPath}`),
  );
  const operationIds = new Set<string>();
  for (const operation of expected) {
    if (operationIds.has(operation.id)) throw new Error(`Dataset case ${caseId} has duplicate operation label id: ${operation.id}`);
    operationIds.add(operation.id);

    const key = `${operation.method.toUpperCase()} ${operation.path}`;
    if (fixture && !endpointKeys.has(key)) {
      throw new Error(`Dataset case ${caseId} MAPR label ${operation.id} does not match a declared endpoint: ${key}`);
    }
  }
}

function operationMatchScore(operation: ExpectedOperationLabel, tool: GeneratedToolLike): number {
  const toolName = compactToken(tool.name);
  const toolText = compactToken(`${tool.name || ""} ${tool.description || ""}`);
  const aliases = [operation.id, `${operation.method} ${operation.path}`, ...operation.aliases].map(compactToken).filter(Boolean);
  let best = 0;
  for (const alias of aliases) {
    if (!alias) continue;
    if (toolName && toolName === alias) best = Math.max(best, 100);
    if (toolText.includes(alias)) best = Math.max(best, 85);
    if (toolName.length > 3 && alias.includes(toolName)) best = Math.max(best, 65);
  }
  return best;
}

function collectSchemaKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") keys.add(compactToken(item));
      collectSchemaKeys(item, keys);
    }
    return keys;
  }
  if (!value || typeof value !== "object") return keys;
  for (const [key, item] of Object.entries(value as JsonRecord)) {
    keys.add(compactToken(key));
    if ((key === "properties" || key === "parameters") && item && typeof item === "object" && !Array.isArray(item)) {
      for (const propName of Object.keys(item as JsonRecord)) keys.add(compactToken(propName));
    }
    collectSchemaKeys(item, keys);
  }
  return keys;
}

function toolSchemaText(tool: GeneratedToolLike): string {
  const schemaCandidates = [
    tool.inputSchema,
    tool.input_schema,
    tool.schema,
    tool.parameters,
    tool.argsSchema,
    tool.args_schema,
  ].filter(Boolean);
  return compactToken(JSON.stringify(schemaCandidates));
}

function hasSchemaMetadata(tool: GeneratedToolLike): boolean {
  return Boolean(tool.inputSchema || tool.input_schema || tool.schema || tool.parameters || tool.argsSchema || tool.args_schema);
}

function operationSchemaValid(operation: ExpectedOperationLabel, tool: GeneratedToolLike): boolean {
  const required = operation.requiredParams || [];
  if (required.length === 0) return true;
  if (!hasSchemaMetadata(tool)) return false;

  const schemaKeys = collectSchemaKeys(tool);
  const schemaText = toolSchemaText(tool);
  const hints = (operation.schemaHints || []).map(compactToken).filter(Boolean);

  return required.every((param) => {
    const normalizedParam = compactToken(param);
    if (schemaKeys.has(normalizedParam) || schemaText.includes(normalizedParam)) return true;
    if (required.length === 1) {
      return hints.some((hint) => schemaKeys.has(hint) || schemaText.includes(hint));
    }
    return false;
  });
}

export function evaluateGeneratedToolQuality(
  expectedOperations: ExpectedOperationLabel[],
  generatedTools: GeneratedToolLike[],
): QualityEvaluation {
  const matches: JsonRecord[] = [];
  const matchedToolIndexes = new Set<number>();
  const mappedOperationIds = new Set<string>();
  let schemaValidToolCount = 0;

  for (const [index, tool] of generatedTools.entries()) {
    let bestOperation: ExpectedOperationLabel | undefined;
    let bestScore = 0;
    for (const operation of expectedOperations) {
      const score = operationMatchScore(operation, tool);
      if (score > bestScore) {
        bestScore = score;
        bestOperation = operation;
      }
    }

    if (!bestOperation || bestScore < 65) continue;
    const schemaValid = operationSchemaValid(bestOperation, tool);
    if (schemaValid) schemaValidToolCount += 1;
    matchedToolIndexes.add(index);
    mappedOperationIds.add(bestOperation.id);
    matches.push({
      operation_id: bestOperation.id,
      tool_name: String(tool.name || `tool-${index + 1}`).slice(0, 120),
      match_score: bestScore,
      schema_valid: schemaValid,
    });
  }

  const hallucinatedToolNames = generatedTools
    .map((tool, index) => ({ tool, index }))
    .filter((item) => !matchedToolIndexes.has(item.index))
    .map((item) => String(item.tool.name || `tool-${item.index + 1}`).slice(0, 120));
  const unmappedOperationIds = expectedOperations
    .filter((operation) => !mappedOperationIds.has(operation.id))
    .map((operation) => operation.id);
  const schemaInvalidOperationIds = matches
    .filter((match) => match.schema_valid === false)
    .map((match) => String(match.operation_id));

  return {
    expected_operation_count: expectedOperations.length,
    mapped_operation_count: mappedOperationIds.size,
    mapped_tool_count: matchedToolIndexes.size,
    generated_tool_count: generatedTools.length,
    hallucinated_tool_count: hallucinatedToolNames.length,
    schema_valid_tool_count: schemaValidToolCount,
    endpoint_coverage: safeRate(mappedOperationIds.size, expectedOperations.length),
    hallucinated_tool_rate: safeRate(hallucinatedToolNames.length, generatedTools.length),
    schema_validity_rate: safeRate(schemaValidToolCount, matchedToolIndexes.size),
    mapped_operations: matches,
    unmapped_operation_ids: unmappedOperationIds,
    hallucinated_tool_names: hallucinatedToolNames,
    schema_invalid_operation_ids: schemaInvalidOperationIds,
  };
}

function evidenceSet(values: unknown[]): Set<string> {
  return new Set(values.map(normalizeMetricToken).filter(Boolean));
}

export function collectRelevantRagEvidence(caseLabels?: CaseMaprLabels): string[] {
  const values = [
    ...(caseLabels?.relevantRagEvidence || []),
    ...(caseLabels?.expectedOperations || []).flatMap((operation) => operation.relevantRagEvidence || []),
  ];
  return [...evidenceSet(values)];
}

export function computeRetrievalMetrics({
  rankedEvidence,
  relevantEvidence,
  k = 3,
  applicable = true,
}: {
  rankedEvidence: string[];
  relevantEvidence: string[];
  k?: number;
  applicable?: boolean;
}): RetrievalMetrics {
  const topK = rankedEvidence.slice(0, k).map(normalizeMetricToken).filter(Boolean);
  const relevant = evidenceSet(relevantEvidence);
  if (!applicable || relevant.size === 0) {
    return {
      retrieval_metric_applicable: false,
      retrieved_evidence_count: topK.length,
      relevant_evidence_count: relevant.size,
      retrieval_hit_count: 0,
      precision_at_3: null,
      recall_at_3: null,
      mrr_at_3: null,
    };
  }

  let firstRelevantRank = 0;
  let hits = 0;
  topK.forEach((label, index) => {
    if (!relevant.has(label)) return;
    hits += 1;
    if (!firstRelevantRank) firstRelevantRank = index + 1;
  });

  return {
    retrieval_metric_applicable: true,
    retrieved_evidence_count: topK.length,
    relevant_evidence_count: relevant.size,
    retrieval_hit_count: hits,
    precision_at_3: safeRate(hits, k),
    recall_at_3: safeRate(hits, relevant.size),
    mrr_at_3: firstRelevantRank ? Number((1 / firstRelevantRank).toFixed(4)) : 0,
    first_relevant_rank: firstRelevantRank || null,
  };
}

function firstMetricArray(metrics: JsonRecord, keys: string[]): string[] {
  for (const key of keys) {
    const values = stringList(metrics[key]);
    if (values.length > 0) return values;
  }
  return [];
}

function firstMetricNumber(events: Array<{ metrics?: JsonRecord }>, keys: string[]): number {
  for (const event of [...events].reverse()) {
    const metrics = event.metrics || {};
    for (const key of keys) {
      const value = metrics[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
    }
  }
  return 0;
}

export function rankedRagEvidenceFromEvents(events: Array<{ metrics?: JsonRecord }>): string[] {
  const withEvidence = [...events].reverse().find((event) => {
    const metrics = event.metrics || {};
    return firstMetricArray(metrics, ["rag_top_3_evidence_labels", "rag_evidence_labels", "rag_top3_evidence_labels"]).length > 0 ||
      firstMetricArray(metrics, ["rag_top_3_evidence_hashes", "rag_evidence_hashes", "rag_top3_evidence_hashes"]).length > 0;
  });
  const metrics = withEvidence?.metrics || {};
  const labels = firstMetricArray(metrics, ["rag_top_3_evidence_labels", "rag_evidence_labels", "rag_top3_evidence_labels"]);
  const hashes = firstMetricArray(metrics, ["rag_top_3_evidence_hashes", "rag_evidence_hashes", "rag_top3_evidence_hashes"]);
  return labels.length > 0 ? labels : hashes;
}

export function summarizeRagRetrievalForRun({
  events,
  caseLabels,
  ragEnabled,
}: {
  events: Array<{ metrics?: JsonRecord }>;
  caseLabels?: CaseMaprLabels;
  ragEnabled: boolean;
}): RetrievalMetrics {
  const ragReturnedCount = firstMetricNumber(events, ["rag_returned_count", "ragReturnedCount"]);
  const ragContextTokens = firstMetricNumber(events, ["rag_context_tokens", "ragContextTokens"]);
  if (!ragEnabled) {
    return {
      ...computeRetrievalMetrics({ rankedEvidence: [], relevantEvidence: [], applicable: false }),
      rag_returned_count: ragReturnedCount,
      rag_context_tokens: ragContextTokens,
      rag_retrieval_status: "not_applicable_rag_disabled",
    };
  }
  const rankedEvidence = rankedRagEvidenceFromEvents(events);
  return {
    ...computeRetrievalMetrics({
      rankedEvidence,
      relevantEvidence: collectRelevantRagEvidence(caseLabels),
      applicable: true,
    }),
    rag_returned_count: ragReturnedCount,
    rag_context_tokens: ragContextTokens,
    rag_top_3_evidence: rankedEvidence.slice(0, 3),
    rag_retrieval_status: rankedEvidence.length > 0 ? "evaluated" : "no_evidence",
  };
}

function metricContainer(record: JsonRecord | undefined, key: "metrics" | "estimatedUsage"): JsonRecord {
  const value = record?.[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function firstNumericMetric(record: JsonRecord | undefined, keys: string[]): number {
  const containers = [metricContainer(record, "metrics"), metricContainer(record, "estimatedUsage"), record || {}];
  for (const container of containers) {
    for (const key of keys) {
      const value = container[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
    }
  }
  return 0;
}

export function normalizeEstimatedUsage(records: Array<JsonRecord | undefined>): JsonRecord {
  const estimatedPromptTokens = records.reduce((sum, record) => sum + firstNumericMetric(record, PROMPT_TOKEN_KEYS), 0);
  const estimatedCompletionTokens = records.reduce((sum, record) => sum + firstNumericMetric(record, COMPLETION_TOKEN_KEYS), 0);
  const explicitTotalTokens = records.reduce((sum, record) => sum + firstNumericMetric(record, TOTAL_TOKEN_KEYS), 0);
  const estimatedTotalTokens = explicitTotalTokens || estimatedPromptTokens + estimatedCompletionTokens;
  const estimatedCostUsd = records.reduce((sum, record) => sum + firstNumericMetric(record, COST_KEYS), 0);
  const llmCallCount = records.reduce((sum, record) => sum + firstNumericMetric(record, ["llm_calls", "llm_call_count"]), 0);
  const selectedSkillCount = records.reduce((sum, record) => sum + firstNumericMetric(record, ["selected_skill_count", "skills_selected_count"]), 0);
  const selectedSkillTokens = records.reduce((sum, record) => sum + firstNumericMetric(record, ["skill_total_tokens", "selected_skill_tokens", "tokenCost"]), 0);

  return {
    estimated_prompt_tokens: estimatedPromptTokens,
    estimated_completion_tokens: estimatedCompletionTokens,
    estimated_total_tokens: estimatedTotalTokens,
    estimated_cost_usd: estimatedCostUsd,
    estimatedPromptTokens,
    estimatedCompletionTokens,
    estimatedTotalTokens,
    estimatedCostUsd,
    llmCallCount,
    selectedSkillCount,
    selectedSkillTokens,
  };
}

export function successfulServerRatios({
  estimatedTotalTokens,
  estimatedCostUsd,
  successfulBuilds,
}: {
  estimatedTotalTokens: number;
  estimatedCostUsd: number;
  successfulBuilds: number;
}): JsonRecord {
  return {
    tokens_per_successful_server: safeRatio(estimatedTotalTokens, successfulBuilds),
    estimated_cost_per_successful_server: safeRatio(estimatedCostUsd, successfulBuilds),
  };
}
