import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { SkillRegistry } from '../registry.js';
import { SkillSelectionAgent } from '../agent.js';
import { SpecProfileAnalyzer } from '../analyzer.js';
import { SkillComposer } from '../composer.js';
import { FeedbackTracker } from '../feedback.js';
import { ProfileCache } from '../cache.js';
import type { SpecProfile } from '../types.js';

// Sample OpenAPI specs for testing
const REDDIT_SPEC = `openapi: 3.0.3
info:
  title: Reddit API
  description: Reddit OAuth2 API
  version: 1.0.0
paths:
  /api/v1/access_token:
    post:
      summary: Get Access Token
      security:
        - basicAuth: []
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: object
  /api/v1/me:
    get:
      summary: Get current user
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Success
components:
  securitySchemes:
    basicAuth:
      type: http
      scheme: basic
    bearerAuth:
      type: http
      scheme: bearer
`;

const SIMPLE_SPEC = `openapi: 3.0.3
info:
  title: Simple API
  version: 1.0.0
paths:
  /items:
    get:
      summary: List items
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
      responses:
        '200':
          description: Success
  /items/{id}:
    get:
      summary: Get item by id
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Success
`;

describe('SkillRegistry', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    SkillRegistry.resetInstance();
    registry = SkillRegistry.getInstance({ skillsBaseDir: 'src/skills' });
  });

  afterEach(() => {
    SkillRegistry.resetInstance();
  });

  it('should load skills from directory', async () => {
    const errors = await registry.initialize();
    expect(registry.getSkillCount()).toBeGreaterThan(0);
    expect(errors.missingId).toEqual([]);
  });

  it('should retrieve skill by id', async () => {
    await registry.initialize();
    const skill = registry.getSkill('mcp_system');
    expect(skill).toBeDefined();
    expect(skill?.category).toBe('mcp');
  });

  it('should get skills by category', async () => {
    await registry.initialize();
    const mcpSkills = registry.getSkillsByCategory('mcp');
    expect(mcpSkills.length).toBeGreaterThan(0);
    expect(mcpSkills[0].category).toBe('mcp');
  });

  it('should get skills by tag', async () => {
    await registry.initialize();
    const authSkills = registry.getSkillsByTag('auth');
    expect(authSkills.length).toBeGreaterThan(0);
  });

  it('should return undefined for unknown skill', async () => {
    await registry.initialize();
    const skill = registry.getSkill('nonexistent_skill');
    expect(skill).toBeUndefined();
  });
});

describe('SpecProfileAnalyzer', () => {
  let analyzer: SpecProfileAnalyzer;

  beforeEach(() => {
    analyzer = new SpecProfileAnalyzer();
  });

  it('should analyze spec with auth', () => {
    const profile = analyzer.analyzeSpec(REDDIT_SPEC);
    expect(profile.auth.hasAuth).toBe(true);
    expect(profile.auth.types).toContain('http');
    expect(profile.structure.endpointCount).toBe(2);
  });

  it('should analyze spec without auth', () => {
    const profile = analyzer.analyzeSpec(SIMPLE_SPEC);
    expect(profile.auth.hasAuth).toBe(false);
    expect(profile.auth.types).toEqual([]);
    expect(profile.structure.endpointCount).toBe(2);
  });

  it('should detect pagination', () => {
    const spec = SIMPLE_SPEC.replace(
      'parameters:',
      'parameters:\n        - name: cursor\n          in: query\n          schema:\n            type: string'
    );
    const profile = analyzer.analyzeSpec(spec);
    expect(profile.patterns.pagination).toBe('cursor');
  });

  it('should detect file upload', () => {
    const spec = SIMPLE_SPEC.replace(
      'responses:',
      'requestBody:\n        required: true\n        content:\n          multipart/form-data:\n            schema:\n              type: object\n      responses:'
    );
    const profile = analyzer.analyzeSpec(spec);
    expect(profile.data.hasFileUpload).toBe(true);
  });

  it('should return empty profile for invalid input', () => {
    const profile = analyzer.analyzeSpec('not valid yaml');
    expect(profile.auth.hasAuth).toBe(false);
    expect(profile.structure.endpointCount).toBe(0);
  });

  it('should calculate complexity score', () => {
    const profile = analyzer.analyzeSpec(REDDIT_SPEC);
    expect(profile.guidance.complexityScore).toBeGreaterThan(0);
  });
});

describe('SkillComposer', () => {
  let composer: SkillComposer;

  beforeEach(() => {
    composer = new SkillComposer({ tokenBudget: 5000 });
  });

  it('should compose skills for profile with auth', () => {
    const profile: SpecProfile = {
      auth: { types: ['http'], hasAuth: true, schemes: [] },
      structure: { endpointCount: 2, pathCount: 2, hasStreaming: false, hasWebhooks: false },
      data: { hasFileUpload: false, hasBinaryResponse: false, contentTypes: ['application/json'] },
      patterns: { pagination: 'none', rateLimiting: false, hasFiltering: false, hasSorting: false },
      errors: { format: 'json', hasStandardErrorSchema: false },
      guidance: { complexityScore: 20, recommendedSkills: [] },
    };

    // Without registry set, should return empty
    const result = composer.composeSkills(profile);
    expect(result.skills).toEqual([]);
  });
});

describe('FeedbackTracker', () => {
  let tracker: FeedbackTracker;

  beforeEach(() => {
    tracker = new FeedbackTracker();
  });

  it('should record successful outcome', () => {
    tracker.recordOutcome({
      serverId: 'test-1',
      specProfile: {} as SpecProfile,
      skillsUsed: ['mcp_system', 'mcp_user_message'],
      success: true,
      buildDurationMs: 1000,
      tokenUsage: 5000,
    });

    expect(tracker.getSuccessRate('mcp_system')).toBe(1);
    expect(tracker.getSuccessRate('mcp_user_message')).toBe(1);
  });

  it('should record failed outcome', () => {
    tracker.recordOutcome({
      serverId: 'test-2',
      specProfile: {} as SpecProfile,
      skillsUsed: ['mcp_system'],
      success: false,
      errorMessage: 'Build failed',
    });

    expect(tracker.getSuccessRate('mcp_system')).toBe(0);
  });

  it('should track multiple outcomes', () => {
    tracker.recordOutcome({
      serverId: 'test-3',
      specProfile: {} as SpecProfile,
      skillsUsed: ['mcp_system'],
      success: true,
    });
    tracker.recordOutcome({
      serverId: 'test-4',
      specProfile: {} as SpecProfile,
      skillsUsed: ['mcp_system'],
      success: true,
    });

    expect(tracker.getSuccessRate('mcp_system')).toBe(1);
    const eff = tracker.getEffectiveness('mcp_system');
    expect(eff?.timesUsed).toBe(2);
    expect(eff?.successCount).toBe(2);
  });

  it('should return top skills', () => {
    tracker.recordOutcome({
      serverId: 'test-5',
      specProfile: {} as SpecProfile,
      skillsUsed: ['skill_a', 'skill_b'],
      success: true,
    });
    tracker.recordOutcome({
      serverId: 'test-6',
      specProfile: {} as SpecProfile,
      skillsUsed: ['skill_a'],
      success: false,
    });

    const top = tracker.getTopSkills(5);
    expect(top.length).toBeGreaterThan(0);
  });
});

describe('ProfileCache', () => {
  let cache: ProfileCache;

  beforeEach(() => {
    cache = new ProfileCache(10);
  });

  it('should cache and retrieve profiles', () => {
    const profile: SpecProfile = {
      auth: { types: [], hasAuth: false, schemes: [] },
      structure: { endpointCount: 1, pathCount: 1, hasStreaming: false, hasWebhooks: false },
      data: { hasFileUpload: false, hasBinaryResponse: false, contentTypes: [] },
      patterns: { pagination: 'none', rateLimiting: false, hasFiltering: false, hasSorting: false },
      errors: { format: 'json', hasStandardErrorSchema: false },
      guidance: { complexityScore: 5, recommendedSkills: [] },
    };

    cache.set('spec1', profile);
    const retrieved = cache.get('spec1');
    expect(retrieved).toEqual(profile);
  });

  it('should return null for uncached spec', () => {
    const result = cache.get('nonexistent');
    expect(result).toBeNull();
  });

  it('should invalidate cache entries', () => {
    const profile: SpecProfile = {
      auth: { types: [], hasAuth: false, schemes: [] },
      structure: { endpointCount: 1, pathCount: 1, hasStreaming: false, hasWebhooks: false },
      data: { hasFileUpload: false, hasBinaryResponse: false, contentTypes: [] },
      patterns: { pagination: 'none', rateLimiting: false, hasFiltering: false, hasSorting: false },
      errors: { format: 'json', hasStandardErrorSchema: false },
      guidance: { complexityScore: 5, recommendedSkills: [] },
    };

    cache.set('spec2', profile);
    cache.invalidate('spec2');
    expect(cache.get('spec2')).toBeNull();
  });

  it('should respect max size with LRU eviction', () => {
    const cache = new ProfileCache(2);
    const p: SpecProfile = {
      auth: { types: [], hasAuth: false, schemes: [] },
      structure: { endpointCount: 1, pathCount: 1, hasStreaming: false, hasWebhooks: false },
      data: { hasFileUpload: false, hasBinaryResponse: false, contentTypes: [] },
      patterns: { pagination: 'none', rateLimiting: false, hasFiltering: false, hasSorting: false },
      errors: { format: 'json', hasStandardErrorSchema: false },
      guidance: { complexityScore: 5, recommendedSkills: [] },
    };

    cache.set('a', p);
    cache.set('b', p);
    cache.set('c', p); // Should evict 'a'

    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBeDefined();
    expect(cache.get('c')).toBeDefined();
  });

  it('should clear all entries', () => {
    const profile: SpecProfile = {
      auth: { types: [], hasAuth: false, schemes: [] },
      structure: { endpointCount: 1, pathCount: 1, hasStreaming: false, hasWebhooks: false },
      data: { hasFileUpload: false, hasBinaryResponse: false, contentTypes: [] },
      patterns: { pagination: 'none', rateLimiting: false, hasFiltering: false, hasSorting: false },
      errors: { format: 'json', hasStandardErrorSchema: false },
      guidance: { complexityScore: 5, recommendedSkills: [] },
    };

    cache.set('x', profile);
    cache.clear();
    expect(cache.size()).toBe(0);
  });
});

describe('SkillSelectionAgent', () => {
  let agent: SkillSelectionAgent;

  beforeEach(() => {
    SkillRegistry.resetInstance();
    agent = new SkillSelectionAgent({ skillsBaseDir: 'src/skills' });
  });

  afterEach(() => {
    SkillRegistry.resetInstance();
  });

  it('should initialize successfully', async () => {
    const result = await agent.initialize();
    expect(result.registryErrors).toBeDefined();
  });

  it('should analyze spec and return profile', async () => {
    await agent.initialize();
    const profile = agent.analyzeSpec(SIMPLE_SPEC);
    expect(profile.structure.endpointCount).toBe(2);
    expect(profile.auth.hasAuth).toBe(false);
  });

  it('should return cached profile on second call', async () => {
    await agent.initialize();
    const profile1 = agent.analyzeSpec(SIMPLE_SPEC);
    const profile2 = agent.analyzeSpec(SIMPLE_SPEC);
    expect(profile2).toEqual(profile1);
  });
});
