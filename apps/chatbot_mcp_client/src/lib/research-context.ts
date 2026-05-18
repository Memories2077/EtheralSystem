export const DEFAULT_RESEARCH_EXPERIMENT_ID = "local-dev";

export interface ResearchCorrelationContext {
  traceId: string;
  experimentId: string;
  sessionId: string;
  buildRequestId: string;
  serverId?: string;
}

export interface MetadataRequestPayload {
  url: string;
  traceId?: string;
  experimentId?: string;
  sessionId?: string;
  buildRequestId?: string;
  serverId?: string;
}

export function resolveResearchExperimentId(): string {
  return (
    process.env.NEXT_PUBLIC_RESEARCH_EXPERIMENT_ID ||
    DEFAULT_RESEARCH_EXPERIMENT_ID
  ).trim();
}

export function buildChatResearchContext({
  sessionId,
  buildRequestId,
  experimentId = resolveResearchExperimentId(),
}: {
  sessionId: string;
  buildRequestId: string;
  experimentId?: string;
}): ResearchCorrelationContext {
  const normalizedBuildRequestId = String(buildRequestId || "").trim();
  const normalizedSessionId = String(sessionId || "").trim();
  return {
    traceId: normalizedBuildRequestId || normalizedSessionId,
    experimentId: String(experimentId || DEFAULT_RESEARCH_EXPERIMENT_ID).trim(),
    sessionId: normalizedSessionId,
    buildRequestId: normalizedBuildRequestId,
  };
}

export function buildMcpMetadataRequestPayload({
  url,
  context,
  serverId,
}: {
  url: string;
  context?: Partial<ResearchCorrelationContext>;
  serverId?: string;
}): MetadataRequestPayload {
  return {
    url,
    traceId: context?.traceId,
    experimentId: context?.experimentId,
    sessionId: context?.sessionId,
    buildRequestId: context?.buildRequestId,
    serverId: serverId || context?.serverId,
  };
}
