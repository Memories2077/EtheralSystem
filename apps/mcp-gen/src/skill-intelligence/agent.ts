import type {
  SpecProfile,
  SkillComposition,
  GenerationOutcome,
  HumanFeedbackImportSummary,
  ServerFeedbackLog,
  SkillSelectionInitializationResult,
  SkillSelectionMetrics,
  SkillCompositionOptions,
} from "./types.js";
import { SkillRegistry } from "./registry.js";
import { SpecProfileAnalyzer } from "./analyzer.js";
import { SkillComposer } from "./composer.js";
import { FeedbackTracker } from "./feedback.js";
import { ProfileCache } from "./cache.js";
import { recordResearchEvent } from "../utils/research-metrics.js";

export class SkillSelectionAgent {
  private static instance: SkillSelectionAgent | null = null;

  private registry: SkillRegistry;
  private analyzer: SpecProfileAnalyzer;
  private composer: SkillComposer;
  private feedback: FeedbackTracker;
  private cache: ProfileCache;

  private initialized = false;
  private initializationPromise: Promise<SkillSelectionInitializationResult> | null =
    null;
  private metrics: SkillSelectionMetrics = {
    initializationDurationMs: 0,
    analysisCount: 0,
    analysisCacheHits: 0,
    analysisCacheMisses: 0,
    lastAnalysisDurationMs: 0,
    lastCompositionDurationMs: 0,
    lastSelectedCount: 0,
    lastSelectionConfidence: 0,
    cacheHitRate: 0,
  };

  constructor(options?: {
    skillsBaseDir?: string;
    tokenBudget?: number;
    cacheSize?: number;
  }) {
    this.registry = SkillRegistry.getInstance({
      skillsBaseDir: options?.skillsBaseDir,
    });
    this.analyzer = new SpecProfileAnalyzer();
    this.composer = new SkillComposer({
      tokenBudget: options?.tokenBudget,
    });
    this.feedback = new FeedbackTracker();
    this.cache = new ProfileCache(options?.cacheSize);
  }

  static getInstance(options?: {
    skillsBaseDir?: string;
    tokenBudget?: number;
    cacheSize?: number;
  }): SkillSelectionAgent {
    if (!SkillSelectionAgent.instance) {
      SkillSelectionAgent.instance = new SkillSelectionAgent(options);
    }
    return SkillSelectionAgent.instance;
  }

  static resetInstance(): void {
    SkillSelectionAgent.instance = null;
  }

  static async prewarm(options?: {
    skillsBaseDir?: string;
    tokenBudget?: number;
    cacheSize?: number;
  }): Promise<SkillSelectionInitializationResult> {
    return SkillSelectionAgent.getInstance(options).initialize();
  }

  /**
   * Initialize registry, skill indexes/content, and feedback effectiveness exactly once.
   * Concurrent callers share the same promise to avoid duplicate file scans or MongoDB setup.
   */
  async initialize(): Promise<SkillSelectionInitializationResult> {
    if (this.initialized) {
      return {
        registryErrors: {
          missingId: [],
          missingCategory: [],
          duplicateIds: [],
          invalidPriority: [],
        },
        durationMs: 0,
        warmedSkillCount: this.registry.getSkillCount(),
      };
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.initializeInternal();
    try {
      const result = await this.initializationPromise;
      this.initialized = true;
      return result;
    } finally {
      this.initializationPromise = null;
    }
  }

  private async initializeInternal(): Promise<SkillSelectionInitializationResult> {
    const start = performance.now();
    const errors = await this.registry.initialize();
    this.composer.setRegistry(this.registry);
    this.composer.setFeedbackTracker(this.feedback);

    if (process.env.SKILL_FEEDBACK_ENABLED === "true") {
      await this.feedback.initialize();
    }

    const durationMs = Math.round(performance.now() - start);
    this.metrics.initializationDurationMs = durationMs;
    const warmedSkillCount = this.registry.getSkillCount();
    console.log(
      `[SkillSelect] initialization_duration_ms=${durationMs} warmed_skills=${warmedSkillCount}`,
    );
    void recordResearchEvent({
      service: "mcp-gen",
      stage: "skill_selection",
      eventName: "skill_selection_initialized",
      status: "success",
      durationMs,
      metrics: {
        skill_selection_initialization_ms: durationMs,
        warmed_skill_count: warmedSkillCount,
        registry_error_count: Object.values(errors).reduce((sum, values) => sum + values.length, 0),
      },
    });

    return {
      registryErrors: {
        missingId: errors.missingId,
        missingCategory: errors.missingCategory,
        duplicateIds: errors.duplicateIds,
        invalidPriority: errors.invalidPriority,
      },
      durationMs,
      warmedSkillCount,
    };
  }

  /** Analyze an OpenAPI/input document, using the hash cache and recording cache metrics. */
  analyzeSpec(specContent: string): SpecProfile {
    const start = performance.now();
    this.metrics.analysisCount++;
    const cached = this.cache.get(specContent);
    if (cached) {
      this.metrics.analysisCacheHits++;
      this.updateCacheMetrics(start, true);
      return cached;
    }

    this.metrics.analysisCacheMisses++;
    const profile = this.analyzer.analyzeSpec(specContent);
    this.cache.set(specContent, profile);
    this.updateCacheMetrics(start, false);
    return profile;
  }

  /** Select and score skills for a profile with timing and decision logs. */
  selectSkills(
    profile: SpecProfile,
    options: SkillCompositionOptions = {},
  ): SkillComposition {
    const start = performance.now();
    const composition = this.composer.composeSkills(profile, options);
    const durationMs = Math.round(performance.now() - start);
    this.metrics.lastCompositionDurationMs = durationMs;
    this.metrics.lastSelectedCount = composition.skills.length;
    this.metrics.lastSelectionConfidence = composition.averageConfidence ?? 0;
    console.log(
      `[SkillSelect] skill_selection_duration_ms=${durationMs} skills_selected_count=${composition.skills.length} selection_confidence=${this.metrics.lastSelectionConfidence.toFixed(2)} selected=${composition.skills.map((s) => s.skillId).join(",")}`,
    );
    void recordResearchEvent({
      service: "mcp-gen",
      stage: "skill_selection",
      eventName: "skill_selection_completed",
      status: "success",
      durationMs,
      metrics: {
        skill_selection_duration_ms: durationMs,
        selected_skill_count: composition.skills.length,
        selection_confidence: this.metrics.lastSelectionConfidence,
        selected_skill_ids: composition.skills.map((s) => s.skillId),
        skill_total_tokens: composition.totalTokens,
        fallback_reason: composition.fallbackReason,
      },
    });
    return composition;
  }

  private updateCacheMetrics(start: number, cacheHit: boolean): void {
    const durationMs = Math.round(performance.now() - start);
    const cacheStats = this.cache.getStats();
    this.metrics.lastAnalysisDurationMs = durationMs;
    this.metrics.cacheHitRate = cacheStats.hitRate;
    console.log(
      `[SkillSelect] spec_analysis_duration_ms=${durationMs} cache_hit=${cacheHit} cache_hit_rate=${cacheStats.hitRate.toFixed(2)}`,
    );
    void recordResearchEvent({
      service: "mcp-gen",
      stage: "skill_selection",
      eventName: "spec_analysis_completed",
      status: "success",
      durationMs,
      metrics: {
        spec_analysis_duration_ms: durationMs,
        analysis_cache_hit: cacheHit,
        analysis_cache_hit_rate: cacheStats.hitRate,
      },
    });
  }

  assemblePrompt(basePrompt: string, composition: SkillComposition): string {
    return this.composer.assemblePrompt(basePrompt, composition);
  }

  recordFeedback(outcome: GenerationOutcome): Promise<void> {
    return this.feedback.recordOutcome(outcome);
  }

  importHumanFeedbackFromLogs(
    logs?: ServerFeedbackLog[],
  ): Promise<HumanFeedbackImportSummary> {
    return this.feedback.importHumanFeedbackFromLogs(logs);
  }

  getSkillEffectiveness(skillId: string) {
    return this.feedback.getEffectiveness(skillId);
  }

  getRegistry(): SkillRegistry {
    return this.registry;
  }

  getAnalyzer(): SpecProfileAnalyzer {
    return this.analyzer;
  }

  getComposer(): SkillComposer {
    return this.composer;
  }

  getFeedbackTracker(): FeedbackTracker {
    return this.feedback;
  }

  getCache(): ProfileCache {
    return this.cache;
  }

  getMetrics(): SkillSelectionMetrics {
    return { ...this.metrics };
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}
