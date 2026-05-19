export const DEFAULT_RESEARCH_EXPERIMENT_ID = "local-dev";

export interface ResearchCorrelationContext {
  traceId: string;
  experimentId: string;
  sessionId: string;
  buildRequestId: string;
  serverId?: string;
  ragEnabled?: boolean;
  dynamicSkillSelection?: boolean;
  skillSelectionVariant?: "static" | "dynamic";
  variantId?: string;
}

export interface MetadataRequestPayload {
  url: string;
  traceId?: string;
  experimentId?: string;
  sessionId?: string;
  buildRequestId?: string;
  serverId?: string;
  ragEnabled?: boolean;
  dynamicSkillSelection?: boolean;
  skillSelectionVariant?: "static" | "dynamic";
  variantId?: string;
}

export type SkillSelectionMode = "static" | "dynamic";

export interface DashboardRunVariant {
  ragEnabled: boolean;
  dynamicSkillSelection: boolean;
  skillSelectionVariant: "static" | "dynamic";
  variantId: string;
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

export function buildDashboardRunVariant({
  ragEnabled,
  skillSelectionMode,
}: {
  ragEnabled: boolean;
  skillSelectionMode: SkillSelectionMode;
}): DashboardRunVariant {
  const dynamicSkillSelection = skillSelectionMode === "dynamic";
  const skillSelectionVariant = dynamicSkillSelection ? "dynamic" : "static";
  return {
    ragEnabled: Boolean(ragEnabled),
    dynamicSkillSelection,
    skillSelectionVariant,
    variantId: `${skillSelectionVariant}-rag-${ragEnabled ? "on" : "off"}`,
  };
}

export function buildChatRunRequestPayload({
  context,
  ragEnabled,
  skillSelectionMode,
}: {
  context: ResearchCorrelationContext;
  ragEnabled: boolean;
  skillSelectionMode: SkillSelectionMode;
}) {
  return {
    sessionId: context.sessionId,
    buildRequestId: context.buildRequestId,
    traceId: context.traceId,
    experimentId: context.experimentId,
    ...buildDashboardRunVariant({ ragEnabled, skillSelectionMode }),
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
    ragEnabled: context?.ragEnabled,
    dynamicSkillSelection: context?.dynamicSkillSelection,
    skillSelectionVariant: context?.skillSelectionVariant,
    variantId: context?.variantId,
  };
}
