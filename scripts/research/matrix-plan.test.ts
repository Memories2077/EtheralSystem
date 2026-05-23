import { describe, expect, it } from "bun:test";
import { REQUIRED_VARIANT_IDS, buildMatrixPlan, ensureExpectedBuildCount } from "./matrix-plan";

describe("research matrix planner", () => {
  it("plans the default demo shape as 12 builds", () => {
    const plan = buildMatrixPlan({
      mode: "demo",
      caseIds: ["jsonplaceholder-input-doc"],
      variantIds: [...REQUIRED_VARIANT_IDS],
      repeats: 3,
    });
    expect(plan.expectedBuildCount).toBe(12);
  });

  it("plans the full three-doc shape as 36 builds", () => {
    const plan = buildMatrixPlan({
      mode: "full",
      caseIds: ["jsonplaceholder-input-doc", "dummyjson-input-doc", "pokeapi-input-doc"],
      variantIds: [...REQUIRED_VARIANT_IDS],
      repeats: 3,
    });
    expect(plan.expectedBuildCount).toBe(36);
  });

  it("rejects missing required variants", () => {
    expect(() => buildMatrixPlan({
      caseIds: ["jsonplaceholder-input-doc"],
      variantIds: ["static-rag-off"],
      repeats: 3,
    })).toThrow(/omit required variants/);
  });

  it("allows a one-cell smoke plan when the all-variant guard is disabled", () => {
    const plan = buildMatrixPlan({
      caseIds: ["jsonplaceholder-input-doc"],
      variantIds: ["dynamic-rag-on"],
      repeats: 1,
      requireAllVariants: false,
    });

    expect(plan.expectedBuildCount).toBe(1);
  });

  it("rejects invalid repeat counts", () => {
    expect(() => buildMatrixPlan({
      caseIds: ["jsonplaceholder-input-doc"],
      variantIds: [...REQUIRED_VARIANT_IDS],
      repeats: 0,
    })).toThrow(/repeats must be a positive integer/);
  });

  it("enforces explicit expected build counts", () => {
    const plan = buildMatrixPlan({
      caseIds: ["jsonplaceholder-input-doc", "dummyjson-input-doc", "pokeapi-input-doc"],
      variantIds: [...REQUIRED_VARIANT_IDS],
      repeats: 3,
    });

    expect(() => ensureExpectedBuildCount(plan, 35)).toThrow(/Expected 35 builds/);
    expect(() => ensureExpectedBuildCount(plan, 36)).not.toThrow();
  });
});
