import { execFileSync } from "child_process";

export type CleanupStatus = "removed" | "skipped" | "failed";

export type CleanupResult = {
  cleanupAttempted: boolean;
  cleanupStatus: CleanupStatus;
  cleanupMethod: "manager-delete" | "docker-rm" | "none";
  cleanupDurationMs: number;
  cleanupError: string;
  containerRemovedCount: number;
  containerSkippedCount: number;
  containerFailedCount: number;
};

export type CleanupFetch = (url: string, init?: RequestInit) => Promise<Response>;
export type CleanupExec = (file: string, args: string[]) => string | void;

const PROTECTED_COMPOSE_CONTAINERS = new Set([
  "mongodb",
  "rabbitmq",
  "chromadb-server",
  "docker-manager",
  "my-proxy",
  "agent-service",
  "chatbot-backend",
  "chatbot-frontend",
]);

function safeText(value: unknown, maxLength = 500): string {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

export function tokenFromMcpUrl(raw: string): string {
  try {
    return new URL(raw).searchParams.get("token") || "";
  } catch {
    return "";
  }
}

function result(status: CleanupStatus, method: CleanupResult["cleanupMethod"], startedAt: number, error = ""): CleanupResult {
  return {
    cleanupAttempted: method !== "none",
    cleanupStatus: status,
    cleanupMethod: method,
    cleanupDurationMs: Date.now() - startedAt,
    cleanupError: safeText(error),
    containerRemovedCount: status === "removed" ? 1 : 0,
    containerSkippedCount: status === "skipped" ? 1 : 0,
    containerFailedCount: status === "failed" ? 1 : 0,
  };
}

function isContainerRunning(containerId: string, execImpl: CleanupExec): boolean {
  try {
    const output = execImpl("docker", ["ps", "-q", "--filter", `id=${containerId}`]);
    return String(output || "").trim().length > 0;
  } catch {
    return true;
  }
}

function dockerRemove(containerId: string, startedAt: number, execImpl: CleanupExec): CleanupResult {
  if (PROTECTED_COMPOSE_CONTAINERS.has(containerId)) {
    return result("failed", "docker-rm", startedAt, `refusing to remove protected Compose container ${containerId}`);
  }
  try {
    execImpl("docker", ["rm", "-f", containerId]);
    return result("removed", "docker-rm", startedAt);
  } catch (error) {
    return result("failed", "docker-rm", startedAt, error instanceof Error ? error.message : String(error));
  }
}

export async function cleanupGeneratedContainer({
  managerUrl,
  serverId,
  mcpUrl,
  containerId,
  enabled = true,
  fetchImpl = fetch,
  execImpl = (file, args) => {
    execFileSync(file, args, { encoding: "utf8" });
  },
}: {
  managerUrl: string;
  serverId?: string;
  mcpUrl?: string;
  containerId?: string;
  enabled?: boolean;
  fetchImpl?: CleanupFetch;
  execImpl?: CleanupExec;
}): Promise<CleanupResult> {
  const startedAt = Date.now();
  if (!enabled) return result("skipped", "none", startedAt, "cleanup disabled");

  const token = tokenFromMcpUrl(mcpUrl || "");
  if (serverId && token) {
    try {
      const response = await fetchImpl(`${managerUrl.replace(/\/$/, "")}/api/mcp/${encodeURIComponent(serverId)}?token=${encodeURIComponent(token)}`, {
        method: "DELETE",
      });
      if (response.ok) {
        if (!containerId || !isContainerRunning(containerId, execImpl)) {
          return result("removed", "manager-delete", startedAt);
        }
        return dockerRemove(containerId, startedAt, execImpl);
      }
      const body = await response.text().catch(() => "");
      if (!containerId) {
        return result("failed", "manager-delete", startedAt, `manager delete HTTP ${response.status}: ${body}`);
      }
    } catch (error) {
      if (!containerId) return result("failed", "manager-delete", startedAt, error instanceof Error ? error.message : String(error));
    }
  }

  if (containerId) {
    return dockerRemove(containerId, startedAt, execImpl);
  }

  return result("skipped", "none", startedAt, "missing generated container identity");
}
