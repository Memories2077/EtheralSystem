import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { FeedbackTracker } from "../feedback.js";
import type { GenerationOutcome, SkillGap } from "../types.js";

describe("Phase 3: FeedbackTracker - Learning Loop", () => {
  let tracker: FeedbackTracker;

  beforeEach(() => {
    tracker = new FeedbackTracker();
  });

  afterEach(() => {
    tracker.reset();
  });

  describe("GenerationOutcome (new schema)", () => {
    it("should record full GenerationOutcome with quality metrics", async () => {
      const outcome: GenerationOutcome = {
        requestId: "req-1",
        timestamp: new Date(),
        specProfile: {} as any,
        selectedSkillIds: ["mcp_system", "zod_mapping"],
        skillConfidences: { mcp_system: 0.9, zod_mapping: 0.8 },
        llmCalls: 3,
        tokenCount: 5000,
        generationTimeMs: 2000,
        validationPassed: true,
        validationErrors: [],
        requiredRetries: 0,
        codeQuality: {
          hasProperErrorHandling: true,
          usesHelperFunctions: true,
          structureCorrect: true,
          authImplemented: false,
          zodSchemasValid: true,
        },
        reviewerRating: 4,
        manualFixesRequired: [],
      };

      await tracker.recordOutcome(outcome);

      const eff = tracker.getEffectiveness("mcp_system");
      expect(eff?.timesUsed).toBe(1);
      expect(eff?.successCount).toBe(1);
      expect(eff?.bayesianSuccessRate).toBeCloseTo(2 / 3); // (1+1)/(1+2)
      expect(eff?.avgRetries).toBe(0);
      expect(eff?.avgQualityScore).toBeGreaterThan(0);
    });

    it("should handle failed outcome with validation errors", async () => {
      const outcome: GenerationOutcome = {
        requestId: "req-2",
        timestamp: new Date(),
        specProfile: {
          auth: { types: [], hasAuth: false, schemes: [] },
          structure: {
            endpointCount: 5,
            pathCount: 5,
            hasStreaming: false,
            hasWebhooks: false,
          },
          data: {
            hasFileUpload: false,
            hasBinaryResponse: false,
            contentTypes: [],
          },
          patterns: {
            pagination: "none",
            rateLimiting: false,
            hasFiltering: false,
            hasSorting: false,
          },
          errors: { format: "json", hasStandardErrorSchema: false },
          guidance: { complexityScore: 10, recommendedSkills: [] },
        } as any,
        selectedSkillIds: ["mcp_system", "mcp_anti_contamination"],
        skillConfidences: {},
        llmCalls: 5,
        tokenCount: 8000,
        generationTimeMs: 5000,
        validationPassed: false,
        validationErrors: [
          "Rate limiting not implemented",
          "File upload handling missing",
        ],
        requiredRetries: 2,
        codeQuality: {
          hasProperErrorHandling: false,
          usesHelperFunctions: false,
          structureCorrect: false,
          authImplemented: false,
          zodSchemasValid: false,
        },
      };

      await tracker.recordOutcome(outcome);

      expect(tracker.getSuccessRate("mcp_system")).toBe(0);
      expect(tracker.getBayesianSuccessRate("mcp_system")).toBeCloseTo(1 / 3); // (0+1)/(1+2)
    });
  });

  describe("Bayesian Success Rate", () => {
    it("should apply Bayesian smoothing (successes + 1) / (total + 2)", async () => {
      const outcome: GenerationOutcome = {
        requestId: "req-bayes-1",
        timestamp: new Date(),
        specProfile: {} as any,
        selectedSkillIds: ["skill_x"],
        skillConfidences: {},
        llmCalls: 1,
        tokenCount: 1000,
        generationTimeMs: 500,
        validationPassed: true,
        validationErrors: [],
        requiredRetries: 0,
        codeQuality: {
          hasProperErrorHandling: true,
          usesHelperFunctions: true,
          structureCorrect: true,
          authImplemented: true,
          zodSchemasValid: true,
        },
      };

      await tracker.recordOutcome(outcome);

      const eff = tracker.getEffectiveness("skill_x");
      // (1 success + 1) / (1 total + 2) = 2/3
      expect(eff?.bayesianSuccessRate).toBeCloseTo(2 / 3);
    });

    it("should return 0.5 prior for unknown skill", () => {
      const rate = tracker.getBayesianSuccessRate("unknown_skill");
      expect(rate).toBe(0.5);
    });

    it("should update Bayesian rate with multiple outcomes", async () => {
      for (let i = 0; i < 3; i++) {
        await tracker.recordOutcome({
          requestId: `req-${i}`,
          timestamp: new Date(),
          specProfile: {} as any,
          selectedSkillIds: ["skill_y"],
          skillConfidences: {},
          llmCalls: 1,
          tokenCount: 1000,
          generationTimeMs: 500,
          validationPassed: true,
          validationErrors: [],
          requiredRetries: 0,
          codeQuality: {
            hasProperErrorHandling: true,
            usesHelperFunctions: true,
            structureCorrect: true,
            authImplemented: true,
            zodSchemasValid: true,
          },
        });
      }

      // 3 successes: (3+1)/(3+2) = 4/5 = 0.8
      const rate = tracker.getBayesianSuccessRate("skill_y");
      expect(rate).toBeCloseTo(0.8);
    });
  });

  describe("Skill Gap Detection", () => {
    it("should detect gaps from validation errors", async () => {
      const outcome: GenerationOutcome = {
        requestId: "req-gap-1",
        timestamp: new Date(),
        specProfile: {
          auth: { types: ["oauth2"], hasAuth: true, schemes: [] },
          structure: {
            endpointCount: 10,
            pathCount: 10,
            hasStreaming: false,
            hasWebhooks: false,
          },
          data: {
            hasFileUpload: true,
            hasBinaryResponse: false,
            contentTypes: ["multipart/form-data"],
          },
          patterns: {
            pagination: "cursor",
            rateLimiting: false,
            hasFiltering: false,
            hasSorting: false,
          },
          errors: { format: "json", hasStandardErrorSchema: false },
          guidance: { complexityScore: 30, recommendedSkills: [] },
        } as any,
        selectedSkillIds: ["mcp_system"],
        skillConfidences: {},
        llmCalls: 3,
        tokenCount: 5000,
        generationTimeMs: 3000,
        validationPassed: false,
        validationErrors: [
          "Rate limiting headers not found",
          "File upload handling missing in generated code",
        ],
        requiredRetries: 1,
        codeQuality: {
          hasProperErrorHandling: false,
          usesHelperFunctions: false,
          structureCorrect: true,
          authImplemented: true,
          zodSchemasValid: true,
        },
      };

      await tracker.recordOutcome(outcome);

      const gaps = tracker.getSkillGaps("open");
      expect(gaps.length).toBeGreaterThan(0);

      const rateLimitGap = gaps.find((g) =>
        g.errorPatterns.includes("rate_limiting"),
      );
      expect(rateLimitGap).toBeDefined();
      expect(rateLimitGap?.suggestedSkill).toBe("patterns.rate_limiting");
      expect(rateLimitGap?.status).toBe("open");
    });

    it("should aggregate duplicate gap detections", async () => {
      const baseOutcome: GenerationOutcome = {
        requestId: "req-dup-1",
        timestamp: new Date(),
        specProfile: {} as any,
        selectedSkillIds: ["mcp_system"],
        skillConfidences: {},
        llmCalls: 2,
        tokenCount: 4000,
        generationTimeMs: 2000,
        validationPassed: false,
        validationErrors: ["Rate limiting not implemented"],
        requiredRetries: 1,
        codeQuality: {
          hasProperErrorHandling: false,
          usesHelperFunctions: false,
          structureCorrect: false,
          authImplemented: false,
          zodSchemasValid: false,
        },
      };

      await tracker.recordOutcome(baseOutcome);

      // Second failure with same error
      await tracker.recordOutcome({
        ...baseOutcome,
        requestId: "req-dup-2",
      });

      const gaps = tracker.getSkillGaps("open");
      const rateLimitGap = gaps.find((g) =>
        g.errorPatterns.includes("rate_limiting"),
      );
      expect(rateLimitGap?.frequency).toBe(2);
    });

    it("should update gap status", async () => {
      const outcome: GenerationOutcome = {
        requestId: "req-status-1",
        timestamp: new Date(),
        specProfile: {} as any,
        selectedSkillIds: ["mcp_system"],
        skillConfidences: {},
        llmCalls: 2,
        tokenCount: 3000,
        generationTimeMs: 1500,
        validationPassed: false,
        validationErrors: ["Streaming response not handled"],
        requiredRetries: 1,
        codeQuality: {
          hasProperErrorHandling: false,
          usesHelperFunctions: false,
          structureCorrect: false,
          authImplemented: false,
          zodSchemasValid: false,
        },
      };

      await tracker.recordOutcome(outcome);

      const gaps = tracker.getSkillGaps("open");
      const gap = gaps.find((g) => g.errorPatterns.includes("streaming"));
      expect(gap).toBeDefined();

      const updated = tracker.updateGapStatus(gap!.id, "addressed");
      expect(updated).toBe(true);

      const openGaps = tracker.getSkillGaps("open");
      expect(openGaps.find((g) => g.id === gap!.id)).toBeUndefined();
    });
  });

  describe("Top Skills Ranking", () => {
    it("should rank skills by Bayesian success rate", async () => {
      // Record outcomes for skill_a: 2/2 success
      for (let i = 0; i < 2; i++) {
        await tracker.recordOutcome({
          requestId: `req-a-${i}`,
          timestamp: new Date(),
          specProfile: {} as any,
          selectedSkillIds: ["skill_a"],
          skillConfidences: {},
          llmCalls: 1,
          tokenCount: 1000,
          generationTimeMs: 500,
          validationPassed: true,
          validationErrors: [],
          requiredRetries: 0,
          codeQuality: {
            hasProperErrorHandling: true,
            usesHelperFunctions: true,
            structureCorrect: true,
            authImplemented: true,
            zodSchemasValid: true,
          },
        });
      }

      // Record outcomes for skill_b: 0/1 success
      await tracker.recordOutcome({
        requestId: "req-b-1",
        timestamp: new Date(),
        specProfile: {} as any,
        selectedSkillIds: ["skill_b"],
        skillConfidences: {},
        llmCalls: 1,
        tokenCount: 1000,
        generationTimeMs: 500,
        validationPassed: false,
        validationErrors: ["error"],
        requiredRetries: 2,
        codeQuality: {
          hasProperErrorHandling: false,
          usesHelperFunctions: false,
          structureCorrect: false,
          authImplemented: false,
          zodSchemasValid: false,
        },
      });

      const top = tracker.getTopSkills(5);
      expect(top.length).toBeGreaterThan(0);
      // skill_a should outrank skill_b
      const idxA = top.findIndex((s) => s.skillId === "skill_a");
      const idxB = top.findIndex((s) => s.skillId === "skill_b");
      expect(idxA).toBeLessThan(idxB);
    });
  });

  describe("Human Feedback Bridge", () => {
    const createOutcome = (
      overrides: Partial<GenerationOutcome> = {},
    ): GenerationOutcome => ({
      requestId: "req-human-1",
      serverId: "server-human-1",
      timestamp: new Date("2026-01-01T00:00:00Z"),
      specProfile: {} as any,
      selectedSkillIds: ["auth_requirements", "zod_mapping"],
      skillConfidences: {},
      llmCalls: 1,
      tokenCount: 1000,
      generationTimeMs: 500,
      validationPassed: true,
      validationErrors: [],
      requiredRetries: 0,
      codeQuality: {
        hasProperErrorHandling: true,
        usesHelperFunctions: true,
        structureCorrect: true,
        authImplemented: true,
        zodSchemasValid: true,
      },
      manualFixesRequired: [],
      ...overrides,
    });

    it("should import likes and dislikes into skill effectiveness with comment attribution", async () => {
      await tracker.recordOutcome(createOutcome());

      const summary = await tracker.importHumanFeedbackFromLogs([
        {
          serverId: "server-human-1",
          feedbacks: [
            {
              feedbackId: "fb-like-1",
              type: "like",
              timestamp: new Date("2026-01-02T00:00:00Z"),
            },
            {
              feedbackId: "fb-dislike-1",
              type: "dislike",
              comment: "Broken auth token handling at runtime",
              timestamp: new Date("2026-01-03T00:00:00Z"),
            },
          ],
        } as any,
      ]);

      expect(summary.scannedLogs).toBe(1);
      expect(summary.matchedOutcomes).toBe(1);
      expect(summary.importedFeedbacks).toBe(2);
      expect(summary.skippedDuplicates).toBe(0);

      const authEff = tracker.getEffectiveness("auth_requirements");
      const zodEff = tracker.getEffectiveness("zod_mapping");
      expect(authEff?.humanFeedbackScore).toBeLessThan(0);
      expect(authEff?.bayesianSuccessRate).toBeLessThan(2 / 3);
      expect(zodEff?.humanFeedbackScore).toBeGreaterThanOrEqual(0);
    });

    it("should import aggregate like/dislike counts when feedback entries are absent", async () => {
      await tracker.recordOutcome(
        createOutcome({ requestId: "req-counts", serverId: "server-counts" }),
      );

      const summary = await tracker.importHumanFeedbackFromLogs([
        {
          serverId: "server-counts",
          likeCount: 2,
          dislikeCount: 1,
          feedbacks: [],
        },
      ]);

      expect(summary.importedFeedbacks).toBe(3);
      expect(summary.skippedEmptySignals).toBe(0);
      expect(
        tracker.getEffectiveness("auth_requirements")?.humanFeedbackScore,
      ).toBeCloseTo(0.01);
    });

    it("should skip empty logs when there are no comments, feedbacks, or likes", async () => {
      await tracker.recordOutcome(
        createOutcome({ requestId: "req-empty", serverId: "server-empty" }),
      );

      const summary = await tracker.importHumanFeedbackFromLogs([
        {
          serverId: "server-empty",
          likeCount: 0,
          dislikeCount: 0,
          feedbacks: [],
        },
      ]);

      expect(summary.scannedLogs).toBe(1);
      expect(summary.matchedOutcomes).toBe(0);
      expect(summary.importedFeedbacks).toBe(0);
      expect(summary.skippedEmptySignals).toBe(1);
      expect(
        tracker.getEffectiveness("auth_requirements")?.humanFeedbackScore,
      ).toBe(0);
    });

    it("should process imports idempotently and count duplicate feedback IDs", async () => {
      await tracker.recordOutcome(
        createOutcome({
          requestId: "req-dupe-human",
          serverId: "server-dupe-human",
        }),
      );
      const logs = [
        {
          serverId: "server-dupe-human",
          feedbacks: [{ feedbackId: "fb-dupe-1", type: "like" }],
        } as any,
      ];

      const first = await tracker.importHumanFeedbackFromLogs(logs);
      const second = await tracker.importHumanFeedbackFromLogs(logs);

      expect(first.importedFeedbacks).toBe(1);
      expect(second.importedFeedbacks).toBe(0);
      expect(second.skippedDuplicates).toBe(1);
      expect(
        tracker.getEffectiveness("auth_requirements")?.humanFeedbackScore,
      ).toBeCloseTo(0.03);
    });

    it("should use serverId fallback when requestId is missing from logs", async () => {
      await tracker.recordOutcome(
        createOutcome({
          requestId: "req-fallback",
          serverId: "server-fallback",
        }),
      );

      const summary = await tracker.importHumanFeedbackFromLogs([
        {
          serverId: "server-fallback",
          feedbacks: [{ feedbackId: "fb-fallback", type: "like" }],
        } as any,
      ]);

      expect(summary.matchedOutcomes).toBe(1);
      expect(summary.importedFeedbacks).toBe(1);
      expect(
        tracker.getEffectiveness("auth_requirements")?.humanFeedbackScore,
      ).toBeCloseTo(0.03);
    });

    it("should use buildRequestId fallback when feedback comes from chatbot server logs", async () => {
      await tracker.recordOutcome(
        createOutcome({
          requestId: "build-request-1",
          buildRequestId: "build-request-1",
          serverId: undefined,
        }),
      );

      const summary = await tracker.importHumanFeedbackFromLogs([
        {
          serverId: "generated-server-1",
          buildRequestId: "build-request-1",
          feedbacks: [{ feedbackId: "fb-build-id", type: "like" }],
        } as any,
      ]);

      expect(summary.matchedOutcomes).toBe(1);
      expect(summary.importedFeedbacks).toBe(1);
      expect(
        tracker.getEffectiveness("auth_requirements")?.humanFeedbackScore,
      ).toBeCloseTo(0.03);
    });

    it("should ignore logs that cannot be linked to a skill feedback outcome", async () => {
      const summary = await tracker.importHumanFeedbackFromLogs([
        {
          serverId: "missing-server",
          feedbacks: [{ feedbackId: "fb-missing", type: "like" }],
        } as any,
      ]);

      expect(summary.scannedLogs).toBe(1);
      expect(summary.matchedOutcomes).toBe(0);
      expect(summary.importedFeedbacks).toBe(0);
    });
  });

  describe("Backward Compatibility", () => {
    it("should accept legacy outcome format", async () => {
      const legacyOutcome = {
        serverId: "server-1",
        specProfile: {} as any,
        skillsUsed: ["mcp_system"],
        success: true,
        buildDurationMs: 1000,
        tokenUsage: 5000,
      };

      await tracker.recordOutcome(legacyOutcome as any);

      expect(tracker.getSuccessRate("mcp_system")).toBe(1);
    });
  });
});
