import { describe, expect, it } from "bun:test";
import { buildResearchVariantEnv } from "./rag-env";

describe("research RAG variant environment", () => {
  it("turns RAG off for static and dynamic rag-off variants", () => {
    const staticEnv = buildResearchVariantEnv({
      variant: { id: "static-rag-off", dynamicSkillSelection: "false", skillSelectionVariant: "static", ragEnabled: "false" },
      experimentId: "rag-test",
      eventsPath: "/repo/reports/rag-test/events.jsonl",
      baseEnv: {},
    });
    const dynamicEnv = buildResearchVariantEnv({
      variant: { id: "dynamic-rag-off", dynamicSkillSelection: "true", skillSelectionVariant: "dynamic", ragEnabled: "false" },
      experimentId: "rag-test",
      eventsPath: "/repo/reports/rag-test/events.jsonl",
      baseEnv: {},
    });

    expect(staticEnv.RAG_ENABLED).toBe("false");
    expect(staticEnv.VARIANT_ID).toBe("static-rag-off");
    expect(dynamicEnv.RAG_ENABLED).toBe("false");
    expect(dynamicEnv.DYNAMIC_SKILL_SELECTION).toBe("true");
    expect(dynamicEnv.VARIANT_ID).toBe("dynamic-rag-off");
  });

  it("turns RAG on for rag-on variants and keeps metrics enabled", () => {
    const env = buildResearchVariantEnv({
      variant: { id: "dynamic-rag-on", dynamicSkillSelection: "true", skillSelectionVariant: "dynamic", ragEnabled: "true" },
      experimentId: "rag-test",
      eventsPath: "/repo/reports/rag-test/events.jsonl",
      baseEnv: {},
    });

    expect(env.RAG_ENABLED).toBe("true");
    expect(env.VARIANT_ID).toBe("dynamic-rag-on");
    expect(env.RESEARCH_METRICS_ENABLED).toBe("true");
    expect(env.RESEARCH_EXPERIMENT_ID).toBe("rag-test");
    expect(env.RESEARCH_EVENTS_JSONL_PATH).toBe("/repo/reports/rag-test/events.jsonl");
  });
});
