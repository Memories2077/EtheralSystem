import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import express, { Request, Response } from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";

const REDDIT_API_BASE = "https://www.reddit.com";
const REDDIT_OAUTH_BASE = "https://oauth.reddit.com";
const USER_AGENT = "reddit-mcp/1.0";

// Helper function for making Reddit API requests with proper error handling
async function makeRedditRequest<T>(
  url: string,
  options: RequestInit = {},
): Promise<{ data: T | null; error: string | null }> {
  // FIX: Allow custom User-Agent to override default by spreading options.headers FIRST
  const headers = {
    ...options.headers,
    "User-Agent": (options.headers as any)?.["User-Agent"] || USER_AGENT,
  };

  try {
    const response = await fetch(url, { ...options, headers });

    // Get response text for better error reporting
    const responseText = await response.text();

    if (!response.ok) {
      console.error(
        `HTTP error! status: ${response.status}, body: ${responseText}`,
      );
      return {
        data: null,
        error: `HTTP ${response.status}: ${responseText}`,
      };
    }

    try {
      const data = JSON.parse(responseText) as T;
      return { data, error: null };
    } catch (parseError) {
      console.error("JSON parse error:", parseError, "Response:", responseText);
      return {
        data: null,
        error: "Failed to parse JSON response",
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error making Reddit request:", errorMessage);
    return {
      data: null,
      error: `Network error: ${errorMessage}`,
    };
  }
}

// Interface definitions
interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

interface ErrorResponse {
  error: string;
  error_description?: string;
}

interface UserInfo {
  comment_karma: number;
  created: number;
  created_utc: number;
  has_mail: boolean;
  has_mod_mail: boolean;
  has_verified_email: boolean | null;
  id: string;
  is_gold: boolean;
  is_mod: boolean;
  link_karma: number;
  name: string;
  over_18: boolean;
}

interface KarmaResponse {
  data: Array<{
    sr: string;
    link_karma: number;
    comment_karma: number;
  }>;
}

interface PrefsResponse {
  // Free-form object with additionalProperties: true
  [key: string]: any;
}

interface TrophiesResponse {
  data: {
    trophies: Array<any>;
  };
}

interface AnnouncementsResponse {
  // Free-form object with additionalProperties: true
  [key: string]: any;
}

interface SuccessResponse {
  success: boolean;
}

// Create MCP server
const server = new McpServer({
  name: "reddit",
  version: "1.0.0",
});

// Token acquisition tool
server.registerTool(
  "get-access-token",
  {
    title: "Get Access Token",
    description: "Obtain an OAuth2 access token using the password grant flow.",
    inputSchema: z.object({
      grant_type: z.string().describe('Always "password" for this flow'),
      username: z.string().describe("Your Reddit username"),
      password: z.string().describe("Your Reddit password"),
      client_id: z.string().describe("Your Reddit app's client ID"),
      client_secret: z.string().describe("Your Reddit app's client secret"),
      "User-Agent": z
        .string()
        .describe(
          'A unique identifier for your application (e.g., "script:your_app_name:v1.0 (by /u/your_username)")',
        ),
    }),
  },
  async ({
    grant_type,
    username,
    password,
    client_id,
    client_secret,
    "User-Agent": userAgent,
  }) => {
    const url = `${REDDIT_API_BASE}/api/v1/access_token`;
    const requestBody = new URLSearchParams({
      grant_type,
      username,
      password,
    });

    const { data: response, error } = await makeRedditRequest<
      TokenResponse | ErrorResponse
    >(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${client_id}:${client_secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": userAgent,
      },
      body: requestBody.toString(),
    });

    if (error || !response) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to obtain access token. Error: ${error || "Unknown error"}`,
          },
        ],
      };
    }

    // Check if response is an error
    if ("error" in response) {
      return {
        content: [
          {
            type: "text",
            text: `Authentication failed: ${response.error}${response.error_description ? " - " + response.error_description : ""}`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Access token obtained successfully:\nToken: ${response.access_token}\nType: ${response.token_type}\nExpires in: ${response.expires_in} seconds\nScope: ${response.scope}`,
        },
      ],
    };
  },
);

// User info tool
server.registerTool(
  "get-current-user",
  {
    title: "Get Current User",
    description: "Returns information about the currently authenticated user.",
    inputSchema: z.object({
      bearer_token: z.string().describe("Bearer token obtained from step 1"),
      "User-Agent": z
        .string()
        .describe("A unique identifier for your application"),
    }),
  },
  async ({ bearer_token, "User-Agent": userAgent }) => {
    const url = `${REDDIT_OAUTH_BASE}/api/v1/me`;
    const { data: userInfo, error } = await makeRedditRequest<
      UserInfo | ErrorResponse
    >(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${bearer_token}`,
        "User-Agent": userAgent,
      },
    });

    if (error || !userInfo) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to retrieve user info. Error: ${error || "Unknown error"}`,
          },
        ],
      };
    }

    if ("error" in userInfo) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${userInfo.error}`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `User ID: ${userInfo.id}\nUsername: ${userInfo.name}\nLink Karma: ${userInfo.link_karma}\nComment Karma: ${userInfo.comment_karma}\nOver 18: ${userInfo.over_18}`,
        },
      ],
    };
  },
);

// User karma tool
server.registerTool(
  "get-user-karma",
  {
    title: "Get User Karma",
    description:
      "Returns the karma breakdown by subreddit for the authenticated user.",
    inputSchema: z.object({
      bearer_token: z.string().describe("Bearer token obtained from step 1"),
      "User-Agent": z
        .string()
        .describe("A unique identifier for your application"),
    }),
  },
  async ({ bearer_token, "User-Agent": userAgent }) => {
    const url = `${REDDIT_OAUTH_BASE}/api/v1/me/karma`;
    const { data: karmaResponse, error } = await makeRedditRequest<
      KarmaResponse | ErrorResponse
    >(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${bearer_token}`,
        "User-Agent": userAgent,
      },
    });

    if (error || !karmaResponse) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to retrieve user karma. Error: ${error || "Unknown error"}`,
          },
        ],
      };
    }

    if ("error" in karmaResponse) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${karmaResponse.error}`,
          },
        ],
      };
    }

    // Format response
    const formatted = karmaResponse.data
      .map(
        (k) =>
          `Subreddit: ${k.sr}, Link Karma: ${k.link_karma}, Comment Karma: ${k.comment_karma}`,
      )
      .join("\n");
    return {
      content: [
        {
          type: "text",
          text: `Karma breakdown:\n${formatted}`,
        },
      ],
    };
  },
);

// User preferences tool
server.registerTool(
  "get-user-prefs",
  {
    title: "Get User Preferences",
    description: "Returns the preferences for the authenticated user.",
    inputSchema: z.object({
      bearer_token: z.string().describe("Bearer token obtained from step 1"),
      "User-Agent": z
        .string()
        .describe("A unique identifier for your application"),
    }),
  },
  async ({ bearer_token, "User-Agent": userAgent }) => {
    const url = `${REDDIT_OAUTH_BASE}/api/v1/me/prefs`;
    const { data: prefsResponse, error } = await makeRedditRequest<
      PrefsResponse | ErrorResponse
    >(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${bearer_token}`,
        "User-Agent": userAgent,
      },
    });

    if (error || !prefsResponse) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to retrieve user preferences. Error: ${error || "Unknown error"}`,
          },
        ],
      };
    }

    if ("error" in prefsResponse) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${prefsResponse.error}`,
          },
        ],
      };
    }

    // Convert free-form object to readable text
    const formatted = Object.entries(prefsResponse)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");
    return {
      content: [
        {
          type: "text",
          text: `User preferences:\n${formatted}`,
        },
      ],
    };
  },
);

// User trophies tool
server.registerTool(
  "get-user-trophies",
  {
    title: "Get User Trophies",
    description: "Returns the trophies for the authenticated user.",
    inputSchema: z.object({
      bearer_token: z.string().describe("Bearer token obtained from step 1"),
      "User-Agent": z
        .string()
        .describe("A unique identifier for your application"),
    }),
  },
  async ({ bearer_token, "User-Agent": userAgent }) => {
    const url = `${REDDIT_OAUTH_BASE}/api/v1/me/trophies`;
    const { data: trophiesResponse, error } = await makeRedditRequest<
      TrophiesResponse | ErrorResponse
    >(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${bearer_token}`,
        "User-Agent": userAgent,
      },
    });

    if (error || !trophiesResponse) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to retrieve user trophies. Error: ${error || "Unknown error"}`,
          },
        ],
      };
    }

    if ("error" in trophiesResponse) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${trophiesResponse.error}`,
          },
        ],
      };
    }

    // Format trophies
    const formatted = trophiesResponse.data.trophies
      .map(
        (t) =>
          `Trophy: ${t.name || "Unknown"}, Description: ${t.description || "N/A"}`,
      )
      .join("\n");
    return {
      content: [
        {
          type: "text",
          text: `User trophies:\n${formatted}`,
        },
      ],
    };
  },
);

// Get announcements tool
server.registerTool(
  "get-announcements",
  {
    title: "Get Announcements",
    description: "Returns announcements for the authenticated user.",
    inputSchema: z.object({
      bearer_token: z.string().describe("Bearer token obtained from step 1"),
      "User-Agent": z
        .string()
        .describe("A unique identifier for your application"),
    }),
  },
  async ({ bearer_token, "User-Agent": userAgent }) => {
    const url = `${REDDIT_OAUTH_BASE}/api/announcements/v1`;
    const { data: announcementsResponse, error } = await makeRedditRequest<
      AnnouncementsResponse | ErrorResponse
    >(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${bearer_token}`,
        "User-Agent": userAgent,
      },
    });

    if (error || !announcementsResponse) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to retrieve announcements. Error: ${error || "Unknown error"}`,
          },
        ],
      };
    }

    if ("error" in announcementsResponse) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${announcementsResponse.error}`,
          },
        ],
      };
    }

    // Convert free-form object to readable text
    const formatted = Object.entries(announcementsResponse)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join("\n");
    return {
      content: [
        {
          type: "text",
          text: `Announcements:\n${formatted}`,
        },
      ],
    };
  },
);

// Mark all announcements as read tool
server.registerTool(
  "read-all-announcements",
  {
    title: "Mark All Announcements as Read",
    description: "Marks all announcements as read for the authenticated user.",
    inputSchema: z.object({
      bearer_token: z.string().describe("Bearer token obtained from step 1"),
      "User-Agent": z
        .string()
        .describe("A unique identifier for your application"),
    }),
  },
  async ({ bearer_token, "User-Agent": userAgent }) => {
    const url = `${REDDIT_OAUTH_BASE}/api/announcements/v1/read_all`;
    const { data: successResponse, error } = await makeRedditRequest<
      SuccessResponse | ErrorResponse
    >(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearer_token}`,
        "User-Agent": userAgent,
      },
    });

    if (error || !successResponse) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to mark announcements as read. Error: ${error || "Unknown error"}`,
          },
        ],
      };
    }

    if ("error" in successResponse) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${successResponse.error}`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: "All announcements marked as read successfully",
        },
      ],
    };
  },
);

const activeTransports = new Map<string, StreamableHTTPServerTransport>();

async function main() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Enable CORS
  app.use(
    cors({
      origin: "*",
      methods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "Accept",
        "Mcp-Session-Id",
        "Mcp-Protocol-Version",
        "Last-Event-ID",
      ],
    }),
  );

  // Parse JSON bodies
  app.use(express.json());

  // Health check
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", server: "reddit-mcp" });
  });

  // Debug endpoint to check active transports
  app.get("/debug/transports", (_req: Request, res: Response) => {
    const activeSessions = Array.from(activeTransports.keys());
    res.json({
      activeSessions,
      count: activeTransports.size,
      timestamp: new Date().toISOString(),
    });
  });

  // Main MCP endpoint - handles GET, POST, and DELETE
  app.route("/mcp").all(async (req: Request, res: Response) => {
    console.log(
      `${req.method} /mcp, session: ${req.headers["mcp-session-id"] ? req.headers["mcp-session-id"] : "No session"}`,
    );

    // Get or create transport for this session
    let sessionId = req.headers["mcp-session-id"] as string;
    let transport = sessionId ? activeTransports.get(sessionId) : null;

    // For initialization requests or when no session exists, create new transport
    if (!transport) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: false,
        onsessioninitialized: async (newSessionId: string) => {
          console.log(`Session initialized: ${newSessionId}`);
          activeTransports.set(newSessionId, transport!);
        },
        onsessionclosed: async (closedSessionId: string) => {
          console.log(`Session closed: ${closedSessionId}`);
          activeTransports.delete(closedSessionId);
        },
        enableDnsRebindingProtection: false,
      });

      // Connect the MCP server to the transport
      await server.connect(transport);

      console.log("New transport created and MCP server connected");
    }

    try {
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Internal server error",
          },
          id: null,
        });
      }
    }
  });

  app.listen(PORT, () => {
    console.log(`Reddit MCP Server v1.0 running at http://localhost:${PORT}`);
    console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Debug endpoint: http://localhost:${PORT}/debug/transports`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
