import type { SkillEffectiveness, GenerationOutcome, SkillGap } from './types.js';
import { MongoClient, Db, Collection } from 'mongodb';

const MAX_EFFECTIVENESS_ENTRIES = 500;
const SKILL_FEEDBACK_COLLECTION = 'skill_feedback';
const SKILL_GAPS_COLLECTION = 'skill_gaps';

export class FeedbackTracker {
  private effectiveness: Map<string, SkillEffectiveness> = new Map();
  private gaps: SkillGap[] = [];
  private mongoClient: MongoClient | null = null;
  private db: Db | null = null;
  private feedbackCollection: Collection | null = null;
  private gapsCollection: Collection | null = null;
  private mongoUrl: string = process.env.MONGO_URI || 'mongodb://localhost:27017';
  private dbName: string = 'docker';
  private initialized = false;

  /** Call once at startup to wire MongoDB */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      this.mongoClient = new MongoClient(this.mongoUrl);
      await this.mongoClient.connect();
      this.db = this.mongoClient.db(this.dbName);
      this.feedbackCollection = this.db.collection(SKILL_FEEDBACK_COLLECTION);
      this.gapsCollection = this.db.collection(SKILL_GAPS_COLLECTION);

      await this.feedbackCollection.createIndex({ requestId: 1 }, { unique: true });
      await this.feedbackCollection.createIndex({ timestamp: -1 });
      await this.feedbackCollection.createIndex({ selectedSkillIds: 1 });
      await this.gapsCollection.createIndex({ status: 1, detectedAt: -1 });

      // Warm in-memory cache from DB
      await this.loadEffectivenessFromDB();

      this.initialized = true;
      console.log('✅ FeedbackTracker connected to MongoDB');
    } catch (error) {
      console.warn('⚠️ FeedbackTracker: MongoDB not available, using in-memory only:', error);
    }
  }

  private async loadEffectivenessFromDB(): Promise<void> {
    if (!this.feedbackCollection) return;
    try {
      const outcomes = await this.feedbackCollection.find({}).toArray();
      for (const doc of outcomes) {
        this.updateEffectivenessFromDoc(doc as unknown as GenerationOutcome);
      }
      console.log(`✅ Loaded effectiveness for ${this.effectiveness.size} skills from DB`);
    } catch (error) {
      console.warn('⚠️ Failed to load effectiveness from DB:', error);
    }
  }

  private updateEffectivenessFromDoc(outcome: GenerationOutcome): void {
    const skillIds = outcome.selectedSkillIds?.length
      ? outcome.selectedSkillIds
      : outcome.skillsUsed || [];
    const validationPassed = outcome.validationPassed ?? outcome.success ?? false;
    const requiredRetries = outcome.requiredRetries ?? outcome.retryCount ?? 0;
    const timestamp = outcome.timestamp;
    const codeQuality = outcome.codeQuality;

    for (const skillId of skillIds) {
      let entry = this.effectiveness.get(skillId);
      if (!entry) {
        entry = {
          skillId,
          timesUsed: 0,
          successCount: 0,
          averageBuildDurationMs: 0,
          averageTokenUsage: 0,
          lastUsed: undefined,
          bayesianSuccessRate: 0.5,
          avgRetries: 0,
          avgQualityScore: 0,
        };
      }

      entry.timesUsed++;
      if (validationPassed) entry.successCount++;
      entry.lastUsed = timestamp;

      // Running averages
      if (outcome.generationTimeMs != null) {
        entry.averageBuildDurationMs =
          (entry.averageBuildDurationMs * (entry.timesUsed - 1) + outcome.generationTimeMs) /
          entry.timesUsed;
      }
      if (outcome.tokenCount != null) {
        entry.averageTokenUsage =
          (entry.averageTokenUsage * (entry.timesUsed - 1) + outcome.tokenCount) /
          entry.timesUsed;
      }

      // Retries average
      entry.avgRetries =
        (entry.avgRetries * (entry.timesUsed - 1) + (requiredRetries || 0)) /
        entry.timesUsed;

      // Quality score average
      if (codeQuality) {
        const qScore = this.calculateQualityScore(codeQuality);
        entry.avgQualityScore =
          (entry.avgQualityScore * (entry.timesUsed - 1) + qScore) / entry.timesUsed;
      }

      // Bayesian smoothing: (successes + 1) / (total + 2)
      entry.bayesianSuccessRate = (entry.successCount + 1) / (entry.timesUsed + 2);

      this.effectiveness.set(skillId, entry);
    }

    // Evict oldest if over limit
    if (this.effectiveness.size > MAX_EFFECTIVENESS_ENTRIES) {
      const entries = Array.from(this.effectiveness.entries());
      entries.sort((a, b) => {
        const aTime = a[1].lastUsed?.getTime() ?? 0;
        const bTime = b[1].lastUsed?.getTime() ?? 0;
        return aTime - bTime;
      });
      const toRemove = entries.slice(0, entries.length - MAX_EFFECTIVENESS_ENTRIES);
      for (const [id] of toRemove) {
        this.effectiveness.delete(id);
      }
    }
  }

  private calculateQualityScore(q: GenerationOutcome['codeQuality']): number {
    if (!q) return 0;
    let score = 0;
    if (q.hasProperErrorHandling) score += 0.2;
    if (q.usesHelperFunctions) score += 0.2;
    if (q.structureCorrect) score += 0.2;
    if (q.authImplemented) score += 0.2;
    if (q.zodSchemasValid) score += 0.2;
    return score;
  }

  async recordOutcome(outcome: GenerationOutcome): Promise<void> {
    // Ensure timestamp
    if (!outcome.timestamp) outcome.timestamp = new Date();

    // Update in-memory effectiveness
    this.updateEffectivenessFromDoc(outcome);

    // Persist to MongoDB
    if (this.feedbackCollection) {
      try {
        await this.feedbackCollection.updateOne(
          { requestId: outcome.requestId },
          { $set: outcome as any },
          { upsert: true },
        );
      } catch (error) {
        console.error('❌ Failed to persist outcome to MongoDB:', error);
      }
    }

    // Check for skill gaps (only for failed validations)
    if (!outcome.validationPassed && (outcome.validationErrors?.length || 0) > 0) {
      this.detectSkillGaps(outcome);
    }
  }

  getEffectiveness(skillId: string): SkillEffectiveness | undefined {
    return this.effectiveness.get(skillId);
  }

  getAllEffectiveness(): SkillEffectiveness[] {
    return Array.from(this.effectiveness.values());
  }

  getSuccessRate(skillId: string): number {
    const entry = this.effectiveness.get(skillId);
    if (!entry || entry.timesUsed === 0) return 0;
    return entry.successCount / entry.timesUsed;
  }

  /** Bayesian smoothed success rate for scoring */
  getBayesianSuccessRate(skillId: string): number {
    const entry = this.effectiveness.get(skillId);
    if (!entry) return 0.5; // default prior
    return entry.bayesianSuccessRate;
  }

  getTopSkills(limit = 10): SkillEffectiveness[] {
    const all = Array.from(this.effectiveness.values());
    all.sort((a, b) => {
      if (b.bayesianSuccessRate !== a.bayesianSuccessRate) {
        return b.bayesianSuccessRate - a.bayesianSuccessRate;
      }
      return b.timesUsed - a.timesUsed;
    });
    return all.slice(0, limit);
  }

  detectSkillGaps(outcome: GenerationOutcome): SkillGap[] {
    const newGaps: SkillGap[] = [];
    const errorPatterns = (outcome.validationErrors || []).map(e => {
      const lower = e.toLowerCase();
      if (lower.includes('rate') || lower.includes('rate limit')) return 'rate_limiting';
      if (lower.includes('upload') || lower.includes('multipart')) return 'file_upload';
      if (lower.includes('pagination') || lower.includes('cursor') || lower.includes('offset')) return 'pagination';
      if (lower.includes('stream')) return 'streaming';
      if (lower.includes('webhook')) return 'webhooks';
      if (lower.includes('zod') || lower.includes('schema')) return 'zod_schemas';
      if (lower.includes('auth') || lower.includes('token') || lower.includes('bearer')) return 'auth';
      return 'unknown';
    });

    const uniquePatterns = [...new Set(errorPatterns)];

    for (const pattern of uniquePatterns) {
      if (pattern === 'unknown') continue;

      // Check if similar gap already exists
      const existing = this.gaps.find(
        g => g.errorPatterns.includes(pattern) && g.status === 'open'
      );

      if (existing) {
        existing.frequency++;
        existing.detectedAt = new Date();
      } else {
        const gap: SkillGap = {
          id: `gap-${Date.now()}-${pattern}`,
          detectedAt: new Date(),
          frequency: 1,
          errorPatterns: [pattern],
          suggestedSkill: `patterns.${pattern}`,
          specProfileFeatures: this.extractFeatures(outcome.specProfile),
          status: 'open',
        };
        this.gaps.push(gap);
        newGaps.push(gap);

        // Persist to MongoDB
        if (this.gapsCollection) {
          this.gapsCollection.insertOne(gap as any).catch(err => {
            console.error('❌ Failed to persist skill gap:', err);
          });
        }
      }
    }

    return newGaps;
  }

  private extractFeatures(profile: any): string[] {
    const features: string[] = [];
    if (profile?.auth?.hasAuth) features.push('auth');
    if (profile?.patterns?.pagination && profile.patterns.pagination !== 'none') {
      features.push(`pagination.${profile.patterns.pagination}`);
    }
    if (profile?.data?.hasFileUpload) features.push('file_upload');
    if (profile?.structure?.hasStreaming) features.push('streaming');
    if (profile?.structure?.hasWebhooks) features.push('webhooks');
    if (profile?.patterns?.rateLimiting) features.push('rate_limiting');
    return features;
  }

  getSkillGaps(status?: 'open' | 'addressed' | 'rejected'): SkillGap[] {
    if (status) return this.gaps.filter(g => g.status === status);
    return [...this.gaps];
  }

  updateGapStatus(gapId: string, status: SkillGap['status']): boolean {
    const gap = this.gaps.find(g => g.id === gapId);
    if (!gap) return false;
    gap.status = status;

    if (this.gapsCollection) {
      this.gapsCollection.updateOne(
        { id: gapId },
        { $set: { status } },
      ).catch(err => console.error('❌ Failed to update gap status:', err));
    }
    return true;
  }

  reset(): void {
    this.effectiveness.clear();
    this.gaps = [];
  }

  async close(): Promise<void> {
    if (this.mongoClient) {
      await this.mongoClient.close();
      this.initialized = false;
    }
  }
}
