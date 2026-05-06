import type {
  SpecProfile,
  SkillComposition,
  GenerationOutcome,
  HumanFeedbackImportSummary,
} from "./types.js";
import { SkillRegistry } from "./registry.js";
import { SpecProfileAnalyzer } from "./analyzer.js";
import { SkillComposer } from "./composer.js";
import { FeedbackTracker } from "./feedback.js";
import { ProfileCache } from "./cache.js";

export class SkillSelectionAgent {
  private static instance: SkillSelectionAgent | null = null;

  private registry: SkillRegistry;
  private analyzer: SpecProfileAnalyzer;
  private composer: SkillComposer;
  private feedback: FeedbackTracker;
  private cache: ProfileCache;

  private constructor(options?: {
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

  async initialize(): Promise<{ registryErrors: Record<string, string[]> }> {
    const errors = await this.registry.initialize();
    this.composer.setRegistry(this.registry);
    this.composer.setFeedbackTracker(this.feedback);

    // Initialize feedback tracker (MongoDB connection)
    await this.feedback.initialize();

    return {
      registryErrors: {
        missingId: errors.missingId,
        missingCategory: errors.missingCategory,
        duplicateIds: errors.duplicateIds,
        invalidPriority: errors.invalidPriority,
      },
    };
  }

  analyzeSpec(specContent: string): SpecProfile {
    const cached = this.cache.get(specContent);
    if (cached) return cached;

    const profile = this.analyzer.analyzeSpec(specContent);
    this.cache.set(specContent, profile);
    return profile;
  }

  selectSkills(profile: SpecProfile): SkillComposition {
    return this.composer.composeSkills(profile);
  }

  assemblePrompt(basePrompt: string, composition: SkillComposition): string {
    return this.composer.assemblePrompt(basePrompt, composition);
  }

  recordFeedback(outcome: GenerationOutcome): void {
    this.feedback.recordOutcome(outcome);
  }

  importHumanFeedbackFromLogs(): Promise<HumanFeedbackImportSummary> {
    return this.feedback.importHumanFeedbackFromLogs();
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
}
