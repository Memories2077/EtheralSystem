import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { SkillSelectionAgent } from '../agent.js';
import { SkillComposer } from '../composer.js';
import { SkillRegistry } from '../registry.js';
import type { SpecProfile } from '../types.js';

describe('Phase 2: Core Selection Integration Tests', () => {
  let agent: SkillSelectionAgent;

  beforeEach(async () => {
    SkillRegistry.resetInstance();
    agent = SkillSelectionAgent.getInstance({
      skillsBaseDir: 'src/skills',
      tokenBudget: 30_000,
    });
    await agent.initialize();
  });

  afterEach(() => {
    SkillRegistry.resetInstance();
  });

  describe('Reddit-like API (with OAuth2 auth)', () => {
    const redditSpec = `
openapi: 3.0.0
info:
  title: Reddit API
  version: 1.0.0
paths:
  /api/v1/hot:
    get:
      security:
        - oauth2: [read]
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
        - name: after
          in: query
          schema:
            type: string
components:
  securitySchemes:
    oauth2:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://www.reddit.com/api/v1/authorize
          tokenUrl: https://www.reddit.com/api/v1/access_token
          scopes:
            read: Read access
`;

    it('should detect auth and select auth skills', () => {
      const profile = agent.analyzeSpec(redditSpec);

      expect(profile.auth.hasAuth).toBe(true);
      expect(profile.auth.types).toContain('oauth2');
      expect(profile.patterns.pagination).toBe('cursor'); // 'after' param
    });

    it('should select auth requirements skill for OAuth2', () => {
      const profile = agent.analyzeSpec(redditSpec);
      const composition = agent.selectSkills(profile);

      const authSkills = composition.skills.filter(s =>
        s.skillId.includes('requirements') && s.skillId.includes('mcp')
      );
      expect(authSkills.length).toBeGreaterThan(0);
    });

    it('should select pagination-related skills for cursor pagination', () => {
      const profile = agent.analyzeSpec(redditSpec);
      const composition = agent.selectSkills(profile);

      const hasPagination = composition.skills.some(s =>
        s.metadata.tags?.some((t: string) => t.includes('pagination'))
      );
      expect(hasPagination).toBe(true);
    });

    it('should include system and zod_mapping skills', () => {
      const profile = agent.analyzeSpec(redditSpec);
      const composition = agent.selectSkills(profile);

      const hasSystem = composition.skills.some(s => s.skillId === 'mcp_system');
      const hasZod = composition.skills.some(s => s.skillId === 'mcp_zod_mapping');

      expect(hasSystem).toBe(true);
      expect(hasZod).toBe(true);
    });
  });

  describe('Simple API (no auth)', () => {
    const simpleSpec = `
openapi: 3.0.0
info:
  title: Simple API
  version: 1.0.0
paths:
  /health:
    get:
      responses:
        '200':
          description: OK
  /api/data:
    get:
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
      responses:
        '200':
          description: OK
`;

    it('should detect no auth', () => {
      const profile = agent.analyzeSpec(simpleSpec);

      expect(profile.auth.hasAuth).toBe(false);
      expect(profile.auth.types).toHaveLength(0);
    });

    it('should select anti-contamination skill instead of requirements', () => {
      const profile = agent.analyzeSpec(simpleSpec);
      const composition = agent.selectSkills(profile);

      const hasAntiContamination = composition.skills.some(s =>
        s.skillId.includes('anti_contamination')
      );
      const hasRequirements = composition.skills.some(s =>
        s.skillId.includes('requirements') && !s.skillId.includes('anti')
      );

      expect(hasAntiContamination).toBe(true);
      expect(hasRequirements).toBe(false);
    });

    it('should select minimal skills for simple API', () => {
      const profile = agent.analyzeSpec(simpleSpec);
      const composition = agent.selectSkills(profile);

      // Should have system, anti-contamination, zod_mapping, request_patterns
      expect(composition.skills.length).toBeGreaterThan(0);
      expect(composition.skills.length).toBeLessThan(10);
    });

    it('should not exceed token budget', () => {
      const profile = agent.analyzeSpec(simpleSpec);
      const composition = agent.selectSkills(profile);

      expect(composition.totalTokens).toBeLessThanOrEqual(30_000);
    });
  });

  describe('Token budget enforcement', () => {
    it('should respect token budget with large spec', () => {
      // Create a spec with many endpoints to trigger more skills
      let paths = '';
      for (let i = 0; i < 50; i++) {
        paths += `  /api/endpoint${i}:\n    get:\n      responses:\n        '200':\n          description: OK\n`;
      }

      const largeSpec = `
openapi: 3.0.0
info:
  title: Large API
  version: 1.0.0
paths:
${paths}`;

      const profile = agent.analyzeSpec(largeSpec);
      const composition = agent.selectSkills(profile);

      expect(composition.totalTokens).toBeLessThanOrEqual(30_000);
    });

    it('should skip skills that exceed remaining budget', () => {
      const composer = new SkillComposer({ tokenBudget: 1000 });
      const registry = SkillRegistry.getInstance();
      composer.setRegistry(registry);

      const profile: SpecProfile = {
        auth: { types: [], hasAuth: false, schemes: [] },
        structure: { endpointCount: 5, pathCount: 5, hasStreaming: false, hasWebhooks: false },
        data: { hasFileUpload: false, hasBinaryResponse: false, contentTypes: [] },
        patterns: { pagination: 'none', rateLimiting: false, hasFiltering: false, hasSorting: false },
        errors: { format: 'json', hasStandardErrorSchema: false },
        guidance: { complexityScore: 10, recommendedSkills: [] },
      };

      const composition = composer.composeSkills(profile);

      // All selected skills should fit within budget
      expect(composition.totalTokens).toBeLessThanOrEqual(1000);
    });
  });

  describe('Conflict resolution', () => {
    it('should not select both requirements and anti-contamination', () => {
      const profile: SpecProfile = {
        auth: { types: ['oauth2'], hasAuth: true, schemes: [] },
        structure: { endpointCount: 10, pathCount: 10, hasStreaming: false, hasWebhooks: false },
        data: { hasFileUpload: false, hasBinaryResponse: false, contentTypes: [] },
        patterns: { pagination: 'cursor', rateLimiting: false, hasFiltering: false, hasSorting: false },
        errors: { format: 'json', hasStandardErrorSchema: false },
        guidance: { complexityScore: 30, recommendedSkills: [] },
      };

      const composition = agent.selectSkills(profile);

      const hasReq = composition.skills.some(s => s.skillId === 'mcp_requirements');
      const hasAnti = composition.skills.some(s => s.skillId === 'mcp_anti_contamination');

      // Should not have both
      if (hasReq) expect(hasAnti).toBe(false);
      if (hasAnti) expect(hasReq).toBe(false);
    });
  });

  describe('Coverage guarantees', () => {
    it('should always include at least one auth skill', () => {
      const profile: SpecProfile = {
        auth: { types: ['apiKey'], hasAuth: true, schemes: [] },
        structure: { endpointCount: 5, pathCount: 5, hasStreaming: false, hasWebhooks: false },
        data: { hasFileUpload: false, hasBinaryResponse: false, contentTypes: [] },
        patterns: { pagination: 'none', rateLimiting: false, hasFiltering: false, hasSorting: false },
        errors: { format: 'json', hasStandardErrorSchema: false },
        guidance: { complexityScore: 20, recommendedSkills: [] },
      };

      const composition = agent.selectSkills(profile);

      const hasAuthSkill = composition.skills.some(s => s.metadata.category === 'auth');
      expect(hasAuthSkill).toBe(true);
    });

    it('should always include at least one system skill', () => {
      const profile: SpecProfile = {
        auth: { types: [], hasAuth: false, schemes: [] },
        structure: { endpointCount: 3, pathCount: 3, hasStreaming: false, hasWebhooks: false },
        data: { hasFileUpload: false, hasBinaryResponse: false, contentTypes: [] },
        patterns: { pagination: 'none', rateLimiting: false, hasFiltering: false, hasSorting: false },
        errors: { format: 'json', hasStandardErrorSchema: false },
        guidance: { complexityScore: 10, recommendedSkills: [] },
      };

      const composition = agent.selectSkills(profile);

      const hasSystemSkill = composition.skills.some(
        s => s.metadata.id.includes('system')
      );
      expect(hasSystemSkill).toBe(true);
    });
  });

  describe('Prompt assembly', () => {
    it('should replace injection points with skill content', () => {
      const profile: SpecProfile = {
        auth: { types: [], hasAuth: false, schemes: [] },
        structure: { endpointCount: 3, pathCount: 3, hasStreaming: false, hasWebhooks: false },
        data: { hasFileUpload: false, hasBinaryResponse: false, contentTypes: [] },
        patterns: { pagination: 'none', rateLimiting: false, hasFiltering: false, hasSorting: false },
        errors: { format: 'json', hasStandardErrorSchema: false },
        guidance: { complexityScore: 10, recommendedSkills: [] },
      };

      const composition = agent.selectSkills(profile);
      const basePrompt = 'System: {{SYSTEM_HEADER}}\n\nUser: {{USER_FOOTER}}';
      const assembled = agent.assemblePrompt(basePrompt, composition);

      // Injection points should be replaced
      expect(assembled).not.toContain('{{SYSTEM_HEADER}}');
      expect(assembled).not.toContain('{{USER_FOOTER}}');
    });

    it('should handle missing injection points gracefully', () => {
      const composition = {
        skills: [],
        totalTokens: 0,
        explanations: {},
      };
      const basePrompt = 'Hello {{NONEXISTENT}} World';
      const assembled = agent.assemblePrompt(basePrompt, composition);

      // Missing injection point should be replaced with empty string
      expect(assembled).toBe('Hello  World');
    });
  });
});
