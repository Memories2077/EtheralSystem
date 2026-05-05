export interface SkillMetadata {
  id: string;
  category: 'auth' | 'mcp' | 'openapi';
  tags: string[];
  priority: number;
  tokenCost: number;
  conditions?: SkillCondition[];
  description?: string;
  filePath: string;
  content?: string;
}

export interface SkillCondition {
  field: string;
  operator: 'equals' | 'contains' | 'gte' | 'lte' | 'gt' | 'lt' | 'regex';
  value: unknown;
}

export interface SpecProfile {
  auth: {
    types: string[];
    hasAuth: boolean;
    schemes: AuthScheme[];
  };
  structure: {
    endpointCount: number;
    pathCount: number;
    hasStreaming: boolean;
    hasWebhooks: boolean;
  };
  data: {
    hasFileUpload: boolean;
    hasBinaryResponse: boolean;
    contentTypes: string[];
  };
  patterns: {
    pagination: 'offset' | 'cursor' | 'page' | 'none';
    rateLimiting: boolean;
    hasFiltering: boolean;
    hasSorting: boolean;
  };
  errors: {
    format: 'json' | 'xml' | 'html' | 'text' | 'unknown';
    hasStandardErrorSchema: boolean;
  };
  guidance: {
    complexityScore: number;
    recommendedSkills: string[];
  };
}

export interface AuthScheme {
  type: string;
  name: string;
  location?: string;
  scheme?: string;
}

export interface SkillScore {
  skillId: string;
  score: number;
  confidence: number;
  reasons: string[];
  metadata: SkillMetadata;
}

export interface SkillComposition {
  skills: SkillScore[];
  totalTokens: number;
  explanations: Record<string, string>;
}

export interface GenerationOutcome {
  requestId: string;
  timestamp: Date;
  specProfile: SpecProfile;
  selectedSkillIds: string[];
  skillConfidences: Record<string, number>;
  // Metrics
  llmCalls: number;
  tokenCount: number;
  generationTimeMs: number;
  validationPassed: boolean;
  validationErrors: string[];
  requiredRetries: number;
  // Quality assessment
  codeQuality: {
    hasProperErrorHandling: boolean;
    usesHelperFunctions: boolean;
    structureCorrect: boolean;
    authImplemented: boolean;
    zodSchemasValid: boolean;
  };
  // Human feedback
  reviewerRating?: number;
  manualFixesRequired: string[];
  // Legacy fields for backward compatibility
  serverId?: string;
  skillsUsed?: string[];
  success?: boolean;
  errorMessage?: string;
  buildDurationMs?: number;
  tokenUsage?: number;
  retryCount?: number;
}

export interface SkillEffectiveness {
  skillId: string;
  timesUsed: number;
  successCount: number;
  averageBuildDurationMs: number;
  averageTokenUsage: number;
  lastUsed?: Date;
  // Bayesian smoothed success rate: (successes + 1) / (total + 2)
  bayesianSuccessRate: number;
  avgRetries: number;
  avgQualityScore: number;
}

export interface SkillGap {
  id: string;
  detectedAt: Date;
  frequency: number;
  errorPatterns: string[];
  suggestedSkill: string;
  specProfileFeatures: string[];
  status: 'open' | 'addressed' | 'rejected';
}

export interface ScoringWeights {
  authMatch: number;
  patternMatch: number;
  complexityFit: number;
  priority: number;
  tokenPenaltyThreshold: number;
  tokenPenaltyFactor: number;
}

export interface CacheEntry {
  profile: SpecProfile;
  timestamp: number;
}

export interface SkillRegistryConfig {
  skillsBaseDir: string;
  cacheSize: number;
}
