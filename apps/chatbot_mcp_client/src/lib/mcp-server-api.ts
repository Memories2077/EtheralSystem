/**
 * MCP Server API utilities
 * Handles communication with the mcp-gen service for server listing and feedback.
 */

import { BACKEND_API } from "@/lib/config";

const ACTIVE_MCP_SERVER_STATUSES = new Set([
  "running",
  "building",
  "created",
  "started",
]);

export interface McpServerApi {
  serverId: string;
  status: string;
  publicUrl: string;
  createdAt: string;
  updatedAt?: string;
  dockerImage?: string;
  hostPort?: number;
  containerPort?: number;
  containerId?: string;
  traceId?: string;
  experimentId?: string;
  sessionId?: string;
  buildRequestId?: string;
  buildLogs?: string[];
  inputContent?: string;
  action?: string;
  ragContext?: string;
  likeCount: number;
  dislikeCount: number;
  feedbacks: Array<{
    feedbackId: string;
    type: "like" | "dislike";
    userId?: string;
    comment?: string;
    timestamp: string;
  }>;
}

export interface FeedbackResponse {
  success: boolean;
  serverId: string;
  likeCount: number;
  dislikeCount: number;
  totalFeedbacks: number;
}

export interface ClaudeMcpConfig {
  mcpServers?: Record<string, {
    command?: string;
    args?: string[];
  }>;
}

/**
 * Fetch all MCP servers through FastAPI's mcp-gen proxy.
 */
export async function fetchMcpServers(): Promise<McpServerApi[]> {
  const response = await fetch(BACKEND_API.mcpServers(), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Failed to fetch MCP servers" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  const data = await response.json();
  const servers = Array.isArray(data.servers) ? data.servers : [];
  return servers.filter((server: McpServerApi) =>
    ACTIVE_MCP_SERVER_STATUSES.has(String(server.status || "").toLowerCase()),
  );
}

/**
 * Submit feedback for an MCP server through FastAPI's mcp-gen proxy.
 */
export async function submitMcpServerFeedback(
  serverId: string,
  type: "like" | "dislike",
  userId?: string,
  comment?: string,
): Promise<FeedbackResponse> {
  const response = await fetch(BACKEND_API.mcpFeedback(serverId), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type,
      userId,
      comment,
    }),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Failed to submit feedback" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function fetchMcpClaudeConfig(serverId: string): Promise<ClaudeMcpConfig> {
  const response = await fetch(BACKEND_API.mcpClaudeConfig(serverId), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Failed to fetch MCP config" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export function extractMcpRemoteUrl(config?: ClaudeMcpConfig | null): string {
  const servers = config?.mcpServers || {};
  for (const server of Object.values(servers)) {
    const args = Array.isArray(server?.args) ? server.args : [];
    const url = args.find((arg) => /^https?:\/\//.test(arg));
    if (url) return url;
  }
  return "";
}
