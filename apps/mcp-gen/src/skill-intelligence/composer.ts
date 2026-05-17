import type {
  SkillMetadata,
  SpecProfile,
  SkillScore,
  SkillComposition,
  ScoringWeights,
  SkillCompositionOptions,
  SkillSelectionTarget,
} from "./types.js";
import { SkillRegistry } from "./registry.js";
import { FeedbackTracker } from "./feedback.js";

export class SkillComposer {
  private registry: SkillRegistry | null = null;
  private tokenBudget: number;
  private defaultWeights: ScoringWeights = {
    authMatch: 3.0,
    patternMatch: 2.0,
    complexityFit: 1.5,
    priority: 0.2,
    tokenPenaltyThreshold: 0.3,
    tokenPenaltyFactor: 0.7,
  };
  private feedbackTracker: FeedbackTracker | null = null;

  constructor(options?: {
    tokenBudget?: number;
    weights?: Partial<ScoringWeights>;
  }) {
    this.tokenBudget = options?.tokenBudget ?? 30_000;
    if (options?.weights) {
      this.defaultWeights = { ...this.defaultWeights, ...options.weights };
    }
  }

  setRegistry(registry: SkillRegistry): void {
    this.registry = registry;
  }

  setFeedbackTracker(tracker: FeedbackTracker): void {
    this.feedbackTracker = tracker;
  }

  private inferTarget(profile: SpecProfile): SkillSelectionTarget {
    return profile.source === "endpoint_text" ? "openapi" : "mcp";
  }

  private skillMatchesTarget(
    skill: SkillMetadata,
    target: SkillSelectionTarget,
  ): boolean {
    if (skill.category === target) return true;
    if (skill.category !== "auth") return false;
    return skill.id.startsWith(`${target}_`);
  }

  composeSkills(
    profile: SpecProfile,
    options: SkillCompositionOptions = {},
  ): SkillComposition {
    if (!this.registry) {
      return { skills: [], totalTokens: 0, explanations: {} };
    }

    const target = options.target ?? this.inferTarget(profile);
    const weights = this.defaultWeights;
    const scores: SkillScore[] = [];
    const explanations: Record<string, string> = {};

    // Score all skills across categories
    const allSkills = this.registry
      .getAllSkills()
      .filter((skill) => this.skillMatchesTarget(skill, target));
    for (const skill of allSkills) {
      const score = this.scoreSkill(skill, profile, weights, target);
      if (score.score > 0) {
        scores.push(score);
        explanations[skill.id] = score.reasons.join("; ");
      }
    }

    // Sort by score descending, then priority descending
    scores.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.metadata.priority ?? 50) - (a.metadata.priority ?? 50);
    });

    // Greedy selection with token budget
    const selected: SkillScore[] = [];
    let totalTokens = 0;

    for (const score of scores) {
      if (totalTokens + score.metadata.tokenCost > this.tokenBudget) {
        explanations[score.metadata.id] =
          `Skipped: exceeds token budget (${totalTokens + score.metadata.tokenCost} > ${this.tokenBudget})`;
        continue;
      }

      // Check for conflicts
      if (this.isConflict(score, selected, profile)) {
        explanations[score.metadata.id] =
          `Skipped: conflicts with already selected skill`;
        continue;
      }

      selected.push(score);
      totalTokens += score.metadata.tokenCost;
    }

    // Ensure coverage: at least one skill per active category
    this.ensureCoverage(selected, profile, allSkills, explanations, target);

    // Apply dependencies
    this.applyDependencies(selected, allSkills, explanations);

    // Recalculate total tokens and enforce hard ceiling after coverage/dependencies.
    totalTokens = selected.reduce((sum, s) => sum + s.metadata.tokenCost, 0);
    this.enforceHardTokenLimit(selected, explanations);
    totalTokens = selected.reduce((sum, s) => sum + s.metadata.tokenCost, 0);

    let averageConfidence = this.calculateAverageConfidence(selected);
    let fallbackReason: string | undefined;

    if (selected.length > 0 && averageConfidence < 0.6) {
      fallbackReason = `Average confidence ${averageConfidence.toFixed(2)} below threshold 0.60; using always/coverage skills only`;
      const fallbackSkills = selected.filter((score) =>
        this.isSafeFallbackSkill(score),
      );
      selected.splice(0, selected.length, ...fallbackSkills);
      totalTokens = selected.reduce((sum, s) => sum + s.metadata.tokenCost, 0);
      averageConfidence = this.calculateAverageConfidence(selected);
      explanations.__fallback = fallbackReason;
      console.warn(`[SkillSelect] ${fallbackReason}`);
    }

    return {
      skills: selected,
      totalTokens,
      explanations,
      averageConfidence,
      fallbackReason,
    };
  }

  private scoreSkill(
    skill: SkillMetadata,
    profile: SpecProfile,
    weights: ScoringWeights,
    target: SkillSelectionTarget,
  ): SkillScore {
    let score = 0;
    const reasons: string[] = [];

    const conditionResult = this.evaluateConditions(skill, profile);
    if (!conditionResult.matches) {
      return {
        skillId: skill.id,
        score: 0,
        confidence: 0,
        reasons: conditionResult.reasons,
        metadata: skill,
      };
    }
    reasons.push(...conditionResult.reasons);

    // 1. Base score for core target skills only. Priority should break ties,
    // not pull every prompt fragment into every generation.
    const priorityScore = skill.priority ?? 50;
    const coreScore = this.scoreCoreSkill(skill, target);
    if (coreScore > 0) {
      score += coreScore;
      reasons.push(`core target skill=${coreScore}`);
    }

    // 2. Auth type matching (high weight: 3.0)
    if (skill.category === "auth") {
      const match = this.scoreAuthMatch(skill, profile, weights.authMatch);
      score += match.score;
      reasons.push(...match.reasons);
    }

    // 3. Pattern matching (medium weight: 2.0)
    if (skill.category === target) {
      const match = this.scorePatternMatch(
        skill,
        profile,
        weights.patternMatch,
      );
      score += match.score;
      reasons.push(...match.reasons);
    }

    // 4. Complexity alignment (medium weight: 1.5)
    const complexityFit = this.scoreComplexityFit(
      skill,
      profile,
      weights.complexityFit,
    );
    score += complexityFit.score;
    reasons.push(...complexityFit.reasons);

    if (score <= 0) {
      return { skillId: skill.id, score: 0, confidence: 0, reasons, metadata: skill };
    }

    score += priorityScore * weights.priority;
    reasons.push(`priority=${priorityScore}`);

    // 5. Token budget awareness (penalty for overspend)
    if (skill.tokenCost > this.tokenBudget * weights.tokenPenaltyThreshold) {
      score *= weights.tokenPenaltyFactor;
      reasons.push("High token cost penalty applied");
    }

    // Normalize confidence to 0-1 range
    const confidence = this.normalize(score);

    // 7. Learned effectiveness from feedback tracker
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

    return { skillId: skill.id, score, confidence, reasons, metadata: skill };
  }

  private scoreAuthMatch(
    skill: SkillMetadata,
    profile: SpecProfile,
    weight: number,
  ): { score: number; reasons: string[] } {
    const reasons: string[] = [];
    let score = 0;

    if (!profile.auth.hasAuth) {
      // Anti-contamination skills should match when no auth
      if (skill.id.includes("anti_contamination")) {
        score += 50 * weight;
        reasons.push("No auth detected: anti-contamination match");
      }
      return { score, reasons };
    }

    // Match auth types
    const authTypes = profile.auth.types.map((t) => t.toLowerCase());
    const skillTags = skill.tags.map((t) => t.toLowerCase());

    for (const authType of authTypes) {
      if (skillTags.some((tag) => tag.includes(authType))) {
        score += 30 * weight;
        reasons.push(`Auth type '${authType}' matched`);
      }
    }

    // If skill is a requirements skill and we have auth, it's a good match
    if (skill.id.includes("requirements") && profile.auth.hasAuth) {
      score += 40 * weight;
      reasons.push("Auth requirements match (has auth)");
    }

    return { score, reasons };
  }

  private scoreCoreSkill(
    skill: SkillMetadata,
    target: SkillSelectionTarget,
  ): number {
    if (skill.category !== target) return 0;
    if (skill.id === `${target}_system`) return 80;
    if (skill.id === `${target}_user_message`) return 70;
    if (target === "mcp" && skill.id === "mcp_zod_mapping") return 45;
    return 0;
  }

  private scorePatternMatch(
    skill: SkillMetadata,
    profile: SpecProfile,
    weight: number,
  ): { score: number; reasons: string[] } {
    const reasons: string[] = [];
    let score = 0;

    // Zod mapping - always useful for mcp
    if (
      skill.id.includes("zod_mapping") &&
      profile.structure.endpointCount > 0
    ) {
      score += 20 * weight;
      reasons.push("Zod mapping for endpoints");
    }

    // Request patterns - useful for APIs with multiple endpoints
    if (
      skill.id.includes("request_patterns") &&
      profile.structure.endpointCount > 3
    ) {
      score += 15 * weight;
      reasons.push("Request patterns for multi-endpoint API");
    }

    // Pagination patterns
    if (profile.patterns.pagination !== "none") {
      if (skill.tags.some((t) => t.toLowerCase().includes("pagination"))) {
        score += 25 * weight;
        reasons.push(
          `Pagination pattern '${profile.patterns.pagination}' matched`,
        );
      }
    }

    // Rate limiting
    if (profile.patterns.rateLimiting) {
      if (skill.tags.some((t) => t.toLowerCase().includes("rate"))) {
        score += 15 * weight;
        reasons.push("Rate limiting detected, pattern matched");
      }
    }

    if (
      skill.id.includes("request_patterns") &&
      (profile.features?.requestBodies ||
        profile.features?.formUrlEncoded ||
        profile.features?.multipart ||
        profile.data.hasFileUpload)
    ) {
      score += 20 * weight;
      reasons.push("Request/body handling patterns matched");
    }

    return { score, reasons };
  }

  private scoreComplexityFit(
    skill: SkillMetadata,
    profile: SpecProfile,
    weight: number,
  ): { score: number; reasons: string[] } {
    const reasons: string[] = [];
    let score = 0;

    const complexity = profile.guidance.complexityScore;

    // High complexity APIs benefit from more detailed skills
    if (complexity > 50 && skill.priority >= 70) {
      score += 10 * weight;
      reasons.push(
        `High complexity (${complexity}): high-priority skill favored`,
      );
    }

    // Low complexity APIs should prefer simpler skills
    if (complexity <= 20 && skill.priority < 50) {
      score += 5 * weight;
      reasons.push(`Low complexity (${complexity}): simpler skill favored`);
    }

    return { score, reasons };
  }

  private evaluateCondition(
    cond: { field: string; operator: string; value: unknown },
    profile: SpecProfile,
  ): { match: boolean; weight: number; reason: string } {
    const fieldPath = cond.field.split(".");
    let current: unknown = profile;

    for (const segment of fieldPath) {
      if (
        current &&
        typeof current === "object" &&
        segment in (current as Record<string, unknown>)
      ) {
        current = (current as Record<string, unknown>)[segment];
      } else {
        return {
          match: false,
          weight: 0,
          reason: `Field ${cond.field} not found`,
        };
      }
    }

    const value = cond.value;
    let match = false;
    let weight = 10;

    switch (cond.operator) {
      case "equals":
        match = current === value;
        break;
      case "notEquals":
        match = current !== value;
        break;
      case "contains":
        if (Array.isArray(current)) {
          match = current.some(
            (item) =>
              String(item).toLowerCase() === String(value).toLowerCase(),
          );
        } else if (typeof current === "string") {
          match = current.toLowerCase().includes(String(value).toLowerCase());
        }
        break;
      case "gte":
        match = typeof current === "number" && current >= Number(value);
        break;
      case "lte":
        match = typeof current === "number" && current <= Number(value);
        break;
      case "gt":
        match = typeof current === "number" && current > Number(value);
        break;
      case "lt":
        match = typeof current === "number" && current < Number(value);
        break;
      case "regex":
        if (typeof current === "string" && typeof value === "string") {
          match = new RegExp(value).test(current);
        }
        break;
      case "exists":
        match = Boolean(current) === Boolean(value);
        break;
    }

    const reason = match
      ? `Condition ${cond.field} ${cond.operator} ${value}: matched`
      : `Condition ${cond.field} ${cond.operator} ${value}: no match`;

    return { match, weight, reason };
  }

  private evaluateConditions(
    skill: SkillMetadata,
    profile: SpecProfile,
  ): { matches: boolean; reasons: string[] } {
    const conditions = (skill.conditions || []).filter(
      (condition) => condition.field !== "dependsOn",
    );
    if (conditions.length === 0) return { matches: true, reasons: [] };

    const reasons: string[] = [];
    for (const condition of conditions) {
      const result = this.evaluateCondition(condition, profile);
      reasons.push(result.reason);
      if (!result.match) return { matches: false, reasons };
    }

    return { matches: true, reasons };
  }

  private calculateAverageConfidence(skills: SkillScore[]): number {
    if (skills.length === 0) return 0;
    return (
      skills.reduce((sum, skill) => sum + skill.confidence, 0) / skills.length
    );
  }

  private isSafeFallbackSkill(score: SkillScore): boolean {
    const id = score.skillId.toLowerCase();
    const tags = score.metadata.tags.map((tag) => tag.toLowerCase());
    return (
      tags.includes("always") ||
      id.includes("system") ||
      id.includes("anti_contamination") ||
      id.includes("requirements") ||
      id.includes("zod_mapping")
    );
  }

  private enforceHardTokenLimit(
    selected: SkillScore[],
    explanations: Record<string, string>,
  ): void {
    const hardLimit = 100_000;
    let totalTokens = selected.reduce(
      (sum, s) => sum + s.metadata.tokenCost,
      0,
    );
    if (totalTokens <= hardLimit) return;

    selected.sort((a, b) => {
      const scoreDiff = a.score - b.score;
      if (scoreDiff !== 0) return scoreDiff;
      return (a.metadata.priority ?? 50) - (b.metadata.priority ?? 50);
    });

    while (selected.length > 0 && totalTokens > hardLimit) {
      const removed = selected.shift();
      if (!removed) break;
      totalTokens -= removed.metadata.tokenCost;
      explanations[removed.skillId] =
        `Dropped: hard token limit exceeded (${hardLimit})`;
    }

    selected.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.metadata.priority ?? 50) - (a.metadata.priority ?? 50);
    });
  }

  private normalize(score: number): number {
    // Scores typically range from 0 to ~200 (base) + effectiveness modulation
    // Use sigmoid-like normalization: score / (score + 50) gives better distribution
    // score=0 → 0, score=50 → 0.5, score=100 → 0.67, score=200 → 0.8
    return Math.min(1, score / (score + 50));
  }

  private isConflict(
    candidate: SkillScore,
    selected: SkillScore[],
    _profile: SpecProfile,
  ): boolean {
    // Mutually exclusive auth skills
    const authSkills = [
      "mcp_requirements",
      "mcp_anti_contamination",
      "openapi_requirements",
      "openapi_anti_contamination",
    ];

    if (authSkills.includes(candidate.skillId)) {
      const hasConflict = selected.some((s) => authSkills.includes(s.skillId));
      if (hasConflict) return true;
    }

    // Mutually exclusive system.md files (only one per category)
    const systemSkills = selected.filter((s) =>
      s.metadata.id.includes("system"),
    );
    if (candidate.metadata.id.includes("system")) {
      const sameCategory = systemSkills.filter(
        (s) => s.metadata.category === candidate.metadata.category,
      );
      if (sameCategory.length > 0) return true;
    }

    return false;
  }

  private ensureCoverage(
    selected: SkillScore[],
    profile: SpecProfile,
    allSkills: SkillMetadata[],
    explanations: Record<string, string>,
    target: SkillSelectionTarget,
  ): void {
    // Ensure at least one auth skill
    const hasAuthSkill = selected.some((s) => s.metadata.category === "auth");
    if (!hasAuthSkill) {
      const authSkills = allSkills.filter((s) => s.category === "auth");
      if (authSkills.length > 0) {
        // Pick the best one based on auth presence
        const candidate = profile.auth.hasAuth
          ? authSkills.find((s) => s.id.includes("requirements"))
          : authSkills.find((s) => s.id.includes("anti_contamination"));

        const chosen = candidate ?? authSkills[0];
        const score: SkillScore = {
          skillId: chosen.id,
          score: 50,
          confidence: 0.5,
          reasons: ["Coverage: auto-included for auth category"],
          metadata: chosen,
        };
        selected.push(score);
        explanations[chosen.id] = "Auto-included for category coverage (auth)";
      }
    }

    // Ensure at least one target system skill
    const hasSystemSkill = selected.some(
      (s) => s.metadata.category !== "auth" && s.metadata.id.includes("system"),
    );
    if (!hasSystemSkill) {
      const systemSkill = allSkills.find(
        (s) => s.category === target && s.id.includes("system"),
      );
      if (systemSkill) {
        const score: SkillScore = {
          skillId: systemSkill.id,
          score: 50,
          confidence: 0.5,
          reasons: ["Coverage: auto-included for system category"],
          metadata: systemSkill,
        };
        selected.push(score);
        explanations[systemSkill.id] =
          `Auto-included for category coverage (${target} system)`;
      }
    }
  }

  private applyDependencies(
    selected: SkillScore[],
    allSkills: SkillMetadata[],
    explanations: Record<string, string>,
  ): void {
    const selectedIds = new Set(selected.map((s) => s.skillId));
    let changed = true;

    // Iterate until no more dependencies need to be added
    while (changed) {
      changed = false;
      for (const score of [...selected]) {
        const skill = allSkills.find((s) => s.id === score.skillId);
        if (!skill) continue;

        // Check for dependencies in conditions
        for (const cond of skill.conditions || []) {
          if (cond.field === "dependsOn") {
            const depId = String(cond.value);
            if (!selectedIds.has(depId)) {
              const depSkill = allSkills.find((s) => s.id === depId);
              if (depSkill) {
                const depScore: SkillScore = {
                  skillId: depSkill.id,
                  score: 40,
                  confidence: 0.5,
                  reasons: [`Dependency: required by ${skill.id}`],
                  metadata: depSkill,
                };
                selected.push(depScore);
                selectedIds.add(depId);
                explanations[depId] =
                  `Auto-included as dependency of ${skill.id}`;
                changed = true;
              }
            }
          }
        }
      }
    }
  }

  assemblePrompt(basePrompt: string, composition: SkillComposition): string {
    let prompt = basePrompt;
    const selectedIds = new Set(composition.skills.map((s) => s.skillId));

    // Load skill contents and replace injection points
    for (const scored of composition.skills) {
      const skill = this.registry?.getSkill(scored.skillId);
      if (!skill || !skill.content) continue;

      // Map skill IDs to injection points
      const injectionPoint = this.getInjectionPoint(scored.skillId);

      if (injectionPoint && prompt.includes(injectionPoint)) {
        prompt = prompt.replace(injectionPoint, skill.content);
      } else {
        // Append to end if no injection point found
        prompt += `\n\n---\n${skill.content}\n`;
      }
    }

    // Replace any remaining injection points with empty string (graceful handling)
    // Match any {{...}} pattern, not just known ones
    prompt = prompt.replace(/\{\{[^}]*\}\}/g, "");

    return prompt.trim();
  }

  private getInjectionPoint(skillId: string): string | null {
    const mapping: Record<string, string> = {
      system: "{{SYSTEM_HEADER}}",
      user_message: "{{USER_FOOTER}}",
      mcp_requirements: "{{AUTH_SECTION}}",
      mcp_anti_contamination: "{{AUTH_SECTION}}",
      openapi_requirements: "{{AUTH_SECTION}}",
      openapi_anti_contamination: "{{AUTH_SECTION}}",
      zod_mapping: "{{ZOD_MAPPING}}",
      request_patterns: "{{REQUEST_PATTERNS}}",
    };

    // Find matching injection point
    for (const [key, point] of Object.entries(mapping)) {
      if (skillId.includes(key)) {
        return point;
      }
    }

    return null;
  }
}
