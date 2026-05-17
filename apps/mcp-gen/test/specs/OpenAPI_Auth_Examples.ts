/**
 * Example OpenAPI spec with authentication
 * This demonstrates how the OpenAPI_to_MCPServer_structure handles different auth types
 */

// Example 1: Reddit API (Basic Auth + Bearer Token)
const redditExampleSpec = {
  openapi: "3.0.3",
  info: {
    title: "Reddit API Example",
    version: "1.0.0",
    description: "Example showing OAuth2 flow with Basic + Bearer auth",
  },
  servers: [
    { url: "https://www.reddit.com" },
    { url: "https://oauth.reddit.com" },
  ],
  paths: {
    "/api/v1/access_token": {
      post: {
        summary: "Get Access Token",
        operationId: "getAccessToken",
        servers: [{ url: "https://www.reddit.com" }],
        security: [{ basicAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/x-www-form-urlencoded": {
              schema: {
                type: "object",
                required: ["grant_type", "username", "password"],
                properties: {
                  grant_type: { type: "string", enum: ["password"] },
                  username: { type: "string" },
                  password: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Token response",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    access_token: { type: "string" },
                    token_type: { type: "string" },
                    expires_in: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/me": {
      get: {
        summary: "Get current user",
        operationId: "getCurrentUser",
        servers: [{ url: "https://oauth.reddit.com" }],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "User info",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    id: { type: "string" },
                    link_karma: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      basicAuth: {
        type: "http",
        scheme: "basic",
        description: "Basic authentication using client_id:client_secret",
      },
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Bearer token from /api/v1/access_token",
      },
    },
  },
};

// Example 2: Twilio API (Basic Auth only)
const twilioExampleSpec = {
  openapi: "3.0.3",
  info: {
    title: "Twilio WhatsApp API Example",
    version: "1.0.0",
    description: "Example showing Basic Auth with Account SID and Auth Token",
  },
  servers: [{ url: "https://api.twilio.com/2010-04-01" }],
  paths: {
    "/Accounts/{AccountSid}/Messages.json": {
      post: {
        summary: "Send WhatsApp Message",
        operationId: "sendWhatsAppMessage",
        security: [{ basicAuth: [] }],
        parameters: [
          {
            name: "AccountSid",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Your Twilio Account SID",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/x-www-form-urlencoded": {
              schema: {
                type: "object",
                required: ["To", "From"],
                properties: {
                  To: {
                    type: "string",
                    description:
                      "Recipient WhatsApp number (format: whatsapp:+1234567890)",
                  },
                  From: {
                    type: "string",
                    description:
                      "Your Twilio WhatsApp number (format: whatsapp:+0987654321)",
                  },
                  Body: {
                    type: "string",
                    description: "Message body (for plain text messages)",
                  },
                  ContentSid: {
                    type: "string",
                    description: "Template ID (for template messages)",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Message sent successfully",
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      basicAuth: {
        type: "http",
        scheme: "basic",
        description:
          "Basic authentication using Account_SID:Auth_Token (USER-PROVIDED)",
      },
    },
  },
};

// Example 3: GitHub API (Bearer Token)
const githubExampleSpec = {
  openapi: "3.0.3",
  info: {
    title: "GitHub API Example",
    version: "1.0.0",
    description: "Example showing Bearer token authentication",
  },
  servers: [{ url: "https://api.github.com" }],
  paths: {
    "/user": {
      get: {
        summary: "Get authenticated user",
        operationId: "getAuthenticatedUser",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "User info",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    login: { type: "string" },
                    id: { type: "integer" },
                    name: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "GitHub personal access token",
      },
    },
  },
};

/**
 * HOW IT WORKS:
 *
 * 1. Reddit Example (2-step OAuth):
 *    Step 1 - Get Token:
 *      Tool: get-access-token
 *      Parameters: grant_type, username, password (for body)
 *                  + username, password (for Basic Auth header)
 *      Generated Header: Authorization: Basic base64(username:password)
 *
 *    Step 2 - Use Token:
 *      Tool: get-current-user
 *      Parameters: bearer_token
 *      Generated Header: Authorization: Bearer {bearer_token}
 *
 * 2. Twilio Example (Basic Auth):
 *    Tool: send-whatsapp-message
 *    Parameters: AccountSid (path), To, From, Body/ContentSid (body)
 *                + username (Account_SID), password (Auth_Token) for Basic Auth
 *    Generated Header: Authorization: Basic base64(Account_SID:Auth_Token)
 *
 * 3. GitHub Example (Bearer Token):
 *    Tool: get-authenticated-user
 *    Parameters: bearer_token
 *    Generated Header: Authorization: Bearer {bearer_token}
 *
 * IMPORTANT NOTES:
 * - All credentials are USER-PROVIDED parameters in the tool
 * - NOT loaded from environment variables
 * - Each tool call requires explicit authentication parameters
 * - The generator automatically:
 *   1. Detects security schemes from OpenAPI spec
 *   2. Adds appropriate auth parameters to inputSchema
 *   3. Builds correct Authorization headers
 *   4. Includes descriptive text about USER-PROVIDED credentials
 */

export { redditExampleSpec, twilioExampleSpec, githubExampleSpec };
