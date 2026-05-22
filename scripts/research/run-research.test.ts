import { describe, expect, it } from "bun:test";
import path from "path";
import { spawnSync } from "child_process";

const root = path.resolve(import.meta.dir, "../..");

function runResearchPlan(args: string[]) {
  const result = spawnSync("bun", ["scripts/research/run-research.ts", "--dry-run", ...args], {
    cwd: root,
    encoding: "utf8",
  });
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  const planLine = result.stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith("[research-plan] "));
  expect(planLine, result.stdout).toBeTruthy();
  return JSON.parse(planLine!.slice("[research-plan] ".length)) as {
    mode: string;
    caseIds: string[];
    variantIds: string[];
    repeats: number;
    expectedBuildCount: number;
  };
}

describe("research runner planning", () => {
  it("plans the default smoke as one RAG-enabled demo build", () => {
    const plan = runResearchPlan(["--smoke"]);

    expect(plan).toEqual({
      mode: "custom",
      caseIds: ["jsonplaceholder-input-doc"],
      variantIds: ["dynamic-rag-on"],
      repeats: 1,
      expectedBuildCount: 1,
    });
  });

  it("preserves the default non-smoke demo matrix", () => {
    const plan = runResearchPlan([]);

    expect(plan.mode).toBe("demo");
    expect(plan.caseIds).toEqual(["jsonplaceholder-input-doc"]);
    expect(plan.variantIds).toEqual(["static-rag-off", "static-rag-on", "dynamic-rag-off", "dynamic-rag-on"]);
    expect(plan.repeats).toBe(3);
    expect(plan.expectedBuildCount).toBe(12);
  });

  it("keeps explicit smoke case, variant, and repeat overrides authoritative", () => {
    const plan = runResearchPlan([
      "--smoke",
      "--cases=dummyjson-input-doc",
      "--variants=static-rag-off",
      "--repeats=2",
    ]);

    expect(plan).toEqual({
      mode: "custom",
      caseIds: ["dummyjson-input-doc"],
      variantIds: ["static-rag-off"],
      repeats: 2,
      expectedBuildCount: 2,
    });
  });
});
