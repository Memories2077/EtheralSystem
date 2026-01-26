// src/generator/prompt.ts - Improved version for MCP Server Generation
import {
  calculateMessageTokens,
  truncateMessages,
  formatTokenCount,
  getContextWarningLevel,
} from "../utils/token-counter.ts";

interface ChatMessage {
  role: "user" | "model";
  content: string;
}
const OPENAPI_TO_ZOD_MAPPING = `
// OpenAPI Schema to Zod Schema Mapping (Latest MCP Server Syntax)
CONVERSION RULES:

1. OpenAPI requestBody -> Zod Parameters:
   - Analyze components/schemas referenced in requestBody
   - Create individual Zod parameters for each top-level property
   - Handle nested objects as separate z.object() schemas

2. Property Type Mapping:
   OpenAPI type: string -> z.string()
   OpenAPI type: integer -> z.number()
   OpenAPI type: boolean -> z.boolean()
   OpenAPI type: array -> z.array(z.type())
   OpenAPI type: object (with defined properties) -> z.object({ ... })
   OpenAPI type: object (without defined properties, free-form) -> z.record(z.any())
   OpenAPI type: object (additionalProperties: true) -> z.record(z.any())
   OpenAPI required: false -> z.optional()

3. CRITICAL - Free-form Objects:
   When an OpenAPI schema has:
   - type: object WITHOUT properties defined
   - additionalProperties: true
   - A field named "properties" that accepts any key-value pairs
   
   Convert to: z.record(z.any())
   
   Example:
   // OpenAPI:
   properties:
     type: object
     description: Key-value pairs
   
   // Zod:
   properties: z.record(z.any()).optional().describe("Key-value pairs")

4. Complex Objects Pattern:
   // OpenAPI Schema:
   UpdatePageRequest:
     properties:
       properties: { type: object }
       archived: { type: boolean }
       icon: 
         type: object
         properties:
           type: { enum: [emoji] }
           emoji: { type: string }
   
   // Convert to Zod (Latest MCP Server Syntax):
   server.registerTool(
     "update-page",
     {
         title: "Update a page",
         description: "Update a page with new properties, archive status, or icon.",
         inputSchema: z.object({
             page_id: z.string().describe("Page ID"),
             properties: z.record(z.any()).optional().describe("Page properties to update"),
             archived: z.boolean().optional().describe("Archive status"),
             icon: z.object({
                 type: z.literal("emoji"),
                 emoji: z.string()
             }).optional().describe("Page icon"),
             cover: z.object({
                 type: z.enum(["external", "file"]),
                 external: z.object({
                     url: z.string().url()
                 }).optional()
             }).optional().describe("Page cover image"),
             notion_api_token: z.string().describe("API token")
         })
     },
     async ({ page_id, properties, archived, icon, cover, notion_api_token }) => {
         const requestBody: any = {};
         if (properties !== undefined) requestBody.properties = properties;
         if (archived !== undefined) requestBody.archived = archived;
         if (icon !== undefined) requestBody.icon = icon;
         if (cover !== undefined) requestBody.cover = cover;
         
         const response = await makeAPIRequest(url, {
             method: 'PATCH',
             headers: {
                 'Authorization': \`Bearer \${notion_api_token}\`,
                 'Notion-Version': '2022-06-28'
             },
             body: JSON.stringify(requestBody)
         });
                // Handle response...
            }
        );

        5. CRITICAL - Nested Optional Objects:
        When handling nested optional objects, ALWAYS:
        - Mark parent object as .optional()
        - Check if value !== undefined before adding to request body
        - Use proper null checks in the handler function
        
        Example:
        inputSchema: z.object({
            parent: z.object({
                child: z.object({
                    value: z.string()
                }).optional()
            }).optional()
        })
        
        Handler:
        if (parent !== undefined) {
            requestBody.parent = parent;
        }
        `;

const FLEXIBLE_BODY_PATTERNS = `
// For POST/PUT/PATCH endpoints with request body (Latest MCP Server Syntax)
server.registerTool(
    "create-resource",
    {
        title: "Create a new resource",
        description: "Create a new resource with simple or complex body.",
        inputSchema: z.object({
            // Simple body
            data: z.object({
                name: z.string(),
                email: z.string().email(),
            }).describe("Resource data"),
            // Or complex nested body
            complexData: z.object({
                user: z.object({
                    profile: z.object({
                        settings: z.record(z.any())
                    })
                }),
                tags: z.array(z.string()),
                metadata: z.record(z.any()).optional()
            }).describe("Complex resource data"),
        })
    },
    async ({ data, complexData }) => {
        const body = complexData || data;
        const result = await makeAPIRequest<ResponseType>(url, {
            method: 'POST',
            body: JSON.stringify(body),
        });
        // Handle response...
    }
);
`;

// Thêm pattern:
const CONTENT_TYPE_PATTERNS = `
// Handle different content types
function buildRequestOptions(body: any, contentType: string): RequestInit {
    const headers: Record<string, string> = {
        "User-Agent": USER_AGENT,
    };
    
    let processedBody: string | FormData;
    
    switch (contentType) {
        case 'application/json':
            headers['Content-Type'] = 'application/json';
            processedBody = JSON.stringify(body);
            break;
        case 'application/x-www-form-urlencoded':
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
            processedBody = new URLSearchParams(body).toString();
            break;
        case 'multipart/form-data':
            // Don't set Content-Type, let browser set with boundary
            processedBody = new FormData();
            Object.entries(body).forEach(([key, value]) => {
                processedBody.append(key, value as string);
            });
            break;
        default:
            headers['Content-Type'] = 'application/json';
            processedBody = JSON.stringify(body);
    }
    
    return { headers, body: processedBody };
}
`;

// Thêm instruction:
const DYNAMIC_SCHEMA_INSTRUCTION = `
DYNAMIC REQUEST BODY HANDLING:
1. Analyze OpenAPI requestBody schema
2. Generate appropriate Zod schema:
   - Simple objects: z.object({})
   - Arrays: z.array(z.type())
   - Mixed types: z.union([])
   - Optional fields: z.optional()
   - Nested objects: recursive z.object()
3. Handle different content types
4. Validate before sending request
`;

/**
 * Enhanced system prompt for generating MCP Servers that work successfully
 */
const SYSTEM_INSTRUCTION_For_Generating_MCPServer = `
You are an expert TypeScript developer specializing in MCP (Model Context Protocol) servers.

Generate a complete, working MCP server from the given OpenAPI specification using the exact structure and patterns shown in the reference implementation.

CRITICAL REQUIREMENTS:
1. Use the EXACT import structure from the reference:
   - import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
   - import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
   - import { z } from "zod";
   - import express, { Request, Response } from 'express';
   - import cors from "cors";
   - import { randomUUID } from "node:crypto";

2. Follow the EXACT server initialization pattern:
   - Use McpServer constructor with name, version, and capabilities
   - Use server.registerTool() method for each endpoint
   - Use StreamableHTTPServerTransport for a mean of transport
   - Use express for HTTP server setup
   - Include proper error handling in main() function

3. Generate tool names using kebab-case (e.g., "get-posts", "create-post", "get-user")
   - GET endpoints: "get-{resource}" or "get-{resource}s"
   - POST endpoints: "create-{resource}"
   - PUT endpoints: "update-{resource}"
   - DELETE endpoints: "delete-{resource}"
   - PATCH endpoints: "patch-{resource}"

4. HTTP Request Implementation:
   - Create a helper function like makeAPIRequest<T>() for HTTP calls
   - Use fetch() with proper headers including User-Agent
   - Include proper error handling with try-catch blocks
   - Return null on errors and handle gracefully in tools

5. Parameter Handling:
   - Use Zod schemas for parameter validation
   - Support both path parameters and query parameters
   - Handle request body parameters for POST/PUT/PATCH
   - Use URLSearchParams for query string construction
   - Replace path parameters in URL template

6. Response Formatting:
   - Return MCP-compliant response format with content array
   - Use type: "text" for all responses
   - Format responses as readable text, not raw JSON
   - Include meaningful error messages when API calls fail

7. Configuration:
   - Extract base URL from OpenAPI spec's first server
   - Generate appropriate User-Agent header
   - Use constants for configuration values

8. TypeScript Types:
   - Define interfaces for API response types based on OpenAPI schemas
   - Use proper typing for all functions and variables
   - Include proper type annotations for async functions

OPENAPI TO ZOD CONVERSION:
${OPENAPI_TO_ZOD_MAPPING}

TYPESCRIPT FLEXIBLE BODY PATTERN:
${FLEXIBLE_BODY_PATTERNS}

TYPESCRIPT DYNAMIC SCHEMA INSTRUCTION:
${DYNAMIC_SCHEMA_INSTRUCTION}

TYPESCRIPT CONTENT_TYPE_PATTERNS:
${CONTENT_TYPE_PATTERNS}

TYPESCRIPT ERROR HANDLING PATTERN:
async function makeAPIRequest<T>(url: string, options: RequestInit = {}): Promise<T | null> {
    const headers = {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/json",
        ...options.headers,
    };

    try {
        const response = await fetch(url, { ...options, headers });
        if (!response.ok) {
            throw new Error(\`HTTP error! status: \${response.status}\`);
        }
        return (await response.json()) as T;
    } catch (error) {
        console.error("Error making API request:", error);
        return null;
    }
}

CRITICAL ZOD SCHEMA VALIDATION:
🚨 EVERY inputSchema property MUST be a valid Zod schema:

❌ WRONG (WILL CAUSE "cannot read properties of undefined reading _zod" ERROR):
inputSchema: {}                        // Empty object - WILL CAUSE _zod ERROR
inputSchema: {
    name: "string",                    // String literal - WILL CAUSE ERROR
    age: 25,                           // Number literal - WILL CAUSE ERROR
    tags: [],                          // Array literal - WILL CAUSE ERROR
    data: {},                          // Object literal - WILL CAUSE ERROR
    optional: undefined                // Undefined - WILL CAUSE _zod ERROR
}

✅ CORRECT:
// For tools with NO parameters, use z.object({}):
inputSchema: z.object({})              // Empty Zod schema - CORRECT for no params

// For tools with parameters, MUST wrap in z.object():
inputSchema: z.object({
    name: z.string().describe("Name"),
    age: z.number().min(0).describe("Age"),
    tags: z.array(z.string()).optional().describe("Tags"),
    data: z.record(z.any()).optional().describe("Data"),
    settings: z.object({
        theme: z.string(),
        notifications: z.boolean()
    }).optional().describe("Settings")
})

🔍 VALIDATION CHECKLIST:
1. ✅ CRITICAL: inputSchema MUST be wrapped in z.object() - NEVER use plain object
2. ✅ For tools with NO parameters: inputSchema: z.object({})
3. ✅ Every property starts with "z."
4. ✅ Every property has .describe() with clear description
5. ✅ Optional properties have .optional() AFTER all other modifiers
6. ✅ Objects use z.object({}) or z.record(z.any())
7. ✅ Arrays use z.array(z.type())
8. ✅ Never use undefined, null, or raw literals
9. ✅ String interpolation uses backticks \` not quotes

TOOL REGISTRATION PATTERN - NO PARAMETERS (typescript):
// 🚨 CRITICAL: When tool has NO parameters, use z.object({}) NOT {}
server.registerTool(
    "list-all-items",
    {
        title: "List All Items",
        description: "Retrieves all items without any parameters",
        inputSchema: z.object({})  // ✅ CORRECT - empty Zod schema
        // inputSchema: {}         // ❌ WRONG - causes _zod error
    },
    async () => {
        const url = \`\${BASE_URL}/items\`;
        const result = await makeAPIRequest<ItemType[]>(url);
        
        if (!result) {
            return {
                content: [{ type: "text", text: "Failed to retrieve items" }],
            };
        }
        
        return {
            content: [{ type: "text", text: \`Retrieved \${result.length} items\` }],
        };
    }
);

TOOL REGISTRATION PATTERN - WITH PARAMETERS (typescript):
server.registerTool(
    "tool-name",
    {
        title: "Tool Name",
        description: "Comprehensive description of what this tool does and when to use it",
        inputSchema: z.object({
            param1: z.string().describe("Required string parameter with clear usage description"),
            param2: z.number().min(1).max(100).optional().describe("Optional number parameter (1-100)"),
            param3: z.enum(["option1", "option2", "option3"]).optional().describe("Optional enum parameter"),
        })
    },
    async ({ param1, param2, param3 }) => {
        try {
            // Build URL with parameters
            let url = \`\${BASE_URL}/endpoint\`;
            const queryParams = new URLSearchParams();
            const pathParams: Record<string, string> = {};
            
            // Handle different parameter types
            if (param2) queryParams.append("limit", param2.toString());
            if (param3) queryParams.append("filter", param3);
            
            // Add query parameters if any exist
            if (queryParams.toString()) url += \`\?\${queryParams.toString()}\`;

            // 🚨 CRITICAL: For POST/PUT/PATCH with complex body
            // Build request body dynamically, only include defined values
            const requestBody: any = {};
            if (param1 !== undefined) requestBody.field1 = param1;
            if (param2 !== undefined) requestBody.field2 = param2;
            // For nested objects, check before assigning
            if (param3 !== undefined) requestBody.nestedObject = param3;

            // Make API request with proper error handling
            const result = await makeAPIRequest<ResponseType>(url, {
                method: "POST", // or "GET", "PUT", "PATCH", "DELETE"
                headers: { 
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(requestBody) // Only for POST/PUT/PATCH
            });
            
            if (!result) {
                return {
                    content: [{ 
                        type: "text", 
                        text: \`Failed to retrieve data from \${url}\` 
                    }],
                };
            }

            // Format and return response
            return {
                content: [
                    {
                        type: "text",
                        text: \`Successfully retrieved data:\n\n \${formatResponse(result)}\`,
                    },
                ],
            };
            
        } catch (error) {
            return {
                content: [{ 
                    type: "text", 
                    text: \`Error executing tool: \${error.message}\` 
                }],
            };
        }
    }
);

MAIN TYPESCRIPT FUNCTION PATTERN:
const activeTransports = new Map<string, StreamableHTTPServerTransport>();

async function main() {
    const app = express();
    const PORT = process.env.PORT || 3000;

    // Enable CORS
    app.use(
        cors({
            origin: '*',
            methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Mcp-Session-Id', 'Mcp-Protocol-Version', 'Last-Event-ID']
        })
    );

    // Parse JSON bodies
    app.use(express.json());

    // Health check
    app.get('/health', (_req: Request, res: Response) => {
        res.json({ status: 'ok', server: 'server_name' });
    });

    // Debug endpoint to check active transports
    app.get('/debug/transports', (_req: Request, res: Response) => {
        const activeSessions = Array.from(activeTransports.keys());
        res.json({
            activeSessions,
            count: activeTransports.size,
            timestamp: new Date().toISOString()
        });
    });

    // Main MCP endpoint - handles GET, POST, and DELETE
    app.route('/mcp')
        .all(async (req: Request, res: Response) => {
            console.log(\`{req.method} /mcp, session: {req.headers['mcp-session-id'] ? req.headers['mcp-session-id'] : 'No session'}\`);

            // Get or create transport for this session
            let sessionId = req.headers['mcp-session-id'] as string;
            let transport = sessionId ? activeTransports.get(sessionId) : null;

            // For initialization requests or when no session exists, create new transport
            if (!transport) {
                transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    enableJsonResponse: false, // Use SSE by default
                    onsessioninitialized: async (newSessionId: string) => {
                        console.log(\`Session initialized: {newSessionId}\`);
                        activeTransports.set(newSessionId, transport!);
                    },
                    onsessionclosed: async (closedSessionId: string) => {
                        console.log(\`Session closed: {closedSessionId}\`);
                        activeTransports.delete(closedSessionId);
                    },
                    // Optional: Enable DNS rebinding protection
                    enableDnsRebindingProtection: false,
                    // Optional: Specify allowed hosts/origins if needed
                    // allowedHosts: ['localhost:3000', 'your-domain.com'],
                    // allowedOrigins: ['http://localhost:3000', 'https://your-domain.com']
                });


                // Connect the MCP server to the transport
                await server.connect(transport);

                console.log('New transport created and MCP server connected');
            }

            try {
                await transport.handleRequest(req, res, req.body);
            } catch (error) {
                console.error('Error handling request:', error);
                if (!res.headersSent) {
                    res.status(500).json({
                        jsonrpc: "2.0",
                        error: {
                            code: -32000,
                            message: "Internal server error"
                        },
                        id: null
                    });
                }
            }
        });

    app.listen(PORT, () => {
        console.log(\`MCP Server running at http://localhost:{PORT}\`);
        console.log(\`MCP endpoint: http://localhost:{PORT}/mcp\`);
        console.log(\`Health check: http://localhost:{PORT}/health\`);
        console.log(\`Debug endpoint: http://localhost:{PORT}/debug/transports\`);
    });
}

main().catch(e => { console.error(e); process.exit(1); });

IMPORTANT NOTES:
- Do NOT wrap the output in \`\`\`typescript code blocks (please note that this is a critical requirement)
- Generate tools for ALL endpoints in the OpenAPI spec
- Use the exact same patterns as the reference implementation
- Include proper TypeScript interfaces for all API response types
- Format responses as human-readable text, not raw JSON dumps
- Handle both successful responses and error cases
- Use consistent naming conventions throughout
- Include proper JSDoc comments for complex functions
- Ensure all async functions are properly typed
- Use URLSearchParams for query string building
- Replace path parameters using string replacement
- Make sure all needed parameters are converted
- Start directly with "import"

Return ONLY the complete TypeScript code without any explanations or markdown formatting, just a clean and ready to go TypeScript code.
`;

/**
 * Enhanced system prompt for generating OpenAPI specifications from API endpoints
 */

const INPUT_FORMAT = `
Reddit API Usage Guide
Step 1: Get Access Token
curl -X POST \
  -H "User-Agent: script:your_app_name:v1.0 (by /u/your_username)" \
  -d 'grant_type=password&username=your_username&password=your_password' \
  --user 'your_client_id:your_client_secret' \
  https://www.reddit.com/api/v1/access_token
Response:
{
  "access_token": "your_access_token_here",
  "token_type": "bearer",
  "expires_in": 3600,
  "scope": "*"
}

The required parameters for step 1 are (MUST HAVE AND WILL BE PROVIDED MANUALLY BY THE USER):
- grant_type: Always "password" for this flow
- username: Your Reddit username
- password: Your Reddit password
- client_id: Your Reddit app's client ID
- client_secret: Your Reddit app's client secret

Step 2: Use Access Token for API Calls
curl -H "Authorization: bearer your_access_token" \
     -A "your_app_name/1.0 by your_username" \
     https://oauth.reddit.com/api/v1/me

Response:
{
    "comment_karma": 0, 
    "created": 1389649907.0, 
    "created_utc": 1389649907.0, 
    "has_mail": false, 
    "has_mod_mail": false, 
    "has_verified_email": null, 
    "id": "1", 
    "is_gold": false, 
    "is_mod": true, 
    "link_karma": 1, 
    "name": "reddit_bot", 
    "over_18": true
}

The required parameters for step 2 are:
- Authorization: Bearer token obtained from step 1
- User-Agent: A unique identifier for your application, e.g., "your_app_name/1.0 by your_username"

NOTE: adhere to required parameters and format for Reddit API request and response. If not followed, the API will return an error.
Other endpoints:
Get (same format as https://oauth.reddit.com/api/v1/me)
- /api/v1/me
- /api/v1/me/karma
- /api/v1/me/prefs
- /api/v1/me/trophies
- /api/announcements/v1

Post (same format as https://oauth.reddit.com/api/v1/me):
- /api/announcements/v1/read_all
`;

const SYSTEM_INSTRUCTION_For_Generating_OPENAPISpec = `
You are an expert API documentation specialist who creates comprehensive OpenAPI 3.0 specifications.

Generate a complete, valid OpenAPI 3.0 specification from the provided API endpoints information.

CRITICAL REQUIREMENTS:

1. OPENAPI STRUCTURE:
   - Use OpenAPI version 3.0.3
   - Include complete info section with title, description, and version
   - Define servers array with base URL
   - Create comprehensive paths object for all endpoints
   - Include components section with schemas, parameters, and responses

2. ENDPOINT ANALYSIS:
   - Parse HTTP method (GET, POST, PUT, DELETE, PATCH)
   - Extract path parameters (e.g., /users/{id})
   - Identify query parameters from descriptions or examples
   - Determine request/response body structures
   - Infer appropriate HTTP status codes

3. PARAMETER HANDLING:
   - Path parameters: Define in parameters array with "in: path"
   - Query parameters: Define in parameters array with "in: query"
   - Request body: Define in requestBody with proper schema
   - Headers: Include common headers like Authorization, Content-Type

4. SCHEMA GENERATION:
   - Create reusable schemas in components/schemas
   - Use proper data types (string, number, integer, boolean, array, object)
   - Include required fields and optional fields
   - Add meaningful descriptions for all properties
   - Use $ref for schema references

5. RESPONSE DEFINITIONS:
   - Define success responses (200, 201, 204)
   - Include error responses (400, 401, 403, 404, 500)
   - Add proper response schemas and examples
   - Use consistent error response format

6. SECURITY SCHEMES:
   - Include appropriate security schemes (apiKey, bearer, oauth2)
   - Apply security requirements to relevant endpoints
   - Document authentication requirements

7. DOCUMENTATION QUALITY:
   - Add clear, concise descriptions for all endpoints
   - Include operationId for each endpoint
   - Add tags for logical grouping
   - Provide examples where helpful
   - Use consistent naming conventions

STANDARD YAML RESPONSE PATTERNS:
responses:
  '200':
    description: Success
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/ResponseSchema'
  '400':
    description: Bad Request
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/ErrorResponse'
  '401':
    description: Unauthorized
  '404':
    description: Not Found
  '500':
    description: Internal Server Error

YAML SCHEMA DEFINITION PATTERN:
components:
  schemas:
    User:
      type: object
      required:
        - id
        - email
      properties:
        id:
          type: integer
          description: Unique user identifier
        email:
          type: string
          format: email
          description: User email address
        name:
          type: string
          description: User full name
    
    ErrorResponse:
      type: object
      properties:
        error:
          type: string
          description: Error message
        code:
          type: string
          description: Error code


YAML PARAMETER DEFINITION PATTERN:
parameters:
  - name: id
    in: path
    required: true
    description: Resource identifier
    schema:
      type: integer
  - name: limit
    in: query
    required: false
    description: Number of items to return
    schema:
      type: integer
      default: 10
      minimum: 1
      maximum: 100

INPUT AND RESPONSE (ONLY FOR REFERENCING):
${INPUT_FORMAT}

ENDPOINT INFERENCE RULES:
1. GET endpoints typically return data (200 response)
2. POST endpoints create resources (201 response)
3. PUT endpoints update entire resources (200 response)
4. PATCH endpoints partially update resources (200 response)
5. DELETE endpoints remove resources (204 response)
6. List endpoints support pagination query parameters
7. Resource endpoints use path parameters for identification

COMMON QUERY PARAMETERS:
- limit, offset, page, per_page (pagination)
- sort, order, sort_by (sorting)
- filter, search, q (filtering/searching)
- include, expand (response expansion)

SECURITY CONSIDERATIONS:
- Apply authentication to protected endpoints
- Document required permissions
- Include rate limiting information
- Add CORS headers if applicable

VALIDATION RULES:
- Ensure all $ref references are valid
- Include required fields in request schemas
- Use appropriate HTTP status codes
- Follow REST conventions for endpoint naming
- Validate that examples match schemas

OUTPUT FORMAT:
Return a complete, valid OpenAPI 3.0 specification in YAML format that:
- Follows OpenAPI 3.0.3 specification
- Includes all provided endpoints
- Has comprehensive documentation
- Uses consistent naming and structure
- Includes proper error handling
- Contains reusable components
- Is ready for use with OpenAPI tools

IMPORTANT NOTES:
- Do NOT include "/** Generated by hiagi-mcp-gen */" or similar comments
- Do NOT wrap the output in \`\`\`yaml code blocks
- Infer missing information intelligently based on endpoint patterns
- Use RESTful conventions for standard CRUD operations
- Include comprehensive error responses
- Create reusable schemas to avoid duplication
- Add meaningful descriptions throughout
- Follow consistent naming conventions
- Ensure the specification is valid and complete
- Return ONLY the raw OpenAPI YAML specification
- Do NOT include any comments, headers, or markdown formatting
- Start directly with "openapi: 3.0.3"
- End with the last line of the YAML specification
`;

export function buildPromptWithExamples(
  openApiSpec: string,
  referenceStructure: string,
  inputExample: string,
  outputExample: string,
): ChatMessage[] {
  const messages: ChatMessage[] = [
    {
      role: "model",
      content: SYSTEM_INSTRUCTION_For_Generating_MCPServer.trim(),
    },
    {
      role: "user",
      content: `Generate a complete MCP server following this exact pattern:

TYPESCRIPT REFERENCE STRUCTURE (ONLY FOR REFERENCING):
${referenceStructure}

YAML INPUT EXAMPLE (OpenAPI Spec):
${inputExample}

TYPESCRIPT OUTPUT EXAMPLE (Generated MCP Server):
${outputExample}

NOW GENERATE FOR THIS YAML OPENAPI SPEC:
${openApiSpec}

🚨 CRITICAL ANALYSIS REQUIRED:
1. Find ALL endpoints in paths section
2. For each endpoint, identify ALL parameters (path, query, body)
3. Convert ALL requestBody properties to separate Zod parameters
4. Ensure ALL optional fields are marked .optional()
5. Build request bodies dynamically from provided parameters
6. NEVER use undefined, null, or raw literals in inputSchema
7. ALWAYS use z.record(z.any()) for free-form objects
8. ALWAYS check !== undefined before adding to request body

⚠️ ZOD SCHEMA REQUIREMENTS (CRITICAL - PREVENTS _zod ERROR):
🚨 CRITICAL: inputSchema MUST be z.object({...}) NOT plain object {...}
✅ For NO parameters: inputSchema: z.object({})
✅ For WITH parameters: inputSchema: z.object({ param: z.string(), ... })
✅ Every property inside z.object() MUST be a Zod schema (starts with z.)
✅ Use z.record(z.any()) for objects without defined structure
✅ Use z.object({...}) for objects with defined structure
✅ Mark optional fields with .optional() at the end
✅ Always add .describe() with clear description
❌ NEVER use plain object: inputSchema: { param: z.string() } ← WRONG!
❌ NEVER use: undefined, null, raw literals like {}, [], "string", 123

⚠️ STRING INTERPOLATION (CRITICAL - PREVENTS AUTH ERRORS):
✅ Use backticks for template strings: \\\`Bearer \\\${token}\\\`
❌ NEVER use quotes: 'Bearer \\\${token}' or "Bearer \\\${token}"

⚠️ OUTPUT REQUIREMENTS:
- Do NOT wrap the output in \`\`\`typescript code blocks (Critical)
- NO explanations  
- START with "import"
- IMPLEMENT EVERY ENDPOINT
- EVERY REQUEST BODY PROPERTY = SEPARATE ZOD PARAMETER
- EVERY INPUTSCHEMA PROPERTY = VALID ZOD SCHEMA`,
    },
  ];

  // Check token count and truncate if needed
  const stats = calculateMessageTokens(messages);
  const warningLevel = getContextWarningLevel(stats.totalTokens);

  console.log(
    `📊 Context size: ${formatTokenCount(stats.totalTokens)} (${warningLevel})`,
  );

  if (warningLevel === "danger" || warningLevel === "critical") {
    console.warn(
      `⚠️ Large context detected, applying truncation to fit within limits...`,
    );
    return truncateMessages(messages, 120000);
  }

  return messages;
}

export function buildOpenAPIPromptWithExamples(
  apiEndpoints: string,
  inputExample: string,
  outputExample: string,
): ChatMessage[] {
  const messages: ChatMessage[] = [
    {
      role: "model",
      content: SYSTEM_INSTRUCTION_For_Generating_OPENAPISpec.trim(),
    },
    {
      role: "user",
      content: `Generate a complete OpenAPI specification following this exact pattern:

INPUT EXAMPLE (API Endpoints):
${inputExample}

YAML OUTPUT EXAMPLE (Generated OpenAPI Spec):
${outputExample}

🚨 AUTHENTICATION REQUIREMENTS - CRITICAL:
${INPUT_FORMAT}

NOW GENERATE FOR THESE API ENDPOINTS:
${apiEndpoints}

CRITICAL OUTPUT REQUIREMENTS:
- Return ONLY the raw OpenAPI YAML specification
- Do NOT include any comments, headers, or markdown formatting
- Do NOT include "/** Generated by hiagi-mcp-gen */" or similar comments
- Do NOT wrap the output in \`\`\`yaml code blocks
- Start directly with "openapi: 3.0.3"
- End with the last line of the YAML specification
- ENSURE client_id and client_secret are included in authentication endpoints

Follow the exact same patterns, structure, and documentation style as shown in the examples.`,
    },
  ];

  // Check token count and truncate if needed
  const stats = calculateMessageTokens(messages);
  const warningLevel = getContextWarningLevel(stats.totalTokens);

  console.log(
    `📊 Context size: ${formatTokenCount(stats.totalTokens)} (${warningLevel})`,
  );

  if (warningLevel === "danger" || warningLevel === "critical") {
    console.warn(
      `⚠️ Large context detected, applying truncation to fit within limits...`,
    );
    return truncateMessages(messages, 120000);
  }

  return messages;
}
