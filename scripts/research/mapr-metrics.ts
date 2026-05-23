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

const GEMINI_2_5_FLASH_INPUT_USD_PER_1M = 0.30;
const GEMINI_2_5_FLASH_OUTPUT_USD_PER_1M = 2.50;
const REDACTED_VALUE = "[REDACTED]";

const PROMPT_TOKEN_KEYS = [
  "prompt_token_estimate",
  "prompt_tokens",
  "promptTokens",
  "estimated_prompt_tokens",
  "estimatedPromptTokens",
  "input_tokens",
  "inputTokens",
  "input_token_count",
  "inputTokenCount",
];
const COMPLETION_TOKEN_KEYS = [
  "completion_token_estimate",
  "completion_tokens",
  "completionTokens",
  "estimated_completion_tokens",
  "estimatedCompletionTokens",
  "output_tokens",
  "outputTokens",
  "output_token_count",
  "outputTokenCount",
];
const TOTAL_TOKEN_KEYS = ["total_token_estimate", "total_tokens", "totalTokens", "estimated_total_tokens", "estimatedTotalTokens"];
const COST_KEYS = ["estimated_cost_usd", "estimatedCostUsd", "cost_usd"];
const PROMPT_CHAR_KEYS = ["estimated_prompt_chars", "prompt_chars", "input_chars", "input_length", "prompt_length"];
const COMPLETION_CHAR_KEYS = ["estimated_completion_chars", "completion_chars", "output_chars", "output_length", "response_length"];

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

function eventTagSource(event: { tags?: JsonRecord; source?: unknown }): string {
  return String(event.source || event.tags?.source || "");
}

function hasRagEvidenceMetrics(metrics: JsonRecord = {}): boolean {
  return firstMetricArray(metrics, ["rag_top_3_evidence_labels", "rag_evidence_labels", "rag_top3_evidence_labels"]).length > 0 ||
    firstMetricArray(metrics, ["rag_top_3_evidence_hashes", "rag_evidence_hashes", "rag_top3_evidence_hashes"]).length > 0;
}

function isRealLangGraphExaminerEvent(event: { service?: unknown; event_name?: unknown; tags?: JsonRecord; source?: unknown; metrics?: JsonRecord }): boolean {
  return isRealLangGraphEvidenceEvent(event, "examiner_completed");
}

function isRealLangGraphEvidenceEvent(
  event: { service?: unknown; event_name?: unknown; tags?: JsonRecord; source?: unknown; metrics?: JsonRecord },
  eventName: string,
): boolean {
  const source = eventTagSource(event);
  if (source === "backend_langgraph_fallback") return false;
  if (eventName === "examiner_completed" && source === "langgraph_stream_summary" && !hasRagEvidenceMetrics(event.metrics || {})) return false;
  return (
    event.service === "langgraph-agent" &&
    event.event_name === eventName
  );
}

export function realLangGraphExaminerEvents<T extends { service?: unknown; event_name?: unknown; tags?: JsonRecord; source?: unknown }>(
  events: T[],
): T[] {
  return events.filter(isRealLangGraphExaminerEvent);
}

function finiteEvidenceNumber(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string" && value.trim()) return Number.isFinite(Number(value));
  return false;
}

export function assertStrictMaprEvidence({
  events,
  estimatedUsage,
  ragRetrieval,
  ragEnabled,
}: {
  events: Array<{ service?: unknown; event_name?: unknown; tags?: JsonRecord; source?: unknown; metrics?: JsonRecord }>;
  estimatedUsage: JsonRecord;
  ragRetrieval: JsonRecord;
  ragEnabled: boolean | string;
}): void {
  const hasGeneratorEvent = events.some((event) => isRealLangGraphEvidenceEvent(event, "generator_completed"));
  if (!hasGeneratorEvent) {
    throw new Error("Strict evidence validation failed: missing real langgraph-agent generator_completed event.");
  }

  if (ragEnabled === true || ragEnabled === "true") {
    const hasExaminerEvent = events.some((event) => isRealLangGraphEvidenceEvent(event, "examiner_completed"));
    if (!hasExaminerEvent) {
      throw new Error("Strict evidence validation failed: RAG-on run is missing real langgraph-agent examiner_completed event.");
    }
    const retrievalStatus = String(ragRetrieval.rag_retrieval_status || "unknown");
    const retrievedEvidenceCount = Number(ragRetrieval.retrieved_evidence_count || 0);
    const missingRetrievalMetrics = ["precision_at_3", "recall_at_3", "mrr_at_3"].filter((field) => !finiteEvidenceNumber(ragRetrieval[field]));
    if (retrievalStatus !== "evaluated" || retrievedEvidenceCount <= 0 || missingRetrievalMetrics.length > 0) {
      throw new Error(
        `Strict evidence validation failed: RAG-on retrieval evidence unavailable (status=${retrievalStatus}, retrieved=${retrievedEvidenceCount}, missing=${missingRetrievalMetrics.join("|") || "none"}).`,
      );
    }
  }

  const requiredUsageFields = [
    "estimated_prompt_tokens",
    "estimated_completion_tokens",
    "estimated_total_tokens",
    "estimated_cost_usd",
  ];
  const missingUsageFields = requiredUsageFields.filter((field) => !finiteEvidenceNumber(estimatedUsage[field]));
  if (estimatedUsage.usage_status !== "complete" || missingUsageFields.length > 0) {
    throw new Error(
      `Strict evidence validation failed: numeric usage evidence unavailable (usage_status=${String(estimatedUsage.usage_status || "unknown")}, missing=${missingUsageFields.join("|") || "none"}).`,
    );
  }
}

export function rankedRagEvidenceFromEvents(events: Array<{ metrics?: JsonRecord }>): string[] {
  const withEvidence = [...events].reverse().find((event) => {
    return hasRagEvidenceMetrics(event.metrics || {});
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
  events: Array<{ service?: unknown; event_name?: unknown; tags?: JsonRecord; source?: unknown; metrics?: JsonRecord }>;
  caseLabels?: CaseMaprLabels;
  ragEnabled: boolean;
}): RetrievalMetrics {
  const realExaminerEvents = realLangGraphExaminerEvents(events);
  const eventsForRetrieval = ragEnabled ? realExaminerEvents : events;
  const ragReturnedCount = firstMetricNumber(eventsForRetrieval, ["rag_returned_count", "ragReturnedCount"]);
  const ragContextTokens = firstMetricNumber(eventsForRetrieval, ["rag_context_tokens", "ragContextTokens"]);
  if (!ragEnabled) {
    return {
      ...computeRetrievalMetrics({ rankedEvidence: [], relevantEvidence: [], applicable: false }),
      rag_returned_count: ragReturnedCount,
      rag_context_tokens: ragContextTokens,
      rag_retrieval_status: "not_applicable_rag_disabled",
      rag_retrieval_source: "not_applicable",
      rag_real_examiner_event_count: realExaminerEvents.length,
    };
  }
  if (realExaminerEvents.length === 0) {
    return {
      ...computeRetrievalMetrics({ rankedEvidence: [], relevantEvidence: collectRelevantRagEvidence(caseLabels), applicable: false }),
      rag_returned_count: 0,
      rag_context_tokens: 0,
      rag_top_3_evidence: [],
      rag_retrieval_status: "missing_real_examiner_evidence",
      rag_retrieval_source: "unavailable",
      rag_real_examiner_event_count: 0,
    };
  }
  const rankedEvidence = rankedRagEvidenceFromEvents(realExaminerEvents);
  if (rankedEvidence.length === 0) {
    return {
      ...computeRetrievalMetrics({ rankedEvidence: [], relevantEvidence: collectRelevantRagEvidence(caseLabels), applicable: false }),
      rag_returned_count: ragReturnedCount,
      rag_context_tokens: ragContextTokens,
      rag_top_3_evidence: [],
      rag_retrieval_status: "no_real_rag_evidence",
      rag_retrieval_source: "langgraph-agent",
      rag_real_examiner_event_count: realExaminerEvents.length,
    };
  }
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
    rag_retrieval_source: "langgraph-agent",
    rag_real_examiner_event_count: realExaminerEvents.length,
  };
}

function metricContainer(record: JsonRecord | undefined, key: "metrics" | "estimatedUsage"): JsonRecord {
  const value = record?.[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function nestedContainer(record: JsonRecord, key: string): JsonRecord {
  const value = record[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function metricContainers(record: JsonRecord | undefined): JsonRecord[] {
  const base = record || {};
  const metrics = metricContainer(record, "metrics");
  const estimatedUsage = metricContainer(record, "estimatedUsage");
  return [
    metrics,
    estimatedUsage,
    base,
    nestedContainer(metrics, "usage_metadata"),
    nestedContainer(metrics, "usageMetadata"),
    nestedContainer(metrics, "token_usage"),
    nestedContainer(metrics, "tokenUsage"),
    nestedContainer(nestedContainer(metrics, "response_metadata"), "token_usage"),
    nestedContainer(nestedContainer(metrics, "responseMetadata"), "tokenUsage"),
    nestedContainer(base, "usage_metadata"),
    nestedContainer(base, "usageMetadata"),
    nestedContainer(base, "token_usage"),
    nestedContainer(base, "tokenUsage"),
  ];
}

function numericMetricResult(record: JsonRecord | undefined, keys: string[]): { value: number | null; redacted: boolean } {
  const containers = metricContainers(record);
  for (const container of containers) {
    for (const key of keys) {
      const value = container[key];
      if (typeof value === "number" && Number.isFinite(value)) return { value, redacted: false };
      if (typeof value === "string" && Number.isFinite(Number(value))) return { value: Number(value), redacted: false };
      if (String(value || "") === REDACTED_VALUE) return { value: null, redacted: true };
    }
  }
  return { value: null, redacted: false };
}

function firstNumericMetric(record: JsonRecord | undefined, keys: string[]): number {
  return numericMetricResult(record, keys).value || 0;
}

function estimatedTokensFromChars(record: JsonRecord | undefined, keys: string[]): { value: number | null; redacted: boolean } {
  const result = numericMetricResult(record, keys);
  if (result.value === null) return result;
  return { value: Math.max(0, Math.ceil(result.value / 4)), redacted: false };
}

function derivedGeminiFlashCost(promptTokens: number, completionTokens: number): number {
  const cost =
    (promptTokens * GEMINI_2_5_FLASH_INPUT_USD_PER_1M) / 1_000_000 +
    (completionTokens * GEMINI_2_5_FLASH_OUTPUT_USD_PER_1M) / 1_000_000;
  return Number(cost.toFixed(8));
}

export function normalizeEstimatedUsage(records: Array<JsonRecord | undefined>): JsonRecord {
  let estimatedPromptTokens = 0;
  let estimatedCompletionTokens = 0;
  let explicitTotalTokens = 0;
  let estimatedCostUsd = 0;
  let promptAvailable = false;
  let completionAvailable = false;
  let totalAvailable = false;
  let costAvailable = false;
  let sawRedactedUsage = false;
  let usedDeterministicEstimate = false;
  let usedExplicitUsage = false;

  for (const record of records) {
    const promptMetric = numericMetricResult(record, PROMPT_TOKEN_KEYS);
    const prompt = promptMetric.value === null ? estimatedTokensFromChars(record, PROMPT_CHAR_KEYS) : promptMetric;
    const completionMetric = numericMetricResult(record, COMPLETION_TOKEN_KEYS);
    const completion = completionMetric.value === null ? estimatedTokensFromChars(record, COMPLETION_CHAR_KEYS) : completionMetric;
    const total = numericMetricResult(record, TOTAL_TOKEN_KEYS);
    const cost = numericMetricResult(record, COST_KEYS);

    sawRedactedUsage ||= promptMetric.redacted || completionMetric.redacted || total.redacted || cost.redacted;
    usedDeterministicEstimate ||= (promptMetric.value === null && prompt.value !== null) || (completionMetric.value === null && completion.value !== null);
    usedExplicitUsage ||= promptMetric.value !== null || completionMetric.value !== null || total.value !== null || cost.value !== null;

    if (prompt.value !== null) {
      estimatedPromptTokens += prompt.value;
      promptAvailable = true;
    }
    if (completion.value !== null) {
      estimatedCompletionTokens += completion.value;
      completionAvailable = true;
    }
    if (total.value !== null) {
      explicitTotalTokens += total.value;
      totalAvailable = true;
    }
    if (cost.value !== null) {
      estimatedCostUsd += cost.value;
      costAvailable = true;
    }
  }

  const estimatedTotalTokens = totalAvailable
    ? explicitTotalTokens
    : promptAvailable && completionAvailable
      ? estimatedPromptTokens + estimatedCompletionTokens
      : null;
  if (!costAvailable && promptAvailable && completionAvailable) {
    estimatedCostUsd = derivedGeminiFlashCost(estimatedPromptTokens, estimatedCompletionTokens);
    costAvailable = true;
  }
  const usageComplete = promptAvailable && completionAvailable && estimatedTotalTokens !== null && costAvailable;
  const usageStatus = usageComplete
    ? "complete"
    : sawRedactedUsage
      ? "unavailable_redacted"
      : "unavailable_missing_usage";
  const usageSource = usageComplete
    ? usedExplicitUsage && usedDeterministicEstimate
      ? "mixed"
      : usedDeterministicEstimate
        ? "deterministic_estimate"
        : "provider_usage"
    : "unavailable";
  const llmCallCount = records.reduce((sum, record) => sum + firstNumericMetric(record, ["llm_calls", "llm_call_count"]), 0);
  const selectedSkillCount = records.reduce((sum, record) => sum + firstNumericMetric(record, ["selected_skill_count", "skills_selected_count"]), 0);
  const selectedSkillTokens = records.reduce((sum, record) => sum + firstNumericMetric(record, ["skill_total_tokens", "selected_skill_tokens", "tokenCost"]), 0);

  return {
    estimated_prompt_tokens: promptAvailable ? estimatedPromptTokens : null,
    estimated_completion_tokens: completionAvailable ? estimatedCompletionTokens : null,
    estimated_total_tokens: estimatedTotalTokens,
    estimated_cost_usd: costAvailable ? estimatedCostUsd : null,
    usage_status: usageStatus,
    usage_source: usageSource,
    estimatedPromptTokens: promptAvailable ? estimatedPromptTokens : null,
    estimatedCompletionTokens: completionAvailable ? estimatedCompletionTokens : null,
    estimatedTotalTokens,
    estimatedCostUsd: costAvailable ? estimatedCostUsd : null,
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
