export const REQUIRED_VARIANT_IDS = [
  "static-rag-off",
  "static-rag-on",
  "dynamic-rag-off",
  "dynamic-rag-on",
] as const;

export const DEFAULT_DEMO_CASE_ID = "jsonplaceholder-input-doc";
export const DEFAULT_RESEARCH_REPEATS = 3;

export type RequiredVariantId = typeof REQUIRED_VARIANT_IDS[number];

export type MatrixPlan = {
  mode: "demo" | "full" | "custom";
  caseIds: string[];
  variantIds: string[];
  repeats: number;
  expectedBuildCount: number;
};

export function missingRequiredVariants(variantIds: string[]): string[] {
  const selected = new Set(variantIds);
  return REQUIRED_VARIANT_IDS.filter((variantId) => !selected.has(variantId));
}

export function assertRequiredVariants(variantIds: string[]): void {
  const missing = missingRequiredVariants(variantIds);
  if (missing.length > 0) {
    throw new Error(`Selected variants omit required variants: ${missing.join(", ")}`);
  }
}

export function buildMatrixPlan({
  caseIds,
  variantIds,
  repeats,
  mode = "custom",
  requireAllVariants = true,
}: {
  caseIds: string[];
  variantIds: string[];
  repeats: number;
  mode?: MatrixPlan["mode"];
  requireAllVariants?: boolean;
}): MatrixPlan {
  const uniqueCaseIds = [...new Set(caseIds.filter(Boolean))];
  const uniqueVariantIds = [...new Set(variantIds.filter(Boolean))];
  if (uniqueCaseIds.length === 0) throw new Error("Matrix plan must include at least one API doc case.");
  if (uniqueVariantIds.length === 0) throw new Error("Matrix plan must include at least one variant.");
  if (!Number.isInteger(repeats) || repeats < 1) throw new Error("Matrix plan repeats must be a positive integer.");
  if (requireAllVariants) assertRequiredVariants(uniqueVariantIds);

  return {
    mode,
    caseIds: uniqueCaseIds,
    variantIds: uniqueVariantIds,
    repeats,
    expectedBuildCount: uniqueCaseIds.length * uniqueVariantIds.length * repeats,
  };
}

export function ensureExpectedBuildCount(plan: MatrixPlan, expectedBuildCount?: number): void {
  if (expectedBuildCount === undefined) return;
  if (plan.expectedBuildCount !== expectedBuildCount) {
    throw new Error(`Expected ${expectedBuildCount} builds, but matrix plan contains ${plan.expectedBuildCount}.`);
  }
}
