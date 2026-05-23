import { describe, expect, it } from "bun:test";
import path from "path";
import { spawnSync } from "child_process";

const root = path.resolve(import.meta.dir, "../..");

function runResearchPlan(args: string[]) {
  const result = runResearchRaw(args);
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

function runResearchRaw(args: string[]) {
  return spawnSync("bun", ["scripts/research/run-research.ts", "--dry-run", ...args], {
    cwd: root,
    encoding: "utf8",
  });
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

  it("plans the explicit full MAPR matrix as 36 builds", () => {
    const plan = runResearchPlan([
      "--full",
      "--cases=jsonplaceholder-input-doc,dummyjson-input-doc,pokeapi-input-doc",
      "--variants=static-rag-off,static-rag-on,dynamic-rag-off,dynamic-rag-on",
      "--repeats=3",
    ]);

    expect(plan).toEqual({
      mode: "full",
      caseIds: ["jsonplaceholder-input-doc", "dummyjson-input-doc", "pokeapi-input-doc"],
      variantIds: ["static-rag-off", "static-rag-on", "dynamic-rag-off", "dynamic-rag-on"],
      repeats: 3,
      expectedBuildCount: 36,
    });
  });

  it("rejects unknown explicit API-doc cases before planning work", () => {
    const result = runResearchRaw(["--cases=missing-input-doc"]);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("Unknown research API doc case: missing-input-doc");
  });
});
