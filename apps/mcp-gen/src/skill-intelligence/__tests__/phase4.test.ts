import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { SkillSelectionAgent } from "../agent.js";
import { SkillRegistry } from "../registry.js";
import { ProfileCache } from "../cache.js";
import type { SpecProfile, SkillScore } from "../types.js";

const SIMPLE_SPEC = `openapi: 3.0.3
info:
  title: Simple API
  version: 1.0.0
paths:
  /health:
    get:
      responses:
        '200':
          description: OK
`;

const profile: SpecProfile = {
  auth: { types: [], hasAuth: false, schemes: [] },
  structure: {
    endpointCount: 1,
    pathCount: 1,
    hasStreaming: false,
    hasWebhooks: false,
  },
  data: { hasFileUpload: false, hasBinaryResponse: false, contentTypes: [] },
  patterns: {
    pagination: "none",
    rateLimiting: false,
    hasFiltering: false,
    hasSorting: false,
  },
  errors: { format: "json", hasStandardErrorSchema: false },
  guidance: { complexityScore: 5, recommendedSkills: [] },
};

describe("Phase 4: Advanced Features & Polish", () => {
  beforeEach(() => {
    SkillSelectionAgent.resetInstance();
    SkillRegistry.resetInstance();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    SkillSelectionAgent.resetInstance();
    SkillRegistry.resetInstance();
  });

  it("guards initialization so concurrent first requests share one registry initialization", async () => {
    const registrySpy = vi.spyOn(SkillRegistry.prototype as any, "initialize");
    const agent = SkillSelectionAgent.getInstance({
      skillsBaseDir: "src/skills",
    });

    const [first, second] = await Promise.all([
      agent.initialize(),
      agent.initialize(),
    ]);

    expect(registrySpy).toHaveBeenCalledTimes(1);
    expect(agent.isInitialized()).toBe(true);
    expect(first.warmedSkillCount).toBeGreaterThan(0);
    expect(second.warmedSkillCount).toBe(first.warmedSkillCount);
  });

  it("tracks spec profile cache hits and timing metrics", async () => {
    const agent = SkillSelectionAgent.getInstance({
      skillsBaseDir: "src/skills",
    });
    await agent.initialize();

    const first = agent.analyzeSpec(SIMPLE_SPEC);
    const second = agent.analyzeSpec(SIMPLE_SPEC);
    const metrics = agent.getMetrics();

    expect(second).toEqual(first);
    expect(metrics.analysisCount).toBe(2);
    expect(metrics.analysisCacheMisses).toBe(1);
    expect(metrics.analysisCacheHits).toBe(1);
    expect(metrics.cacheHitRate).toBeCloseTo(0.5);
    expect(metrics.lastAnalysisDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("records selection metrics including confidence and selected count", async () => {
    const agent = SkillSelectionAgent.getInstance({
      skillsBaseDir: "src/skills",
    });
    await agent.initialize();

    const composition = agent.selectSkills(profile);
    const metrics = agent.getMetrics();

    expect(metrics.lastCompositionDurationMs).toBeGreaterThanOrEqual(0);
    expect(metrics.lastSelectedCount).toBe(composition.skills.length);
    expect(metrics.lastSelectionConfidence).toBe(
      composition.averageConfidence ?? 0,
    );
  });

  it("ProfileCache exposes LRU hit-rate metrics", () => {
    const cache = new ProfileCache(2);
    cache.set("a", profile);
    cache.set("b", profile);

    expect(cache.get("a")).toEqual(profile);
    cache.set("c", profile);

    expect(cache.get("b")).toBeNull();
    expect(cache.get("a")).toEqual(profile);
    const stats = cache.getStats();

    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(2 / 3);
  });

  it("falls back to safe skills when average confidence is below threshold", async () => {
    const agent = SkillSelectionAgent.getInstance({
      skillsBaseDir: "src/skills",
    });
    await agent.initialize();
    const composer = agent.getComposer() as any;
    const originalScoreSkill = composer.scoreSkill;

    composer.scoreSkill = (skill: any): SkillScore => ({
      skillId: skill.id,
      score: 0.1,
      confidence: 0.01,
      reasons: ["forced low confidence"],
      metadata: skill,
    });

    const composition = agent.selectSkills(profile);
    composer.scoreSkill = originalScoreSkill;

    expect(composition.fallbackReason).toContain("below threshold");
    expect(
      composition.skills.every((skill) => {
        const id = skill.skillId.toLowerCase();
        return (
          id.includes("system") ||
          id.includes("anti_contamination") ||
          id.includes("requirements") ||
          id.includes("zod_mapping")
        );
      }),
    ).toBe(true);
  });
});
