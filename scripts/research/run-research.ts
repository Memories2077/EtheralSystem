#!/usr/bin/env bun
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { DEFAULT_DEMO_CASE_ID, DEFAULT_RESEARCH_REPEATS, REQUIRED_VARIANT_IDS, buildMatrixPlan } from "./matrix-plan";
import { validateInputDocFixture } from "./input-doc-format";

type MatrixCase = {
  id: string;
  inputPath?: string;
};

type Options = {
  datasetPath: string;
  outputPath: string;
  eventsPath: string;
  experimentId: string;
  cases: string[];
  allApiDocs: boolean;
  smoke: boolean;
  repeats: number;
  variants: string[];
  dryRun: boolean;
  restartStack: boolean;
  cleanupContainers: boolean;
  preseedRag: boolean;
  provider: string;
  model: string;
  backendUrl: string;
  managerUrl: string;
  reportRoot: string;
};

const root = process.cwd();

function env(name: string, fallback = ""): string {
  return process.env[name] || fallback;
}

function arg(name: string, fallback = ""): string {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  return env(name.toUpperCase().replaceAll("-", "_"), fallback);
}

function flag(name: string, fallback = false): boolean {
  if (process.argv.includes(`--${name}`)) return true;
  if (process.argv.includes(`--no-${name}`)) return false;
  const raw = arg(name, fallback ? "true" : "false").toLowerCase();
  return ["1", "true", "yes", "on"].includes(raw);
}

function csvArg(name: string): string[] {
  return arg(name, "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function defaultExperimentId(): string {
  const stamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[:.]/g, "-");
  return `research-${stamp}`;
}

function parseOptions(): Options {
  const experimentId = arg("experiment-id", defaultExperimentId());
  const smoke = flag("smoke", false);
  return {
    datasetPath: path.resolve(root, arg("dataset", "experiments/research-metrics/backend_toolcall_matrix_dataset.json")),
    outputPath: path.resolve(root, arg("output", "experiments/research-metrics/backend-toolcall-matrix-runs.jsonl")),
    eventsPath: arg("events", env("RESEARCH_EVENTS_JSONL_PATH", "/repo/reports/backend-toolcall-matrix/research-events.jsonl")),
    experimentId,
    cases: csvArg("cases"),
    allApiDocs: flag("all-api-docs", false) || flag("full", false),
    smoke,
    repeats: Number(arg("repeats", smoke ? "1" : String(DEFAULT_RESEARCH_REPEATS))),
    variants: csvArg("variants").length > 0 ? csvArg("variants") : smoke ? ["dynamic-rag-on"] : [...REQUIRED_VARIANT_IDS],
    dryRun: flag("dry-run", false) || flag("validate-only", false),
    restartStack: flag("restart-stack", true),
    cleanupContainers: flag("cleanup-containers", true),
    preseedRag: flag("preseed-rag", true),
    provider: arg("provider", env("BACKEND_TOOLCALL_PROVIDER", "gemini")),
    model: arg("model", env("BACKEND_TOOLCALL_MODEL", "gemini-2.5-flash")),
    backendUrl: arg("backend-url", env("E2E_BACKEND_URL", "http://localhost:8000")),
    managerUrl: arg("manager-url", env("E2E_MCP_MANAGER_URL", "http://localhost:8080")),
    reportRoot: path.resolve(root, arg("report-root", `experiments/research-metrics/reports/${experimentId}`)),
  };
}

function readDataset(filePath: string): MatrixCase[] {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as MatrixCase[];
}

function selectCases(dataset: MatrixCase[], options: Options): MatrixCase[] {
  const selectedIds = options.cases.length > 0
    ? options.cases
    : options.allApiDocs
      ? dataset.map((item) => item.id)
      : [DEFAULT_DEMO_CASE_ID];
  const selected = selectedIds.map((id) => {
    const found = dataset.find((item) => item.id === id);
    if (!found) throw new Error(`Unknown research API doc case: ${id}`);
    return found;
  });
  return selected;
}

function runCommand(command: string, args: string[]): void {
  console.info(`[research-command] ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
  }
}

async function main() {
  const options = parseOptions();
  const dataset = readDataset(options.datasetPath);
  const selectedCases = selectCases(dataset, options);

  for (const item of selectedCases) {
    if (!item.inputPath) throw new Error(`Dataset case ${item.id} is missing inputPath.`);
    validateInputDocFixture(path.resolve(root, item.inputPath));
  }

  const plan = buildMatrixPlan({
    mode: options.smoke ? "custom" : options.allApiDocs ? "full" : selectedCases.length === 1 && selectedCases[0]?.id === DEFAULT_DEMO_CASE_ID ? "demo" : "custom",
    caseIds: selectedCases.map((item) => item.id),
    variantIds: options.variants,
    repeats: options.repeats,
    requireAllVariants: !options.smoke,
  });
  console.info("[research-plan]", JSON.stringify(plan));
  if (plan.mode === "demo" && plan.expectedBuildCount !== 12) {
    throw new Error(`Default demo must plan exactly 12 builds; got ${plan.expectedBuildCount}.`);
  }
  if (options.dryRun) return;

  for (const item of selectedCases) {
    const runnerArgs = [
      "scripts/research/run-backend-toolcall-matrix.ts",
      `--dataset=${options.datasetPath}`,
      `--cases=${item.id}`,
      `--variants=${options.variants.join(",")}`,
      `--repeats=${options.repeats}`,
      `--experiment-id=${options.experimentId}`,
      `--output=${options.outputPath}`,
      `--events=${options.eventsPath}`,
      `--provider=${options.provider}`,
      `--model=${options.model}`,
      `--backend-url=${options.backendUrl}`,
      `--manager-url=${options.managerUrl}`,
      `--expected-build-count=${options.variants.length * options.repeats}`,
      options.restartStack ? "--restart-stack" : "--no-restart-stack",
      options.cleanupContainers ? "--cleanup-containers" : "--no-cleanup-containers",
      options.preseedRag ? "--preseed-rag" : "--no-preseed-rag",
      options.smoke ? "--allow-partial-variants" : "",
    ].filter(Boolean);
    runCommand("bun", runnerArgs);

    const batchOutputDir = path.join(options.reportRoot, item.id);
    runCommand("bun", [
      "scripts/research/export-research-report.ts",
      `--experiment-id=${options.experimentId}`,
      `--events=${options.eventsPath}`,
      `--matrix-runs=${options.outputPath}`,
      `--api-doc-id=${item.id}`,
      `--output-dir=${batchOutputDir}`,
    ]);
  }
}

main().catch((error) => {
  console.error("[research-error]", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
