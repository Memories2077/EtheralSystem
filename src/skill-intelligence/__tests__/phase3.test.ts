import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { FeedbackTracker } from '../feedback.js';
import type { GenerationOutcome, SkillGap } from '../types.js';

describe('Phase 3: FeedbackTracker - Learning Loop', () => {
  let tracker: FeedbackTracker;

  beforeEach(() => {
    tracker = new FeedbackTracker();
  });

  afterEach(() => {
    tracker.reset();
  });

  describe('GenerationOutcome (new schema)', () => {
    it('should record full GenerationOutcome with quality metrics', async () => {
      const outcome: GenerationOutcome = {
        requestId: 'req-1',
        timestamp: new Date(),
        specProfile: {} as any,
        selectedSkillIds: ['mcp_system', 'zod_mapping'],
        skillConfidences: { 'mcp_system': 0.9, 'zod_mapping': 0.8 },
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

      const eff = tracker.getEffectiveness('mcp_system');
      expect(eff?.timesUsed).toBe(1);
      expect(eff?.successCount).toBe(1);
      expect(eff?.bayesianSuccessRate).toBeCloseTo(2 / 3); // (1+1)/(1+2)
      expect(eff?.avgRetries).toBe(0);
      expect(eff?.avgQualityScore).toBeGreaterThan(0);
    });

    it('should handle failed outcome with validation errors', async () => {
      const outcome: GenerationOutcome = {
        requestId: 'req-2',
        timestamp: new Date(),
        specProfile: {
          auth: { types: [], hasAuth: false, schemes: [] },
          structure: { endpointCount: 5, pathCount: 5, hasStreaming: false, hasWebhooks: false },
          data: { hasFileUpload: false, hasBinaryResponse: false, contentTypes: [] },
          patterns: { pagination: 'none', rateLimiting: false, hasFiltering: false, hasSorting: false },
          errors: { format: 'json', hasStandardErrorSchema: false },
          guidance: { complexityScore: 10, recommendedSkills: [] },
        } as any,
        selectedSkillIds: ['mcp_system', 'mcp_anti_contamination'],
        skillConfidences: {},
        llmCalls: 5,
        tokenCount: 8000,
        generationTimeMs: 5000,
        validationPassed: false,
        validationErrors: ['Rate limiting not implemented', 'File upload handling missing'],
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

      expect(tracker.getSuccessRate('mcp_system')).toBe(0);
      expect(tracker.getBayesianSuccessRate('mcp_system')).toBeCloseTo(1 / 3); // (0+1)/(1+2)
    });
  });

  describe('Bayesian Success Rate', () => {
    it('should apply Bayesian smoothing (successes + 1) / (total + 2)', async () => {
      const outcome: GenerationOutcome = {
        requestId: 'req-bayes-1',
        timestamp: new Date(),
        specProfile: {} as any,
        selectedSkillIds: ['skill_x'],
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

      const eff = tracker.getEffectiveness('skill_x');
      // (1 success + 1) / (1 total + 2) = 2/3
      expect(eff?.bayesianSuccessRate).toBeCloseTo(2 / 3);
    });

    it('should return 0.5 prior for unknown skill', () => {
      const rate = tracker.getBayesianSuccessRate('unknown_skill');
      expect(rate).toBe(0.5);
    });

    it('should update Bayesian rate with multiple outcomes', async () => {
      for (let i = 0; i < 3; i++) {
        await tracker.recordOutcome({
          requestId: `req-${i}`,
          timestamp: new Date(),
          specProfile: {} as any,
          selectedSkillIds: ['skill_y'],
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
      const rate = tracker.getBayesianSuccessRate('skill_y');
      expect(rate).toBeCloseTo(0.8);
    });
  });

  describe('Skill Gap Detection', () => {
    it('should detect gaps from validation errors', async () => {
      const outcome: GenerationOutcome = {
        requestId: 'req-gap-1',
        timestamp: new Date(),
        specProfile: {
          auth: { types: ['oauth2'], hasAuth: true, schemes: [] },
          structure: { endpointCount: 10, pathCount: 10, hasStreaming: false, hasWebhooks: false },
          data: { hasFileUpload: true, hasBinaryResponse: false, contentTypes: ['multipart/form-data'] },
          patterns: { pagination: 'cursor', rateLimiting: false, hasFiltering: false, hasSorting: false },
          errors: { format: 'json', hasStandardErrorSchema: false },
          guidance: { complexityScore: 30, recommendedSkills: [] },
        } as any,
        selectedSkillIds: ['mcp_system'],
        skillConfidences: {},
        llmCalls: 3,
        tokenCount: 5000,
        generationTimeMs: 3000,
        validationPassed: false,
        validationErrors: ['Rate limiting headers not found', 'File upload handling missing in generated code'],
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

      const gaps = tracker.getSkillGaps('open');
      expect(gaps.length).toBeGreaterThan(0);

      const rateLimitGap = gaps.find(g => g.errorPatterns.includes('rate_limiting'));
      expect(rateLimitGap).toBeDefined();
      expect(rateLimitGap?.suggestedSkill).toBe('patterns.rate_limiting');
      expect(rateLimitGap?.status).toBe('open');
    });

    it('should aggregate duplicate gap detections', async () => {
      const baseOutcome: GenerationOutcome = {
        requestId: 'req-dup-1',
        timestamp: new Date(),
        specProfile: {} as any,
        selectedSkillIds: ['mcp_system'],
        skillConfidences: {},
        llmCalls: 2,
        tokenCount: 4000,
        generationTimeMs: 2000,
        validationPassed: false,
        validationErrors: ['Rate limiting not implemented'],
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
        requestId: 'req-dup-2',
      });

      const gaps = tracker.getSkillGaps('open');
      const rateLimitGap = gaps.find(g => g.errorPatterns.includes('rate_limiting'));
      expect(rateLimitGap?.frequency).toBe(2);
    });

    it('should update gap status', async () => {
      const outcome: GenerationOutcome = {
        requestId: 'req-status-1',
        timestamp: new Date(),
        specProfile: {} as any,
        selectedSkillIds: ['mcp_system'],
        skillConfidences: {},
        llmCalls: 2,
        tokenCount: 3000,
        generationTimeMs: 1500,
        validationPassed: false,
        validationErrors: ['Streaming response not handled'],
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

      const gaps = tracker.getSkillGaps('open');
      const gap = gaps.find(g => g.errorPatterns.includes('streaming'));
      expect(gap).toBeDefined();

      const updated = tracker.updateGapStatus(gap!.id, 'addressed');
      expect(updated).toBe(true);

      const openGaps = tracker.getSkillGaps('open');
      expect(openGaps.find(g => g.id === gap!.id)).toBeUndefined();
    });
  });

  describe('Top Skills Ranking', () => {
    it('should rank skills by Bayesian success rate', async () => {
      // Record outcomes for skill_a: 2/2 success
      for (let i = 0; i < 2; i++) {
        await tracker.recordOutcome({
          requestId: `req-a-${i}`,
          timestamp: new Date(),
          specProfile: {} as any,
          selectedSkillIds: ['skill_a'],
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
        requestId: 'req-b-1',
        timestamp: new Date(),
        specProfile: {} as any,
        selectedSkillIds: ['skill_b'],
        skillConfidences: {},
        llmCalls: 1,
        tokenCount: 1000,
        generationTimeMs: 500,
        validationPassed: false,
        validationErrors: ['error'],
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
      const idxA = top.findIndex(s => s.skillId === 'skill_a');
      const idxB = top.findIndex(s => s.skillId === 'skill_b');
      expect(idxA).toBeLessThan(idxB);
    });
  });

  describe('Backward Compatibility', () => {
    it('should accept legacy outcome format', async () => {
      const legacyOutcome = {
        serverId: 'server-1',
        specProfile: {} as any,
        skillsUsed: ['mcp_system'],
        success: true,
        buildDurationMs: 1000,
        tokenUsage: 5000,
      };

      await tracker.recordOutcome(legacyOutcome as any);

      expect(tracker.getSuccessRate('mcp_system')).toBe(1);
    });
  });
});
