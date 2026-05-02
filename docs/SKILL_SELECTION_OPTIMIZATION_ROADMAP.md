# Skill Selection Optimization Roadmap (Single-Agent Version)

## Executive Summary

The current skill selection logic in `src/generator/prompt.ts` uses **binary, hardcoded decision-making** based solely on authentication presence detection. This document proposes a strategic evolution toward **dynamic, multi-dimensional skill composition** using a single, unified intelligent agent.

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

| Issue                                                                         | Impact                                        | Severity |
| ----------------------------------------------------------------------------- | --------------------------------------------- | -------- |
| **Single dimension** - Only auth/no-auth binary decision                      | Ignores API complexity, patterns, data types  | HIGH     |
| **Hardcoded patterns** - Brittle regex/keyword matching                       | Misses nuanced auth patterns, false positives | HIGH     |
| **No adaptability** - Cannot learn from generation feedback                   | Stagnant, requires manual updates             | MEDIUM   |
| **No confidence scoring** -con All-or-nothing selection                       | Cannot handle ambiguous cases gracefully      | MEDIUM   |
| **Limited extensibility** - Adding new skill dimensions requires code changes | Slow iteration, developer-dependent           | HIGH     |

### Knowledge Contamination Risk Matrix

| Scenario                                                          | Current Protection                                        | Risk Level |
| ----------------------------------------------------------------- | --------------------------------------------------------- | ---------- |
| API without auth, but docs mention "authorization" in description | Keyword detection may false-positive                      | ⚠️ MEDIUM  |
| API with custom auth schemes not in keyword list                  | Falls through to anti-contamination (safe but suboptimal) | ✅ LOW     |
| API with multiple auth types (OAuth2 + API Key)                   | Binary flag loses nuance                                  | ⚠️ HIGH    |
| Complex API requiring specialized patterns (streaming, webhooks)  | No specialized skills exist                               | ❌ HIGH    |

---

## Proposed Solution: Single-Agent Skill Intelligence System

### Vision

Transform from **hardcoded boolean logic** to an **intelligent, self-contained skill orchestration agent** that:

1. **Analyzes input** across multiple dimensions (auth, complexity, patterns, data types)
2. **Scores skill variants** based on relevance to detected characteristics
3. **Composes skills dynamically** from granular fragments
4. **Learns from feedback** to improve future selections
5. **Provides explainable decisions** for debugging and tuning

### Why Single Agent?

The original roadmap proposed 6 separate agents. After analysis, we consolidate into **one unified `SkillSelectionAgent`** because:

- **Co-located logic**: All selection steps naturally flow together (analysis → matching → composition → feedback)
- **Shared state**: Registry, scoring weights, and feedback history live in-memory without RPC overhead
- **Simplified deployment**: Single class, single responsibility, easier to test and debug
- **Performance**: In-process calls vs multiple async agent invocations
- **Maintainability**: One codebase to maintain, one set of unit tests

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                       SkillSelectionAgent                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐                                              │
│  │  Skill Registry │ ◀── Load from src/skills/ with metadata      │
│  │  (in-memory)    │                                              │
│  └─────────────────┘                                              │
│         │                                                         │
│         ▼                                                         │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  analyzeSpec(spec: string): SpecProfile                     │  │
│  │    • Parse OpenAPI structure                                │  │
│  │    • Detect capabilities (auth, pagination, file ops, etc) │  │
│  │    • Calculate complexity metrics                          │  │
│  │    • Return structured profile                             │  │
│  └─────────────────────────────────────────────────────────────┘  │
│         │                                                         │
│         ▼                                                         │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  selectSkills(profile: SpecProfile): SkillComposition       │  │
│  │    • Score all applicable skills                           │  │
│  │    • Resolve conflicts (mutually exclusive patterns)       │  │
│  │    • Respect dependencies (pagination → patterns)          │  │
│  │    • Apply token budget constraints                        │  │
│  │    • Return ranked skill list with explanations            │  │
│  └─────────────────────────────────────────────────────────────┘  │
│         │                                                         │
│         ▼                                                         │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  assemblePrompt(base: string, skills: Skill[]): string      │  │
│  │    • Load skill content from registry                     │  │
│  │    • Inject at designated injection points                │  │
│  │    • Interpolate placeholders                             │  │
│  │    • Return complete system prompt                        │  │
│  └─────────────────────────────────────────────────────────────┘  │
│         │                                                         │
│         ▼                                                         │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  recordFeedback(outcome: GenerationOutcome)                 │  │
│  │    • Update skill effectiveness metrics                   │  │
│  │    • Adjust scoring weights                               │  │
│  │    • Detect skill gaps & suggest new skills               │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Foundation (Week 1-2) ✅ COMPLETED

### Objective

Create the agent skeleton and skill registry infrastructure.

### Tasks

1. **Create `src/skill-intelligence/` directory** ✅

   ```
   src/skill-intelligence/
   ├── agent.ts                 # Main SkillSelectionAgent class
   ├── registry.ts              # SkillRegistry with metadata parsing
   ├── analyzer.ts              # SpecProfileAnalyzer logic
   ├── composer.ts              # Skill selection & composition
   ├── feedback.ts              # Learning & effectiveness tracking
   ├── types.ts                 # All TypeScript interfaces
   ├── cache.ts                 # Profile caching, LRU
   └── __tests__/
       ├── agent.test.ts
       ├── analyzer.test.ts
       ├── composer.test.ts
       └── feedback.test.ts
   ```

2. **Implement `SkillRegistry`** (`registry.ts`) ✅
   - Scan `src/skills/` directory recursively
   - Parse YAML frontmatter from `.md` files
   - Build in-memory index: `Map<skillId, SkillMetadata>`
   - Group skills by category/tag for fast lookup
   - Detect and report metadata errors (missing ID, conflicts, etc.)
   - Cache registry globally (singleton)

3. **Implement `SpecProfileAnalyzer`** (`analyzer.ts`) ✅
   - Parse OpenAPI YAML/JSON (use `yaml` package)
   - Extract auth types, endpoint count, file upload, pagination, rate limiting, etc.
   - Calculate `guidance.complexityScore`: Weighted sum of features
   - Return `SpecProfile` object

4. **Add metadata to all existing skills** ✅
   - Frontmatter added to all skill files with `id`, `category`, `tags`, `priority`, `tokenCost`, `conditions`

5. **Write unit tests** ✅
   - `analyzer.test.ts`: Test profile extraction on Reddit.yaml, simple API spec
   - `registry.test.ts`: Test skill loading, metadata validation, conflict detection

**Deliverable**: `SkillSelectionAgent` can be instantiated and `analyzeSpec()` returns a `SpecProfile`.

---

## Phase 2: Core Selection (Week 3-4) ✅ COMPLETED

### Objective

Implement skill scoring, matching, and prompt composition.

### Tasks

1. **Implement `SkillScorer`** in `composer.ts` ✅
   - Multi-dimensional scoring: auth match (weight 3.0), pattern match (weight 2.0), complexity fit (weight 1.5)
   - Token budget awareness with penalty factor
   - Condition-based scoring with field path evaluation
   - Confidence normalization (0-1 range)

2. **Implement `SkillSelector`** in `composer.ts` ✅
   - Greedy selection with token budget enforcement
   - Conflict resolution (mutually exclusive auth skills)
   - Category coverage: ensures at least one skill per active category
   - Dependency resolution: auto-includes required skills
   - Score sorting: by score descending, then priority descending

3. **Implement `PromptAssembler`** in `composer.ts` ✅
   - Injection point system: `{{SYSTEM_HEADER}}`, `{{USER_FOOTER}}`, `{{AUTH_SECTION}}`, `{{ZOD_MAPPING}}`, `{{REQUEST_PATTERNS}}`
   - Graceful handling of missing injection points (replace with empty string)
   - Skill-to-injection-point mapping

4. **Integrate into `prompt.ts`** ✅
   - Feature flag: `DYNAMIC_SKILL_SELECTION=true` to enable
   - `buildPromptWithDynamicSelection()` for MCP generation
   - `buildOpenAPIPromptWithDynamicSelection()` for OpenAPI generation
   - Backward compatible: falls back to hardcoded `SkillRouter` when flag is off
   - Full integration in both `buildPromptWithExamples()` and `buildOpenAPIPromptWithExamples()`

5. **Write integration tests** ✅
   - Test with Reddit.yaml: should select auth.oauth2, pagination patterns
   - Test with simple API: should select minimal skills, no auth
   - Test token budget enforcement: large spec → skill budget reduction

**Deliverable**: `prompt.ts` can use `SkillSelectionAgent` to dynamically compose prompts. Backward compatible with feature flag.

---

## Phase 3: Learning Loop (Week 5-6)

### Objective

Close the loop: learn from generation outcomes to improve future selections.

### Tasks

1. **Define `GenerationOutcome` schema** (`feedback.ts`)

   ```typescript
   interface GenerationOutcome {
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

     // Quality assessment (from post-generation analysis)
     codeQuality: {
       hasProperErrorHandling: boolean;
       usesHelperFunctions: boolean;
       structureCorrect: boolean;
       authImplemented: boolean;
       zodSchemasValid: boolean;
     };

     // Human feedback (if available from UI)
     reviewerRating?: number; // 1-5
     manualFixesRequired: string[]; // e.g., ['added_missing_auth', 'fixed_pagination']
   }
   ```

2. **Add `FeedbackCollector`** to `SkillSelectionAgent`
   - Store outcomes in MongoDB (collection: `skill_feedback`)
   - Schema: Same as `GenerationOutcome` (persisted)
   - Index on `requestId`, `timestamp`, `selectedSkillIds`
   - Method: `recordFeedback(outcome: GenerationOutcome): Promise<void>`

3. **Implement `SkillEffectivenessTracker`** (`feedback.ts`)
   - Query MongoDB for outcomes by skill ID
   - Calculate metrics:
     - `successRate`: % of outcomes with `validationPassed === true`
     - `avgRetries`: Mean `requiredRetries`
     - `avgQualityScore`: Weighted score from `codeQuality` fields
     - `lastUsed`: Timestamp of most recent use
   - Bayesian smoothing: `successRate = (successes + 1) / (total + 2)` to avoid 0/1 extremes
   - Cache calculated metrics in memory (refresh hourly)

4. **Update `SkillScorer` to use effectiveness**

   ```typescript
   score +=
     baseScore *
     skillEffectiveness.successRate * // learned effectiveness
     (1 + Math.log10(skillUsage.count + 1) * 0.1); // slight bonus for frequently used
   ```

5. **Skill gap detection** (periodic, e.g., daily)
   - Find high-frequency errors that don't match any skill
   - Cluster by `specProfile` features
   - Suggest new skill: "For APIs with X, Y, Z, consider adding skill for W"
   - Output to `SKILL_GAPS.md` for developer review

6. **Write tests**
   - `feedback.test.ts`: Test metric calculations, Bayesian updates
   - `gap-detection.test.ts`: Test cluster analysis on synthetic failures

**Deliverable**: Generation outcomes are logged and influence future skill selection. Dashboard (optional) shows skill effectiveness.

---

## Phase 4: Advanced Features & Polish (Week 7-8)

### Objective

Refine the system, add advanced features, prepare for production.

### Tasks

1. **Performance Optimization**
   - Cache `SpecProfile` results by spec hash (SHA-256 of spec content)
   - Parallelize skill scoring (Promise.all on skill batches)
   - Lazy load skill contents (only load when selected)
   - Pre-warm registry at startup (avoid first-request latency)

2. **RAG-Enhanced Example Selection** (Optional P3)
   - Store past successful generations in vector DB (ChromaDB, LanceDB, or simple embeddings)
   - Embed: `specProfile` + `selectedSkills` → generated code quality
   - At generation time: retrieve top-3 similar past generations
   - Use as dynamic examples in user prompt (in addition to static examples)
   - Track: Does RAG improve success rate? A/B test.

3. **A/B Testing Framework**

   ```typescript
   // In config.ts
   export const EXPERIMENT_CONFIG = {
     skillSelectionVariant: process.env.SKILL_SELECTION_VARIANT || "control", // 'control' | 'dynamic' | 'hybrid'
     trafficAllocation: { control: 0.1, dynamic: 0.45, hybrid: 0.45 },
   };

   // In prompt.ts
   const variant = assignVariant(requestId); // hash-based consistent assignment
   if (variant === "dynamic") {
     useAgentSelection();
   } else if (variant === "hybrid") {
     // Use agent but fall back if confidence < 0.7
   } else {
     // control: existing hardcoded
   }
   ```

   - Metrics dashboard: Compare validation pass rate, retries, quality scores
   - Gradual rollout: 10% → 50% → 100% if metrics improve

4. **Skill Health Dashboard** (CLI or simple HTML page)

   ```
   $ npx tsx src/skill-intelligence/cli.ts dashboard

   Skill Effectiveness Report:
   ┌─────────────────────────────┬──────────┬────────────┬────────────┐
   │ Skill ID                    │ Usage    │ Success %  │ Avg Retries│
   ├─────────────────────────────┼──────────┼────────────┼────────────┤
   │ auth.bearer                 │ 1,234    │ 94.2%      │ 0.3        │
   │ auth.oauth2                 │ 456      │ 89.1%      │ 0.8        │
   │ pagination.cursor           │ 789      │ 96.7%      │ 0.2        │
   │ patterns.multipart         │ 123      │ 78.5%      │ 1.2        │ ← needs review
   └─────────────────────────────┴──────────┴────────────┴────────────┘

   Skill Gaps Detected:
   - 47 failures with "rate limiting" errors → consider `patterns.rate_limiting` skill
   - 23 failures with "file upload" issues → enhance `patterns.multipart`
   ```

5. **Documentation**
   - Update `README.md` with skill selection architecture
   - Create `SKILL_REGISTRY.md` documenting all skills, their purpose, when they're used
   - Add doc comments to all agent methods
   - Migration guide: How to debug if dynamic selection fails

6. **Monitoring & Alerting**
   - Log skill selection decisions: `console.log('[SkillSelect] profile=..., selected=..., score=...')`
   - Emit metrics (Prometheus format or JSON logs):
     - `skill_selection_duration_ms`
     - `skills_selected_count`
     - `selection_confidence`
     - `cache_hit_rate`
   - Alert if success rate drops below threshold (e.g., 80%)

7. **Safety & Fallbacks**
   - Hard token limit: If `totalTokens > 100000`, drop lowest-scoring skills
   - Confidence threshold: If `avgConfidence < 0.6`, log warning and use fallback skills
   - Fallback chain:
     1. Dynamic selection with high confidence → use it
     2. Dynamic selection low confidence → use `always` skills only
     3. Any error → fall back to hardcoded `hasAuth` logic
   - Feature flag: Can disable entirely with `DYNAMIC_SKILL_SELECTION=false`

---

## Implementation Plan

### Week 1-2: Foundation

- [ ] Create `src/skill-intelligence/` directory
- [ ] Implement `SkillRegistry` with metadata parsing
- [ ] Implement `SpecProfileAnalyzer` for capability extraction
- [ ] Add YAML frontmatter to all 11 existing skill files
- [ ] Write unit tests for analyzer and registry

### Week 3-4: Core Selection

- [ ] Implement `SkillScorer` with multi-dimensional scoring
- [ ] Implement `SkillSelector` with conflict resolution & token budgeting
- [ ] Implement `PromptAssembler` with injection point system
- [ ] Integrate into `prompt.ts` with feature flag
- [ ] Write integration tests for spec profiles

### Week 5-6: Learning Loop

- [ ] Define `GenerationOutcome` schema
- [ ] Implement `FeedbackCollector` with MongoDB storage
- [ ] Implement `SkillEffectivenessTracker` with Bayesian metrics
- [ ] Update `SkillScorer` to incorporate learned effectiveness
- [ ] Implement skill gap detection
- [ ] Write feedback and gap detection tests

### Week 7-8: Polish & Launch

- [ ] Performance optimization (caching, parallelization)
- [ ] Optional: RAG-enhanced example selection
- [ ] A/B testing framework with gradual rollout
- [ ] Skill health dashboard (CLI)
- [ ] Documentation updates
- [ ] Monitoring & alerting setup
- [ ] Safety fallbacks and feature flag configuration

**Total: 8 weeks** (can compress to 4-6 weeks with parallel development)

---

## Specialized Agent Assignments (Single Agent Architecture)

Based on the user's agent ecosystem, the `SkillSelectionAgent` consolidates multiple responsibilities:

| Agent                                          | Role                                                  | Primary Files                       |
| ---------------------------------------------- | ----------------------------------------------------- | ----------------------------------- |
| **SkillSelectionAgent** (single unified agent) | Orchestrates entire skill selection pipeline          | `src/skill-intelligence/agent.ts`   |
| └─ Analyzer component                          | Parse spec, extract capabilities                      | `analyzer.ts`                       |
| └─ Scorer component                            | Match skills to profile                               | `scorer.ts`                         |
| └─ Composer component                          | Select & assemble skills                              | `composer.ts`                       |
| └─ Feedback component                          | Learn from outcomes                                   | `feedback.ts`                       |
| **code-explorer**                              | (Optional) Enhance spec analysis for complex patterns | Used by analyzer if needed          |
| **tdd-guide**                                  | Write tests for skill selection                       | `src/skill-intelligence/__tests__/` |
| **code-reviewer**                              | Review selection algorithm implementation             | All selection files                 |
| **security-reviewer**                          | Audit skill loading (path traversal, injection)       | `registry.ts`                       |
| **doc-updater**                                | Maintain skill registry documentation                 | `SKILL_REGISTRY.md`                 |
| **refactor-cleaner**                           | Post-implementation cleanup                           | Dead skill detection                |

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
- **Rejected**: Adds LLM call overhead (~$0.02/analysis), inconsistent, harder to debug

### 4. **Multi-Agent System** (Original Roadmap)

- 6 separate agents orchestrated together
- **Rejected in favor of single agent**:
  - All steps naturally compose in one process
  - No serialization/RPC overhead
  - Shared state (registry, metrics) without distributed coordination
  - Simpler to test, deploy, debug
  - Single agent achieves same functionality with less complexity

### 5. **Hybrid Approach** (✅ Selected)

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
  DYNAMIC_SKILL_SELECTION: process.env.DYNAMIC_SKILL_SELECTION === "true",
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
  console.warn("Dynamic selection low confidence, falling back to hardcoded");
  return getHardcodedSkills(hasAuth);
}
```

---

## Conclusion

The current hardcoded skill selection, while functional, limits the system's ability to:

1. **Scale** to new skill types (pagination, file ops, WebSocket, etc.)
2. **Adapt** to different API patterns and complexity levels
3. **Optimize** based on generation outcomes
4. **Explain** why certain skills were selected

The proposed **Single-Agent Skill Intelligence System** addresses these limitations through:

- **Multi-dimensional analysis** beyond binary auth detection
- **Intelligent scoring and composition** with conflict resolution
- **Continuous learning** from generation feedback
- **Transparent, debuggable** decision process

**Recommendation**: Proceed with Phase 1 (Foundation) implementation using TDD methodology. The modular architecture already in place (`SkillRouter`) provides a solid foundation. The investment in dynamic selection will pay dividends as the skill library grows and the system encounters more diverse API specifications.

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

---

## Appendix: Spec Profile Detection Reference

### Capability Detection Rules

| Capability        | Detection Method                                                       | Example                      |
| ----------------- | ---------------------------------------------------------------------- | ---------------------------- |
| `auth.types`      | Parse `components.securitySchemes`                                     | `type: oauth2` → `oauth2`    |
| `pagination`      | Query param names: `cursor`/`after` → cursor; `offset`/`page` → offset | Reddit uses `after` → cursor |
| `rateLimiting`    | Response headers: `X-RateLimit-Limit`, `Retry-After`                   | GitHub API has both          |
| `fileUpload`      | RequestBody with `multipart/form-data` content type                    | File upload endpoints        |
| `batchOperations` | Path contains `/batch` or method `POST` with array schema              | `/users/batch-create`        |
| `idempotencyKeys` | Header parameter named `Idempotency-Key`                               | Stripe API                   |
| `webhooks`        | `x-webhooks` extension or callback object in OpenAPI                   | GitHub webhooks              |
| `graphql`         | GraphQL endpoint pattern or `application/graphql`                      | `/graphql` path              |
| `longRunning`     | `202 Accepted` responses with `Location` header                        | Async job submission         |

---

**Document Version**: 2.0 (Single-Agent Architecture)  
**Last Updated**: 2026-05-01  
**Status**: Draft for Implementation
