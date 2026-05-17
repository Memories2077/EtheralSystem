import type {
  SkillEffectiveness,
  GenerationOutcome,
  SkillGap,
  NormalizedHumanFeedback,
  HumanFeedbackImportSummary,
  FeedbackLogEntry,
  ServerFeedbackLog,
} from "./types.js";
import { MongoClient, Db, Collection } from "mongodb";

const MAX_EFFECTIVENESS_ENTRIES = 500;
const SKILL_FEEDBACK_COLLECTION = "skill_feedback";
const SKILL_GAPS_COLLECTION = "skill_gaps";
const LOGS_COLLECTION = "logs";
const MAX_HUMAN_FEEDBACK_MODIFIER = 0.15;
const ISSUE_TAG_PATTERNS: Array<{ tag: string; regex: RegExp }> = [
  {
    tag: "auth",
    regex: /\b(auth|token|bearer|oauth|api key|permission|unauthori[sz]ed)\b/i,
  },
  {
    tag: "schema",
    regex: /\b(zod|schema|type|validation|field|payload|response shape)\b/i,
  },
  {
    tag: "pagination",
    regex: /\b(pagination|cursor|offset|page|next token)\b/i,
  },
  {
    tag: "tool_behavior",
    regex: /\b(tool|handler|parameter|argument|input|output)\b/i,
  },
  {
    tag: "deployment",
    regex: /\b(deploy|docker|container|build|startup|port)\b/i,
  },
  {
    tag: "runtime",
    regex: /\b(runtime|crash|exception|error|timeout|failed|broken)\b/i,
  },
];

const EMPTY_IMPORT_SUMMARY: HumanFeedbackImportSummary = {
  scannedLogs: 0,
  matchedOutcomes: 0,
  importedFeedbacks: 0,
  skippedDuplicates: 0,
  skippedEmptySignals: 0,
};

export class FeedbackTracker {
  private effectiveness: Map<string, SkillEffectiveness> = new Map();
  private outcomesByRequestId: Map<string, GenerationOutcome> = new Map();
  private outcomesByBuildRequestId: Map<string, GenerationOutcome> = new Map();
  private outcomesByServerId: Map<string, GenerationOutcome> = new Map();
  private gaps: SkillGap[] = [];
  private mongoClient: MongoClient | null = null;
  private db: Db | null = null;
  private feedbackCollection: Collection | null = null;
  private gapsCollection: Collection | null = null;
  private logsCollection: Collection | null = null;
  private mongoUrl: string =
    process.env.MONGO_URI || "mongodb://localhost:27017";
  private dbName: string = "docker";
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
      this.logsCollection = this.db.collection(LOGS_COLLECTION);

      await this.feedbackCollection.createIndex(
        { requestId: 1 },
        { unique: true },
      );
      await this.feedbackCollection.createIndex({ timestamp: -1 });
      await this.feedbackCollection.createIndex({ selectedSkillIds: 1 });
      await this.feedbackCollection.createIndex({ serverId: 1 });
      await this.feedbackCollection.createIndex({ buildRequestId: 1 });
      await this.feedbackCollection.createIndex({ importedFeedbackIds: 1 });
      await this.gapsCollection.createIndex({ status: 1, detectedAt: -1 });
      await this.logsCollection.createIndex({ serverId: 1 });
      await this.logsCollection.createIndex(
        { buildRequestId: 1 },
        { sparse: true },
      );
      await this.logsCollection.createIndex({ "feedbacks.feedbackId": 1 });

      // Warm in-memory cache from DB
      await this.loadEffectivenessFromDB();

      this.initialized = true;
      console.log("✅ FeedbackTracker connected to MongoDB");
    } catch (error) {
      console.warn(
        "⚠️ FeedbackTracker: MongoDB not available, using in-memory only:",
        error,
      );
    }
  }

  private async loadEffectivenessFromDB(): Promise<void> {
    if (!this.feedbackCollection) return;
    try {
      const outcomes = await this.feedbackCollection.find({}).toArray();
      for (const doc of outcomes) {
        this.cacheOutcome(doc as unknown as GenerationOutcome);
      }
      this.rebuildEffectivenessFromCachedOutcomes();
      console.log(
        `✅ Loaded effectiveness for ${this.effectiveness.size} skills from DB`,
      );
    } catch (error) {
      console.warn("⚠️ Failed to load effectiveness from DB:", error);
    }
  }

  private cacheOutcome(outcome: GenerationOutcome): void {
    if (outcome.requestId)
      this.outcomesByRequestId.set(outcome.requestId, outcome);
    if (outcome.buildRequestId)
      this.outcomesByBuildRequestId.set(outcome.buildRequestId, outcome);
    if (outcome.serverId)
      this.outcomesByServerId.set(outcome.serverId, outcome);
  }

  private rebuildEffectivenessFromCachedOutcomes(): void {
    this.effectiveness.clear();
    const outcomes = new Set<GenerationOutcome>([
      ...this.outcomesByRequestId.values(),
      ...this.outcomesByServerId.values(),
    ]);
    for (const outcome of outcomes) {
      this.updateEffectivenessFromDoc(outcome);
    }
  }

  private updateEffectivenessFromDoc(outcome: GenerationOutcome): void {
    const skillIds = outcome.selectedSkillIds?.length
      ? outcome.selectedSkillIds
      : outcome.skillsUsed || [];
    const validationPassed =
      outcome.validationPassed ?? outcome.success ?? false;
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
          humanFeedbackScore: 0,
        };
      }

      entry.timesUsed++;
      if (validationPassed) entry.successCount++;
      entry.lastUsed = timestamp;

      // Running averages
      if (outcome.generationTimeMs != null) {
        entry.averageBuildDurationMs =
          (entry.averageBuildDurationMs * (entry.timesUsed - 1) +
            outcome.generationTimeMs) /
          entry.timesUsed;
      }
      if (outcome.tokenCount != null) {
        entry.averageTokenUsage =
          (entry.averageTokenUsage * (entry.timesUsed - 1) +
            outcome.tokenCount) /
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
          (entry.avgQualityScore * (entry.timesUsed - 1) + qScore) /
          entry.timesUsed;
      }

      const outcomeHumanFeedbackScore = this.calculateSkillHumanFeedbackScore(
        outcome,
        skillId,
      );
      entry.humanFeedbackScore =
        (entry.humanFeedbackScore * (entry.timesUsed - 1) +
          outcomeHumanFeedbackScore) /
        entry.timesUsed;

      // Bayesian smoothing: (successes + 1) / (total + 2), with bounded human-opinion modifier.
      const baseBayesianRate = (entry.successCount + 1) / (entry.timesUsed + 2);
      entry.bayesianSuccessRate = this.clamp(
        baseBayesianRate + entry.humanFeedbackScore,
        0.05,
        0.95,
      );

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
      const toRemove = entries.slice(
        0,
        entries.length - MAX_EFFECTIVENESS_ENTRIES,
      );
      for (const [id] of toRemove) {
        this.effectiveness.delete(id);
      }
    }
  }

  private calculateQualityScore(q: GenerationOutcome["codeQuality"]): number {
    if (!q) return 0;
    let score = 0;
    if (q.hasProperErrorHandling) score += 0.2;
    if (q.usesHelperFunctions) score += 0.2;
    if (q.structureCorrect) score += 0.2;
    if (q.authImplemented) score += 0.2;
    if (q.zodSchemasValid) score += 0.2;
    return score;
  }

  private calculateSkillHumanFeedbackScore(
    outcome: GenerationOutcome,
    skillId: string,
  ): number {
    const feedbacks = outcome.humanFeedback || [];
    if (!feedbacks.length) return 0;

    let rawScore = 0;
    for (const feedback of feedbacks) {
      const attributed =
        feedback.attributedSkillIds.length === 0 ||
        feedback.attributedSkillIds.includes(skillId);
      if (!attributed) continue;

      if (feedback.type === "like") {
        rawScore += 0.03;
      } else {
        rawScore -= feedback.comment ? 0.08 : 0.05;
        if (feedback.issueTags.length > 0) rawScore -= 0.04;
      }
    }

    return this.clamp(
      rawScore,
      -MAX_HUMAN_FEEDBACK_MODIFIER,
      MAX_HUMAN_FEEDBACK_MODIFIER,
    );
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  async recordOutcome(outcome: GenerationOutcome): Promise<void> {
    // Ensure timestamp
    if (!outcome.timestamp) outcome.timestamp = new Date();

    // Update in-memory effectiveness from canonical cached outcomes to keep bridge imports idempotent.
    this.cacheOutcome(outcome);
    this.rebuildEffectivenessFromCachedOutcomes();

    // Persist to MongoDB
    if (this.feedbackCollection) {
      try {
        const outcomeKey = outcome.requestId
          ? { requestId: outcome.requestId }
          : outcome.serverId
            ? { serverId: outcome.serverId }
            : undefined;

        if (outcomeKey) {
          await this.feedbackCollection.updateOne(
            outcomeKey,
            { $set: outcome as any },
            { upsert: true },
          );
        }
      } catch (error) {
        console.error("❌ Failed to persist outcome to MongoDB:", error);
      }
    }

    // Check for skill gaps (only for failed validations)
    if (
      !outcome.validationPassed &&
      (outcome.validationErrors?.length || 0) > 0
    ) {
      this.detectSkillGaps(outcome);
    }
  }

  async importHumanFeedbackFromLogs(
    logs?: ServerFeedbackLog[],
  ): Promise<HumanFeedbackImportSummary> {
    const summary: HumanFeedbackImportSummary = { ...EMPTY_IMPORT_SUMMARY };
    const sourceLogs = logs ?? (await this.fetchFeedbackLogsFromDB());
    if (!sourceLogs.length) return summary;

    for (const log of sourceLogs) {
      summary.scannedLogs++;
      const feedbackEntries = this.expandFeedbackLogEntries(log);
      if (!feedbackEntries.length) {
        summary.skippedEmptySignals++;
        continue;
      }

      const outcome = await this.findOutcomeForLog(log);
      if (!outcome) continue;
      summary.matchedOutcomes++;

      const importedIds = new Set(outcome.importedFeedbackIds || []);
      const selectedSkillIds = outcome.selectedSkillIds?.length
        ? outcome.selectedSkillIds
        : outcome.skillsUsed || [];
      const normalizedFeedback: NormalizedHumanFeedback[] = [
        ...(outcome.humanFeedback || []),
      ];
      const manualFixes = new Set(outcome.manualFixesRequired || []);
      let importedAny = false;

      for (const entry of feedbackEntries) {
        if (!entry.feedbackId || importedIds.has(entry.feedbackId)) {
          summary.skippedDuplicates++;
          continue;
        }

        const comment = this.normalizeComment(entry.comment);
        const issueTags = this.extractIssueTags(comment);
        const normalized: NormalizedHumanFeedback = {
          feedbackId: entry.feedbackId,
          type: entry.type!,
          comment: comment || undefined,
          userId: entry.userId,
          timestamp: entry.timestamp ? new Date(entry.timestamp) : new Date(),
          serverId: log.serverId || outcome.serverId || "",
          requestId: outcome.requestId,
          attributedSkillIds: this.attributeFeedbackToSkills(
            selectedSkillIds,
            comment,
            issueTags,
          ),
          issueTags,
        };

        normalizedFeedback.push(normalized);
        importedIds.add(entry.feedbackId);
        if (normalized.type === "dislike" && comment) manualFixes.add(comment);
        summary.importedFeedbacks++;
        importedAny = true;
      }

      if (!importedAny) continue;

      outcome.humanFeedback = normalizedFeedback;
      outcome.importedFeedbackIds = [...importedIds];
      outcome.manualFixesRequired = [...manualFixes];
      outcome.reviewerRating = this.calculateReviewerRating(normalizedFeedback);
      outcome.humanFeedbackScore =
        this.calculateOutcomeHumanFeedbackScore(normalizedFeedback);
      this.cacheOutcome(outcome);

      if (this.feedbackCollection) {
        const outcomeKey = outcome.requestId
          ? { requestId: outcome.requestId }
          : outcome.buildRequestId
            ? { buildRequestId: outcome.buildRequestId }
            : { serverId: outcome.serverId };
        await this.feedbackCollection.updateOne(
          outcomeKey,
          {
            $set: {
              reviewerRating: outcome.reviewerRating,
              manualFixesRequired: outcome.manualFixesRequired,
              humanFeedback: outcome.humanFeedback,
              importedFeedbackIds: outcome.importedFeedbackIds,
              humanFeedbackScore: outcome.humanFeedbackScore,
            },
          },
        );
      }
    }

    this.rebuildEffectivenessFromCachedOutcomes();
    return summary;
  }

  private async fetchFeedbackLogsFromDB(): Promise<ServerFeedbackLog[]> {
    if (!this.logsCollection) return [];
    return this.logsCollection
      .find({
        $or: [
          { likeCount: { $gt: 0 } },
          { dislikeCount: { $gt: 0 } },
          { "feedbacks.0": { $exists: true } },
        ],
      })
      .project({
        serverId: 1,
        requestId: 1,
        buildRequestId: 1,
        likeCount: 1,
        dislikeCount: 1,
        feedbacks: 1,
        _id: 0,
      })
      .toArray() as Promise<ServerFeedbackLog[]>;
  }

  private async findOutcomeForLog(
    log: ServerFeedbackLog,
  ): Promise<GenerationOutcome | undefined> {
    if (log.requestId && this.outcomesByRequestId.has(log.requestId)) {
      return this.outcomesByRequestId.get(log.requestId);
    }
    if (
      log.buildRequestId &&
      this.outcomesByBuildRequestId.has(log.buildRequestId)
    ) {
      return this.outcomesByBuildRequestId.get(log.buildRequestId);
    }
    if (log.buildRequestId && this.outcomesByRequestId.has(log.buildRequestId)) {
      return this.outcomesByRequestId.get(log.buildRequestId);
    }
    if (log.serverId && this.outcomesByServerId.has(log.serverId)) {
      return this.outcomesByServerId.get(log.serverId);
    }
    if (!this.feedbackCollection) return undefined;

    const candidates: Array<Record<string, string>> = [];
    if (log.requestId) candidates.push({ requestId: log.requestId });
    if (log.buildRequestId) {
      candidates.push({ requestId: log.buildRequestId });
      candidates.push({ buildRequestId: log.buildRequestId });
    }
    if (log.serverId) candidates.push({ serverId: log.serverId });
    if (!candidates.length) return undefined;

    const doc = await this.feedbackCollection.findOne(
      candidates.length === 1 ? candidates[0] : { $or: candidates },
    );
    if (!doc) return undefined;
    const outcome = doc as unknown as GenerationOutcome;
    this.cacheOutcome(outcome);
    return outcome;
  }

  private expandFeedbackLogEntries(log: ServerFeedbackLog): FeedbackLogEntry[] {
    const explicitEntries = (log.feedbacks || []).filter(
      (entry) => entry.type === "like" || entry.type === "dislike",
    );
    if (explicitEntries.length > 0) {
      return explicitEntries.map((entry, index) => ({
        ...entry,
        feedbackId:
          entry.feedbackId ||
          `${log.serverId || "unknown"}-${entry.type}-${index}`,
      }));
    }

    const entries: FeedbackLogEntry[] = [];
    const likeCount = Math.max(0, log.likeCount || 0);
    const dislikeCount = Math.max(0, log.dislikeCount || 0);
    for (let i = 0; i < likeCount; i++) {
      entries.push({
        feedbackId: `${log.serverId || "unknown"}-aggregate-like-${i + 1}`,
        type: "like",
      });
    }
    for (let i = 0; i < dislikeCount; i++) {
      entries.push({
        feedbackId: `${log.serverId || "unknown"}-aggregate-dislike-${i + 1}`,
        type: "dislike",
      });
    }
    return entries;
  }

  private normalizeComment(comment?: string): string {
    return (comment || "").trim().replace(/\s+/g, " ");
  }

  private extractIssueTags(comment: string): string[] {
    if (!comment) return [];
    return ISSUE_TAG_PATTERNS.filter(({ regex }) => regex.test(comment)).map(
      ({ tag }) => tag,
    );
  }

  private attributeFeedbackToSkills(
    skillIds: string[],
    comment: string,
    issueTags: string[],
  ): string[] {
    if (!skillIds.length) return [];
    if (!comment || issueTags.length === 0) return skillIds;

    const matched = skillIds.filter((skillId) => {
      const normalizedSkillId = skillId.toLowerCase();
      return issueTags.some(
        (tag) =>
          normalizedSkillId.includes(tag.replace("_", "")) ||
          normalizedSkillId.includes(tag),
      );
    });

    return matched.length > 0 ? matched : skillIds;
  }

  private calculateReviewerRating(
    feedbacks: NormalizedHumanFeedback[],
  ): number | undefined {
    if (!feedbacks.length) return undefined;
    const total = feedbacks.reduce(
      (sum, feedback) => sum + (feedback.type === "like" ? 5 : 1),
      0,
    );
    return total / feedbacks.length;
  }

  private calculateOutcomeHumanFeedbackScore(
    feedbacks: NormalizedHumanFeedback[],
  ): number {
    if (!feedbacks.length) return 0;
    const raw = feedbacks.reduce((sum, feedback) => {
      if (feedback.type === "like") return sum + 0.03;
      return (
        sum -
        (feedback.comment ? 0.08 : 0.05) -
        (feedback.issueTags.length ? 0.04 : 0)
      );
    }, 0);
    return this.clamp(
      raw,
      -MAX_HUMAN_FEEDBACK_MODIFIER,
      MAX_HUMAN_FEEDBACK_MODIFIER,
    );
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
    const errorPatterns = (outcome.validationErrors || []).map((e) => {
      const lower = e.toLowerCase();
      if (lower.includes("rate") || lower.includes("rate limit"))
        return "rate_limiting";
      if (lower.includes("upload") || lower.includes("multipart"))
        return "file_upload";
      if (
        lower.includes("pagination") ||
        lower.includes("cursor") ||
        lower.includes("offset")
      )
        return "pagination";
      if (lower.includes("stream")) return "streaming";
      if (lower.includes("webhook")) return "webhooks";
      if (lower.includes("zod") || lower.includes("schema"))
        return "zod_schemas";
      if (
        lower.includes("auth") ||
        lower.includes("token") ||
        lower.includes("bearer")
      )
        return "auth";
      return "unknown";
    });

    const uniquePatterns = [...new Set(errorPatterns)];

    for (const pattern of uniquePatterns) {
      if (pattern === "unknown") continue;

      // Check if similar gap already exists
      const existing = this.gaps.find(
        (g) => g.errorPatterns.includes(pattern) && g.status === "open",
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
          status: "open",
        };
        this.gaps.push(gap);
        newGaps.push(gap);

        // Persist to MongoDB
        if (this.gapsCollection) {
          this.gapsCollection.insertOne(gap as any).catch((err) => {
            console.error("❌ Failed to persist skill gap:", err);
          });
        }
      }
    }

    return newGaps;
  }

  private extractFeatures(profile: any): string[] {
    const features: string[] = [];
    if (profile?.auth?.hasAuth) features.push("auth");
    if (
      profile?.patterns?.pagination &&
      profile.patterns.pagination !== "none"
    ) {
      features.push(`pagination.${profile.patterns.pagination}`);
    }
    if (profile?.data?.hasFileUpload) features.push("file_upload");
    if (profile?.structure?.hasStreaming) features.push("streaming");
    if (profile?.structure?.hasWebhooks) features.push("webhooks");
    if (profile?.patterns?.rateLimiting) features.push("rate_limiting");
    return features;
  }

  getSkillGaps(status?: "open" | "addressed" | "rejected"): SkillGap[] {
    if (status) return this.gaps.filter((g) => g.status === status);
    return [...this.gaps];
  }

  updateGapStatus(gapId: string, status: SkillGap["status"]): boolean {
    const gap = this.gaps.find((g) => g.id === gapId);
    if (!gap) return false;
    gap.status = status;

    if (this.gapsCollection) {
      this.gapsCollection
        .updateOne({ id: gapId }, { $set: { status } })
        .catch((err) => console.error("❌ Failed to update gap status:", err));
    }
    return true;
  }

  reset(): void {
    this.effectiveness.clear();
    this.outcomesByRequestId.clear();
    this.outcomesByBuildRequestId.clear();
    this.outcomesByServerId.clear();
    this.gaps = [];
  }

  async close(): Promise<void> {
    if (this.mongoClient) {
      await this.mongoClient.close();
      this.initialized = false;
    }
  }
}
