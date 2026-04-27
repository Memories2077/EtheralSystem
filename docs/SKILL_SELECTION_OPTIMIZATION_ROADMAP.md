# Skill Selection Optimization Roadmap

## Executive Summary

The current skill selection logic in `src/generator/prompt.ts` uses **binary, hardcoded decision-making** based solely on authentication presence detection. This document proposes a strategic evolution toward **dynamic, multi-dimensional skill composition** using specialized AI agents.

---

## Current State Analysis

### Existing Architecture (✅ Working)
```
SkillRouter (skill-router.ts)
├── Modular prompt fragments in src/skills/
│   ├── auth/
│   │   ├── mcp_requirements.md (when auth present)
│   │   └── mcp_anti_contamination.md (when NO auth)
│   ├── mcp/
│   │   ├── system.md
│   │   ├── user_message.md
│   │   ├── zod_mapping.md
│   │   └── request_patterns.md
│   └── openapi/
│       ├── system.md
│       └── user_message.md
```

**Current Selection Logic:**
```typescript
// From prompt.ts - Binary auth detection
const specHasAuth = detectAuthInSpec(openApiSpec);
const skills = await SkillRouter.assembleMCPSkills({ hasAuth: specHasAuth });
// Decision: auth ? requirements.md : anti_contamination.md
```

**Detection Methods:**
- `detectAuthInSpec()`: Regex for `securitySchemes:` or `security:\s*\n\s*-`
- `detectAuthInInput()`: 15+ auth-related keyword patterns

---

## Problem Statement

### Limitations of Current Approach

| Issue | Impact | Severity |
|-------|--------|----------|
| **Single dimension** - Only auth/no-auth binary decision | Ignores API complexity, patterns, data types | HIGH |
| **Hardcoded patterns** - Brittle regex/keyword matching | Misses nuanced auth patterns, false positives | HIGH |
| **No adaptability** - Cannot learn from generation feedback | Stagnant, requires manual updates | MEDIUM |
| **No confidence scoring** - All-or-nothing selection | Cannot handle ambiguous cases gracefully | MEDIUM |
| **Limited extensibility** - Adding new skill dimensions requires code changes | Slow iteration, developer-dependent | HIGH |

### Knowledge Contamination Risk Matrix

| Scenario | Current Protection | Risk Level |
|----------|-------------------|------------|
| API without auth, but docs mention "authorization" in description | Keyword detection may false-positive | ⚠️ MEDIUM |
| API with custom auth schemes not in keyword list | Falls through to anti-contamination (safe but suboptimal) | ✅ LOW |
| API with multiple auth types (OAuth2 + API Key) | Binary flag loses nuance | ⚠️ HIGH |
| Complex API requiring specialized patterns (streaming, webhooks) | No specialized skills exist | ❌ HIGH |

---

## Proposed Solution: Dynamic Skill Selection System

### Vision
Transform from **hardcoded boolean logic** to an **intelligent, multi-agent skill orchestration system** that:

1. **Analyzes input** across multiple dimensions (auth, complexity, patterns, data types)
2. **Scores skill variants** based on relevance to detected characteristics
3. **Composes skills dynamically** from granular fragments
4. **Learns from feedback** to improve selection over time
5. **Provides explainable decisions** for debugging and tuning

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Dynamic Skill Selector                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐     ┌──────────────────┐                 │
│  │  Input Analyzer │────▶│  Skill Scorer    │                 │
│  │    Agent        │     │   Agent          │                 │
│  └─────────────────┘     └──────────────────┘                 │
│         │                        │                             │
│         ▼                        ▼                             │
│  ┌─────────────────┐     ┌──────────────────┐                 │
│  │ Context Features│     │  Skill Matches   │                 │
│  │ • Auth Type     │     │  • Relevance     │                 │
│  │ • Complexity    │     │  • Confidence    │                 │
│  │ • Patterns      │     │  • Coverage      │                 │
│  │ • Data Types    │     │                  │                 │
│  └─────────────────┘     └──────────────────┘                 │
│         │                        │                             │
│         └──────────┬─────────────┘                             │
│                    ▼                                            │
│         ┌─────────────────────┐                                │
│         │  Skill Composer     │◀─┐  Selection Strategy       │
│         │  Agent              │  │  (Thresholds,            │
│         │                     │  │   Fallbacks, Weighting)  │
│         └─────────────────────┘  └───────────────────────────┘
│                    │                                            │
│                    ▼                                            │
│         ┌─────────────────────┐                                │
│         │  Assembled Prompt   │                                │
│         │  • System           │                                │
│         │  • Auth Fragment    │                                │
│         │  • Pattern Guides   │                                │
│         │  • Examples Filtered │                               │
│         └─────────────────────┘                                │
│                    │                                            │
│                    ▼                                            │
│         ┌─────────────────────┐                                │
│         │   LLM Generation    │                                │
│         └─────────────────────┘                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Enhanced Analysis (Week 1-2) - **P0 Priority**

### Objective
Deploy specialized analysis agents to extract rich context from input specs.

### Agents Required

#### 1. **SpecProfileAnalyzer Agent**
**Purpose**: Extract comprehensive feature vector from OpenAPI/user input.

**Input**: OpenAPI spec or API endpoint description
**Output**: `SpecProfile` object

```typescript
interface SpecProfile {
  // Authentication (dimensional, not binary)
  auth: {
    hasAuth: boolean;
    types: ('basic' | 'bearer' | 'oauth2' | 'apikey' | 'custom')[];
    schemes: SecurityScheme[];
    complexity: 'simple' | 'standard' | 'complex'; // based on flow types
  };

  // API Structure
  structure: {
    endpointCount: number;
    pathDepth: number; // nesting levels
    hasWebhooks: boolean;
    hasGraphQL: boolean;
    hasWebSocket: boolean;
    methodDistribution: Record<string, number>;
  };

  // Data Complexity
  data: {
    schemaCount: number;
    hasCircularReferences: boolean;
    hasFileUpload: boolean;
    hasStreaming: boolean;
    contentTypeVariants: string[];
  };

  // Pattern Detection
  patterns: {
    pagination: 'none' | 'offset' | 'cursor' | 'both';
    rateLimiting: boolean;
    batchOperations: boolean;
    idempotencyKeys: boolean;
    retryAfterHeaders: boolean;
  };

  // Quality Indicators
  quality: {
    documentationCompleteness: number; // 0-1 score
    exampleCount: number;
    hasDeprecatedEndpoints: boolean;
  };

  // Generation Guidance
  guidance: {
    needsLargeContextHandling: boolean;
    recommendedChunkSize: number;
    priorityEndpoints: string[]; // based on /health, /status, etc.
  };
}
```

**Implementation Strategy**:
- Use **code-explorer** agent to analyze spec structure
- Use **grep** patterns for specific OpenAPI extensions (`x-` prefixes)
- Generate embeddings for schema complexity assessment

#### 2. **SkillRegistryBuilder Agent**
**Purpose**: Create a searchable registry of available skills with metadata.

**Skills Metadata Schema**:
```typescript
interface SkillMetadata {
  id: string;  // e.g., "auth.basic", "patterns.pagination.cursor"
  path: string; // relative path in skills/
  category: 'auth' | 'patterns' | 'types' | 'validation' | 'error_handling';
  tags: string[]; // e.g., ['bearer', 'oauth2', 'api-key', 'pagination']
  applicability: {
    authTypes: string[];  // which auth types this skill applies to
    complexity: 'any' | 'simple' | 'complex';
    endpointCount: 'any' | 'few' | 'many';
  };
  conflicts: string[]; // skill IDs that conflict (mutually exclusive)
  dependencies: string[]; // skills that should be included together
  tokenCost: number; // approximate tokens this skill adds
  effectiveness: {
    successRate: number; // learned from generation feedback
    avgImprovement: number; // quality delta when used
  };
}
```

**Implementation**:
- Scan `src/skills/` directory automatically on startup
- Parse markdown frontmatter or YAML metadata blocks
- Build skill dependency graph for intelligent composition

---

## Phase 2: Intelligent Selection (Week 3-4) - **P1 Priority**

### Objective
Implement scoring and composition algorithm.

#### 3. **SkillMatcher Agent**
**Purpose**: Match spec profile to relevant skills with confidence scores.

**Algorithm**:

```typescript
class SkillMatcher {
  async match(profile: SpecProfile, availableSkills: SkillMetadata[]): Promise<SkillMatch[]> {
    const matches: SkillMatch[] = [];

    for (const skill of availableSkills) {
      let score = 0;
      let reasons: string[] = [];

      // Auth dimension matching
      if (skill.category === 'auth') {
        const authMatch = this.scoreAuthMatch(profile.auth, skill);
        score += authMatch.score;
        reasons.push(...authMatch.reasons);
      }

      // Pattern dimension matching
      if (skill.category === 'patterns') {
        const patternMatch = this.scorePatternMatch(profile.patterns, skill);
        score += patternMatch.score;
        reasons.push(...patternMatch.reasons);
      }

      // Complexity dimension
      if (skill.applicability.complexity !== 'any') {
        const complexityScore = this.scoreComplexity(profile, skill);
        score += complexityScore;
      }

      // Apply conflicts filter
      if (this.hasConflict(skill, selectedSkills)) {
        score *= 0.1; // heavily penalize conflicting skills
        reasons.push('Conflicts with other selected skills');
      }

      matches.push({
        skillId: skill.id,
        path: skill.path,
        score,
        confidence: this.normalizeScore(score),
        reasons,
      });
    }

    return matches.sort((a, b) => b.score - a.score);
  }

  private scoreAuthMatch(auth: ProfileAuth, skill: SkillMetadata): { score: number; reasons: string[] } {
    // Implementation: match detected auth types to skill tags
  }
}
```

#### 4. **SkillComposer Agent**
**Purpose**: Assemble non-conflicting skill set into final prompt.

**Composition Rules**:

1. **Maximize total confidence** while staying within token budget
2. **Ensure coverage** of all detected dimensions (must have at least one skill per active category)
3. **Respect dependencies** (if pagination skill selected, also include pagination patterns skill)
4. **Apply conflict resolution** (if both OAuth2 and Basic Auth skills applicable, choose based on actual spec)
5. **Fallback chain**:
   - Primary: Matched skills with confidence > threshold (0.7)
   - Secondary: Matched skills with confidence 0.4-0.7
   - Fallback: Generic skills with `applicability: 'any'`

**Output**:
```typescript
interface ComposedSkills {
  system: SkillReference[];  // ordered by priority
  userMessage: SkillReference[];
  fragments: Map<string, SkillFragment>; // path -> content
  metadata: {
    totalTokens: number;
    selectedCount: number;
    skippedCount: number;
    compositionStrategy: string;
    confidence: number; // average of selected skills
  };
}
```

---

## Phase 3: Learning & Adaptation (Week 5-6) - **P2 Priority**

### Objective
Close the loop: learn from generation outcomes to improve future selections.

#### 5. **FeedbackCollector Agent**
**Purpose**: Capture generation results and associate with skill selection decisions.

**Telemetry Schema**:
```typescript
interface GenerationOutcome {
  requestId: string;
  specProfile: SpecProfile;
  selectedSkills: string[];
  skillConfidences: Record<string, number>;
  
  // Generation metrics
  llmCalls: number;
  tokenCount: number;
  generationTimeMs: number;
  
  // Quality assessment
  validationPassed: boolean;
  errorTypes: string[]; // e.g., ['template_syntax', 'missing_auth', ' zod_error']
  requiredRetries: number;
  
  // Human feedback (if available)
  reviewerRating?: number; // 1-5
  reviewerNotes?: string;
  
  // Post-generation analysis
  generatedCodeQuality: {
    hasTestCoverage: boolean;
    followsPatterns: boolean;
    structureCorrect: boolean;
  };
}
```

#### 6. **SkillOptimizer Agent**
**Purpose**: Update skill effectiveness metrics and suggest new skill variants.

**Learning Algorithm**:
```typescript
class SkillOptimizer {
  async updateMetrics(outcome: GenerationOutcome): Promise<void> {
    // Bayesian updating of success rates
    for (const skillId of outcome.selectedSkills) {
      const skill = this.skillRegistry.get(skillId);
      const prior = skill.effectiveness.successRate;
      const likelihood = outcome.validationPassed ? 1 : 0;
      const updated = this.bayesianUpdate(prior, likelihood, outcome.weight);
      skill.effectiveness.successRate = updated;
    }

    // Detect ineffective skills (success rate < threshold)
    // Suggest merging or deprecation
  }

  async suggestNewSkills(profile: SpecProfile, failedMatches: SkillMatch[]): Promise<SkillVariant[]> {
    // Cluster failed matches by profile characteristics
    // Identify gaps in skill coverage
    // Generate proposals for new skill fragments
  }
}
```

---

## Phase 4: Advanced Features (Week 7-8) - **P3 Priority**

### 7. **RAG-Enhanced Selection**
Integrate retrieval-augmented generation for example selection:

- Store generation examples in vector database (ChromaDB, Pinecone)
- Embed spec profiles + generated code
- Retrieve top-k similar past generations as dynamic examples
- Blend with static skill fragments

### 8. **A/B Testing Framework**
Test skill selection strategies:

- Control: Current hardcoded logic
- Variant A: Static skill scoring (no learning)
- Variant B: Full dynamic selection with learning
- Metrics: validation pass rate, retries, code quality score

### 9. **Skill Marketplace**
External skill plugins:

- Skills can be contributed externally
- Versioned skill packages from npm
- Skill manifest format with compatibility matrix
- Runtime skill loading from configured sources

---

## Implementation Plan

### Week 1-2: Foundation
- [ ] Create `src/skill-selection/` directory
- [ ] Implement `SpecProfileAnalyzer` agent
- [ ] Implement `SkillRegistryBuilder` (scan skills directory)
- [ ] Write unit tests for profile extraction

### Week 3-4: Core Selection
- [ ] Implement `SkillMatcher` with scoring algorithm
- [ ] Implement `SkillComposer` with conflict resolution
- [ ] Integrate into `prompt.ts` (feature flag controlled)
- [ ] Benchmark against current approach

### Week 5-6: Learning Loop
- [ ] Implement `FeedbackCollector` (store outcomes in MongoDB)
- [ ] Implement `SkillOptimizer` with Bayesian updates
- [ ] Create feedback dashboard (simple HTML/CLI)
- [ ] Add skill effectiveness reporting

### Week 7-8: Polish
- [ ] RAG integration (optional)
- [ ] A/B testing framework
- [ ] Documentation and migration guide
- [ ] Performance optimization (caching, parallelization)

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| **Over-engineering** - Solution too complex for current scale | Phase gate reviews; start with minimal viable matcher |
| **Performance regression** - Analysis adds latency | Cache spec profiles; parallelize analysis |
| **Skill selection brittleness** - New system less reliable than current | Feature flag; fallback to hardcoded if confidence too low |
| **Learning from bad examples** - Poor generations poison metrics | Quality-weighted updates; human-in-the-loop validation |
| **Token budget overflow** - Dynamic selection adds overhead | Hard token limit enforcement; skill token budgeting |

---

## Success Metrics

### Primary KPIs
- **Validation pass rate**: Target > 95% (current ~85%)
- **Average retries per generation**: Target < 0.5 (current ~1.2)
- **Time to first success**: Target reduction by 30%

### Secondary Metrics
- **Skill diversity**: Number of distinct skill combinations used
- **Adaptation speed**: Days to recover from new failure pattern
- **False positive auth detection**: Target < 5%

### Operational Metrics
- **Selection latency**: < 100ms (P50)
- **Memory overhead**: < 10MB per analysis
- **Cache hit rate**: > 70% for recurring spec patterns

---

## Specialized Agent Assignments

Based on the user's agent ecosystem:

| Agent | Role | Primary Files |
|-------|------|---------------|
| **code-explorer** | Analyze spec structure, detect patterns | `SpecProfileAnalyzer` |
| **tdd-guide** | Write tests for skill selection | `test/skill-selection/` |
| **code-reviewer** | Review selection algorithm implementation | All selection agents |
| **security-reviewer** | Audit skill loading (path traversal, injection) | `SkillRegistryBuilder` |
| **doc-updater** | Maintain skill registry documentation | `SKILL_REGISTRY.md` |
| **refactor-cleaner** | Post-implementation cleanup | Dead skill detection |

---

## Alternative Approaches Considered

### 1. **Rule-Based Expansion** (Simpler)
- Add more dimensions to current boolean logic
- `hasAuth && hasPagination && endpointCount > 50 ? ...`
- **Rejected**: Still hardcoded, doesn't scale

### 2. **Machine Learning Classifier** (Complex)
- Train model on past generations to predict best skills
- Requires labeled dataset, feature engineering
- **Rejected**: Overkill, opaque decisions, data collection burden

### 3. **LLM-as-Judge for Skill Selection** (Interesting)
- Use LLM to analyze spec and choose skills
- Prompt: "Given this OpenAPI spec, which skills should be included?"
- **Rejected**: Adds LLM call overhead, inconsistent, harder to debug

### 4. **Hybrid Approach** (✅ Selected)
- Rule-based analysis for deterministic features (counts, presence)
- Lightweight scoring algorithm for matching
- Learning loop for continuous improvement
- Transparent, debuggable, extensible

---

## Migration Strategy

### Step 1: Feature Flag
```typescript
// In config.ts
export const FEATURE_FLAGS = {
  DYNAMIC_SKILL_SELECTION: process.env.DYNAMIC_SKILL_SELECTION === 'true',
};
```

### Step 2: Gradual Rollout
1. Implement but default to current logic
2. Enable for 10% of generations (hash-based)
3. Compare outcomes (control vs variant)
4. Increase to 50%, then 100% if metrics improve

### Step 3: Fallback Mechanism
```typescript
const skillResult = await tryDynamicSelection(profile);
if (skillResult.confidence < 0.6 || skillResult.totalTokens > budget) {
  console.warn('Dynamic selection low confidence, falling back to hardcoded');
  return getHardcodedSkills(hasAuth);
}
```

---

## Conclusion

The current hardcoded skill selection, while functional, limits the system's ability to:

1. **Scale** to new skill types without code changes
2. **Adapt** to different API patterns and complexities
3. **Optimize** based on generation outcomes
4. **Explain** why certain skills were selected

The proposed Dynamic Skill Selection System addresses these limitations through:

- **Multi-dimensional analysis** beyond binary auth detection
- **Intelligent scoring and composition** with conflict resolution
- **Continuous learning** from generation feedback
- **Transparent, debuggable** decision process

**Recommendation**: Proceed with Phase 1 (Enhanced Analysis) as a proof-of-concept. The modular architecture already in place (`SkillRouter`) provides a solid foundation. The investment in dynamic selection will pay dividends as the skill library grows and the system encounters more diverse API specifications.

---

## Appendix: Skill Taxonomy Proposal

Future skill organization (beyond current auth split):

```
skills/
├── auth/
│   ├── basic/
│   ├── bearer/
│   ├── oauth2.authorization_code/
│   ├── oauth2.client_credentials/
│   ├── oauth2.implicit/
│   ├── apikey.header/
│   ├── apikey.query/
│   └── mutual_tls/
├── patterns/
│   ├── pagination.offset/
│   ├── pagination.cursor/
│   ├── pagination.link_header/
│   ├── rate_limiting/
│   ├── batch_operations/
│   ├── webhooks/
│   └── streaming/
├── data/
│   ├── file_upload.multipart/
│   ├── file_upload.base64/
│   ├── complex.nested_schemas/
│   ├── complex.circular_refs/
│   └── complex.polymorphic/
├── error_handling/
│   ├── standard.http_codes/
│   ├── standard.problem_details/
│   ├── retry.idempotency_key/
│   └── retry.exponential_backoff/
└── validation/
    ├── strict.zod_schemas/
    ├── flexible.coerce/
    └── custom.validators/
```

This granular taxonomy enables precise skill selection and composition, reducing contamination while maximizing relevance.
