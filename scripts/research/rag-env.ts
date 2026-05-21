export type ResearchVariantEnvInput = {
  id: string;
  dynamicSkillSelection: "true" | "false";
  skillSelectionVariant: "static" | "dynamic";
  ragEnabled: "true" | "false";
};

export function buildResearchVariantEnv({
  variant,
  experimentId,
  eventsPath,
  baseEnv = process.env,
  researchEventsDb = baseEnv.RESEARCH_EVENTS_DB || "docker",
  researchEventsCollection = baseEnv.RESEARCH_EVENTS_COLLECTION || "research_events",
}: {
  variant: ResearchVariantEnvInput;
  experimentId: string;
  eventsPath: string;
  baseEnv?: NodeJS.ProcessEnv;
  researchEventsDb?: string;
  researchEventsCollection?: string;
}): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    DYNAMIC_SKILL_SELECTION: variant.dynamicSkillSelection,
    SKILL_SELECTION_VARIANT: variant.skillSelectionVariant,
    RAG_ENABLED: variant.ragEnabled,
    VARIANT_ID: variant.id,
    RESEARCH_METRICS_ENABLED: "true",
    RESEARCH_EXPERIMENT_ID: experimentId,
    NEXT_PUBLIC_RESEARCH_EXPERIMENT_ID: experimentId,
    RESEARCH_EVENTS_DB: researchEventsDb,
    RESEARCH_EVENTS_COLLECTION: researchEventsCollection,
    RESEARCH_EVENTS_JSONL_PATH: eventsPath,
    RESEARCH_EVENTS_JSONL_MIRROR: "true",
  };
}
