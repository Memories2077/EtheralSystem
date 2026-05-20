import { createHash } from "crypto";
import { spawnSync } from "child_process";

export type InspectorCommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

export type InspectorExecutor = (args: string[]) => InspectorCommandResult;

export type InspectorCallOutcome = {
  tool_name: string;
  index: number;
  probe_id?: string;
  operation?: string;
  status: "success" | "failed" | "skipped";
  error_code: string;
  response_length: number;
  response_hash: string;
  diagnostic: string;
};

export type InspectorListResult = {
  connected: boolean;
  toolCount: number;
  diagnostic: string;
  raw?: unknown;
};

function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function defaultExecutor(args: string[]): InspectorCommandResult {
  const result = spawnSync("bunx", args, {
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function safeText(value: unknown, maxLength = 500): string {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function parseFirstJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const firstObject = trimmed.indexOf("{");
    const lastObject = trimmed.lastIndexOf("}");
    if (firstObject !== -1 && lastObject > firstObject) {
      try {
        return JSON.parse(trimmed.slice(firstObject, lastObject + 1));
      } catch {
        return null;
      }
    }
    const firstArray = trimmed.indexOf("[");
    const lastArray = trimmed.lastIndexOf("]");
    if (firstArray !== -1 && lastArray > firstArray) {
      try {
        return JSON.parse(trimmed.slice(firstArray, lastArray + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function toolCountFromPayload(payload: unknown): number {
  if (!payload || typeof payload !== "object") return 0;
  const record = payload as Record<string, unknown>;
  const tools = record.tools || (record.result as Record<string, unknown> | undefined)?.tools;
  return Array.isArray(tools) ? tools.length : 0;
}

function inspectorBaseArgs(mcpUrl: string, method: string): string[] {
  return [
    "@modelcontextprotocol/inspector",
    "--cli",
    mcpUrl,
    "--transport",
    "http",
    "--method",
    method,
  ];
}

export function inspectorListTools(mcpUrl: string, executor: InspectorExecutor = defaultExecutor): InspectorListResult {
  const result = executor(inspectorBaseArgs(mcpUrl, "tools/list"));
  const payload = parseFirstJson(result.stdout);
  const toolCount = toolCountFromPayload(payload);
  const connected = result.status === 0 && toolCount > 0;
  return {
    connected,
    toolCount,
    raw: payload || undefined,
    diagnostic: connected ? "" : safeText(result.stderr || result.stdout || `inspector exited with status ${result.status}`),
  };
}

export function inspectorCallTool({
  mcpUrl,
  toolName,
  index,
  probeId,
  operation,
  toolArgs = {},
  executor = defaultExecutor,
}: {
  mcpUrl: string;
  toolName: string;
  index: number;
  probeId?: string;
  operation?: string;
  toolArgs?: Record<string, unknown>;
  executor?: InspectorExecutor;
}): InspectorCallOutcome {
  const args = [
    ...inspectorBaseArgs(mcpUrl, "tools/call"),
    "--tool-name",
    toolName,
  ];

  for (const [key, value] of Object.entries(toolArgs)) {
    const renderedValue = typeof value === "string" ? value : JSON.stringify(value);
    args.push("--tool-arg", `${key}=${renderedValue}`);
  }

  const result = executor(args);
  const output = result.stdout || result.stderr || "";
  const payload = parseFirstJson(result.stdout);
  const failedByPayload = Boolean(payload && typeof payload === "object" && (payload as Record<string, unknown>).error);
  const success = result.status === 0 && !failedByPayload;
  return {
    tool_name: toolName,
    index,
    probe_id: probeId,
    operation,
    status: success ? "success" : "failed",
    error_code: success ? "" : "inspector_tool_call_failed",
    response_length: output.length,
    response_hash: output ? contentHash(output) : "",
    diagnostic: success ? "" : safeText(result.stderr || result.stdout || `inspector exited with status ${result.status}`),
  };
}

export function skippedInspectorOutcome(toolName: string, index: number, errorCode: string, diagnostic: string): InspectorCallOutcome {
  return {
    tool_name: toolName || `tool-${index + 1}`,
    index,
    status: "skipped",
    error_code: errorCode,
    response_length: 0,
    response_hash: "",
    diagnostic: safeText(diagnostic),
  };
}

export function summarizeInspectorOutcomes(outcomes: InspectorCallOutcome[]) {
  const success = outcomes.filter((item) => item.status === "success").length;
  const failed = outcomes.filter((item) => item.status === "failed").length;
  const skipped = outcomes.filter((item) => item.status === "skipped").length;
  const attempted = success + failed;
  return {
    inspectorAttemptedToolCount: attempted,
    inspectorSuccessToolCount: success,
    inspectorFailedToolCount: failed,
    inspectorSkippedToolCount: skipped,
    inspectorPassRate: attempted ? Number((success / attempted).toFixed(4)) : null,
  };
}
