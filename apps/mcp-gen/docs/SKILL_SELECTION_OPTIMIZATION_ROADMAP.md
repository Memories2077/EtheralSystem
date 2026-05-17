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

## Phase 3: Learning Loop (Week 5-6) ✅ COMPLETED

### Objective

Close the loop: learn from generation outcomes to improve future selections.

### Tasks

1. **Define `GenerationOutcome` schema** (`feedback.ts`) ✅

   Implemented with full TypeScript interface including metrics, quality assessment, and human feedback fields.

2. **Add `FeedbackCollector`** to `SkillSelectionAgent` ✅
   - Store automated generation outcomes in MongoDB (collection: `skill_feedback`)
   - Schema: Same as `GenerationOutcome` (persisted)
   - Index on `requestId`, `timestamp`, `selectedSkillIds`
   - Method: `recordFeedback(outcome: GenerationOutcome): Promise<void>`
   - Keep `skill_feedback` as the canonical per-skill learning collection because it contains `selectedSkillIds`, `specProfile`, validation metrics, retry counts, token usage, and quality signals needed by `SkillEffectivenessTracker`
   - Treat the existing `logs.feedbacks` implementation from the MetaClaw integration plan as a human-opinion source, not as a replacement for `skill_feedback`

3. **Implement `SkillEffectivenessTracker`** (`feedback.ts`) ✅
   - Query MongoDB for outcomes by skill ID
   - Calculate metrics:
     - `successRate`: % of outcomes with `validationPassed === true`
     - `avgRetries`: Mean `requiredRetries`
     - `avgQualityScore`: Weighted score from `codeQuality` fields
     - `lastUsed`: Timestamp of most recent use
   - Bayesian smoothing: `successRate = (successes + 1) / (total + 2)` to avoid 0/1 extremes
   - Cache calculated metrics in memory (LRU with 500 entry limit)

4. **Update `SkillScorer` to use effectiveness** ✅

   Implemented in `composer.ts` lines 148-163:

   ```typescript
   if (this.feedbackTracker) {
     const eff = this.feedbackTracker.getEffectiveness(skill.id);
     if (eff && eff.timesUsed > 0) {
       const bayesianRate = this.feedbackTracker.getBayesianSuccessRate(
         skill.id,
       );
       score *= bayesianRate; // modulate by learned effectiveness
       reasons.push(
         `Bayesian success rate: ${bayesianRate.toFixed(2)} (used ${eff.timesUsed} times)`,
       );

       // Slight bonus for frequently used skills
       const usageBonus = Math.log10((eff.timesUsed || 0) + 1) * 0.1;
       score += score * usageBonus;
       reasons.push(
         `Usage bonus: ${usageBonus.toFixed(2)} (used ${eff.timesUsed} times)`,
       );
     } else {
       reasons.push("No effectiveness data yet (neutral)");
     }
   }
   ```

5. **Skill gap detection** ✅
   - Find high-frequency errors that don't match any skill
   - Cluster by `specProfile` features
   - Suggest new skill based on error patterns
   - Persisted to MongoDB with status tracking

6. **Bridge human feedback from Section 3.4 into skill learning** ✅ COMPLETED
   - Reuses the implemented `POST /api/mcp/:serverId/feedback` flow that stores `likeCount`, `dislikeCount`, and `feedbacks[]` in the MongoDB `logs` collection
   - Added bridge logic in `FeedbackTracker.importHumanFeedbackFromLogs()` that reads `logs.feedbacks` and links each feedback item to the corresponding `skill_feedback` record by `requestId` when available, with `serverId` as a fallback lookup key
   - Extended `GenerationOutcome` persistence with human-feedback fields populated from Section 3.4:
     - `reviewerRating`: maps `like` to positive rating and `dislike` to negative rating
     - `manualFixesRequired`: captures actionable dislike comments that describe required corrections
     - `humanFeedback`: normalized array preserving `feedbackId`, `type`, `comment`, `userId`, `timestamp`, `serverId`, `requestId`, attribution, and issue tags
     - `importedFeedbackIds`: tracks processed feedback IDs for idempotency
     - `humanFeedbackScore`: stores the bounded aggregate opinion signal
   - Updated skill effectiveness scoring to combine automated validation and human opinion:
     - validation success remains the primary signal through Bayesian smoothing
     - likes provide a small positive modifier for selected skills
     - dislikes provide a stronger negative modifier, especially when comments mention broken auth, schema, pagination, tool behavior, deployment, or runtime errors
   - Handles edge cases where there are no comments, feedback entries, likes, or dislikes by returning an empty import summary and leaving learned effectiveness neutral
   - Processes aggregate `likeCount`/`dislikeCount` even when `feedbacks[]` is absent or empty
   - Ensures feedback is processed idempotently by tracking imported `feedbackId` values in `skill_feedback`
   - Keeps privacy safeguards from the existing server-list API by keeping raw `userId` internal to normalized persistence and not exposing dashboards/exports here
   - Added indexes for bridge queries: `logs.serverId`, `logs.feedbacks.feedbackId`, `skill_feedback.requestId`, `skill_feedback.importedFeedbackIds`, and `skill_feedback.serverId`
   - Added tests for like/dislike mapping, comment-to-skill attribution, duplicate feedback imports, missing `requestId` fallback behavior, aggregate counts, missing links, and empty no-signal logs

7. **Write tests** ✅
   - `feedback.test.ts`: 10 comprehensive tests covering:
     - GenerationOutcome recording with quality metrics
     - Failed outcome handling
     - Bayesian smoothing calculations
     - Skill gap detection and aggregation
     - Gap status updates
     - Top skills ranking
     - Backward compatibility with legacy format
   - All tests passing (10/10)

**Deliverable**: Generation outcomes are logged and influence future skill selection. The `FeedbackTracker` class provides effectiveness metrics, gap detection, and MongoDB persistence. Human likes/dislikes/opinions captured by the Section 3.4 feedback endpoint are planned to be bridged into `skill_feedback` so the roadmap benefits from both automated validation and real user opinion signals.

---

## Phase 4: Advanced Features & Polish (Week 7-8) ✅ COMPLETED

### Objective

Refine the system, add advanced features, prepare for production.

### Completion Review

Phase 4 is complete for the scoped deliverables that were actually promoted from roadmap into implementation. The optional RAG-enhanced example selection work remains intentionally deferred as a lower-priority follow-up, while the production-hardening items were delivered and verified.

### Tasks

1. **Performance Optimization (Essential Only)** ✅
   - `SpecProfile` hash-cache usage is implemented and measured in [`ProfileCache.get()`](src/skill-intelligence/cache.ts:17) and [`SkillSelectionAgent.analyzeSpec()`](src/skill-intelligence/agent.ts:138).
   - `SkillSelectionAgent` pre-warming at startup is implemented in [`SkillSelectionAgent.prewarm()`](src/skill-intelligence/agent.ts:70) and invoked from [`src/mcp-server-manager.ts`](src/mcp-server-manager.ts) at line 1786 when `DYNAMIC_SKILL_SELECTION` is enabled.
   - The agent-level initialization guard is implemented with [`initialized`](src/skill-intelligence/agent.ts:24) and [`initializationPromise`](src/skill-intelligence/agent.ts:25) in [`SkillSelectionAgent.initialize()`](src/skill-intelligence/agent.ts:82).
   - Lightweight timing logs were added for initialization, spec analysis, and skill composition in [`SkillSelectionAgent.initializeInternal()`](src/skill-intelligence/agent.ts:110), [`SkillSelectionAgent.updateCacheMetrics()`](src/skill-intelligence/agent.ts:169), and [`SkillSelectionAgent.selectSkills()`](src/skill-intelligence/agent.ts:156).
   - Focused verification exists in [`src/skill-intelligence/__tests__/phase4.test.ts`](src/skill-intelligence/__tests__/phase4.test.ts).

2. **RAG-Enhanced Example Selection** (Optional P3) ⏸️ Deferred by design
   - Left intentionally out of the completion gate because the roadmap marked it optional and the current repository already supports separate `rag_context` prompt injection paths in [`buildPromptWithExamples()`](src/generator/prompt.ts:89) and [`buildPromptWithDynamicSelection()`](src/generator/prompt.ts:210).
   - This remains a future enhancement rather than a blocker for Phase 4 completion.

3. **A/B Testing Framework** ✅
   - Experiment configuration is implemented in [`EXPERIMENT_CONFIG`](src/utils/config.ts:51).
   - Deterministic variant assignment is implemented in [`assignSkillSelectionVariant()`](src/generator/prompt.ts:69).
   - Control, dynamic, and hybrid paths are wired into MCP/OpenAPI prompt construction in [`buildPromptWithExamples()`](src/generator/prompt.ts:89) and the dynamic-selection flows in [`src/generator/prompt.ts`](src/generator/prompt.ts).
   - Hybrid confidence fallback is implemented using [`EXPERIMENT_CONFIG.hybridConfidenceThreshold`](src/utils/config.ts:61).

4. **Skill Health Dashboard** (CLI or simple HTML page) ✅
   - CLI dashboard output is implemented in [`printDashboard()`](src/skill-intelligence/cli.ts:37).
   - Skill gap reporting is implemented in [`generateSkillGapsDoc()`](src/skill-intelligence/cli.ts:9).

5. **Documentation** ✅
   - Agent methods now include Phase 4 doc comments in [`src/skill-intelligence/agent.ts`](src/skill-intelligence/agent.ts).
   - This roadmap section now records the completion review and implementation evidence.

6. **Monitoring & Alerting** ✅
   - Skill-selection logs emit initialization, analysis, duration, cache-hit-rate, selected-count, and confidence signals from [`src/skill-intelligence/agent.ts`](src/skill-intelligence/agent.ts).
   - Metrics surfaced by [`SkillSelectionMetrics`](src/skill-intelligence/types.ts:3) cover the primary production signals described in this phase.

7. **Safety & Fallbacks** ✅
   - Confidence-threshold fallback to safe skills is implemented in [`SkillComposer.composeSkills()`](src/skill-intelligence/composer.ts:42).
   - Feature-flag disablement is implemented in [`FEATURE_FLAGS`](src/utils/config.ts:47).
   - Hybrid fallback to static selection is implemented in [`buildPromptWithDynamicSelection()`](src/generator/prompt.ts:210).

### Validation

- Focused Phase 4 validation passed via [`bun run test:phase4`](../package.json): 5 tests passed.
- Coverage includes initialization guard behavior, cache-hit metrics, timing metrics, selection metrics, and low-confidence safe fallback behavior in [`src/skill-intelligence/__tests__/phase4.test.ts`](src/skill-intelligence/__tests__/phase4.test.ts).

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
- [x] Implement `SkillFeedbackBridge` to import Section 3.4 `logs.feedbacks` into `skill_feedback`
- [x] Extend `GenerationOutcome` records with normalized human feedback and imported `feedbackId` tracking
- [x] Update skill scoring to apply bounded human-opinion modifiers from likes, dislikes, and feedback comments
- [x] Write feedback, bridge, idempotency, and gap detection tests

### Week 7-8: Polish & Launch

- [x] Essential performance optimization: verify profile cache, pre-warm `SkillSelectionAgent`, add initialization guard, and add timing logs
- [ ] Optional: RAG-enhanced example selection
- [x] A/B testing framework with gradual rollout
- [x] Skill health dashboard (CLI)
- [x] Documentation updates
- [x] Monitoring & alerting setup
- [x] Safety fallbacks and feature flag configuration

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

**Document Version**: 2.1 (Single-Agent Architecture)
**Last Updated**: 2026-05-07
**Status**: Phase 4 Completed
