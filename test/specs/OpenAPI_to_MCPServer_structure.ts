import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import express, { Request, Response } from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import yaml from "js-yaml";
import fs from "fs";

// Types for OpenAPI specification
interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    description?: string;
    version: string;
  };
  servers?: Array<{
    url: string;
    description?: string;
  }>;
  paths: Record<string, Record<string, PathOperation>>;
  components?: {
    schemas?: Record<string, SchemaObject>;
  };
}

interface PathOperation {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses: Record<string, response>;
}

interface Parameter {
  name: string;
  in: "query" | "path" | "header" | "cookie";
  description?: string;
  required?: boolean;
  schema: SchemaObject;
}

interface RequestBody {
  description?: string;
  required?: boolean;
  content: Record<string, { schema: SchemaObject }>;
}

interface response {
  description: string;
  content?: Record<string, { schema: SchemaObject }>;
}

interface SchemaObject {
  type?: string;
  format?: string;
  description?: string;
  enum?: any[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: SchemaObject;
  properties?: Record<string, SchemaObject>;
  required?: string[];
  $ref?: string;
}

class OpenAPIMCPGenerator {
  private spec: OpenAPISpec;
  private server: McpServer;
  private baseUrl: string;
  private userAgent: string;

  constructor(spec: OpenAPISpec) {
    this.spec = spec;
    this.baseUrl = spec.servers?.[0]?.url || "";
    this.userAgent = `${spec.info.title.toLowerCase().replace(/\s+/g, "-")}-mcp/1.0`;

    this.server = new McpServer({
      name: spec.info.title.toLowerCase().replace(/\s+/g, "-"),
      version: spec.info.version,
    });
  }

  // Convert OpenAPI schema to Zod schema
  private convertToZodSchema(schema: SchemaObject): z.ZodTypeAny {
    if (schema.$ref) {
      // Handle references - in a real implementation, you'd resolve these
      const refName = schema.$ref.split("/").pop()!;
      return z.any().describe(`Reference to ${refName}`);
    }

    switch (schema.type) {
      case "string":
        if (schema.enum) return z.enum(schema.enum as [string, ...string[]]);
        let stringSchema = z.string();
        if (schema.minLength) stringSchema = stringSchema.min(schema.minLength);
        if (schema.maxLength) stringSchema = stringSchema.max(schema.maxLength);
        if (schema.pattern)
          stringSchema = stringSchema.regex(new RegExp(schema.pattern));
        if (schema.format === "email") stringSchema = z.string().email();
        if (schema.format === "uri") stringSchema = z.string().url();
        return stringSchema;

      case "number":
      case "integer":
        let numberSchema =
          schema.type === "integer" ? z.number().int() : z.number();
        if (schema.minimum !== undefined)
          numberSchema = numberSchema.min(schema.minimum);
        if (schema.maximum !== undefined)
          numberSchema = numberSchema.max(schema.maximum);
        return numberSchema;

      case "boolean":
        return z.boolean();

      case "array":
        if (schema.items) {
          return z.array(this.convertToZodSchema(schema.items));
        }
        return z.array(z.any());

      case "object":
        if (schema.properties) {
          const shape: Record<string, z.ZodTypeAny> = {};
          Object.entries(schema.properties).forEach(([key, propSchema]) => {
            let zodSchema = this.convertToZodSchema(propSchema);
            if (!schema.required?.includes(key)) {
              zodSchema = zodSchema.optional();
            }
            shape[key] = zodSchema;
          });
          return z.object(shape);
        }
        return z.object({});

      default:
        return z.any();
    }
  }

  // Generate tool name from path and method
  private generateToolName(
    path: string,
    method: string,
    operation: PathOperation,
  ): string {
    if (operation.operationId) {
      return operation.operationId.replace(/[A-Z]/g, (letter, index) =>
        index === 0 ? letter.toLowerCase() : `-${letter.toLowerCase()}`,
      );
    }

    // Generate from path and method
    const pathParts = path
      .split("/")
      .filter((part) => part && !part.startsWith("{"));
    const methodName = method.toLowerCase();

    if (methodName === "get" && pathParts.length > 0) {
      return pathParts.join("-");
    } else if (methodName === "post" && pathParts.length > 0) {
      return `create-${pathParts.join("-")}`;
    } else if (methodName === "put" && pathParts.length > 0) {
      return `update-${pathParts.join("-")}`;
    } else if (methodName === "delete" && pathParts.length > 0) {
      return `delete-${pathParts.join("-")}`;
    }

    return `${methodName}-${pathParts.join("-")}`;
  }

  // Generate tool parameters from OpenAPI parameters - Updated to match new format
  // Returns a ZodObject for the input schema
  private generateInputSchema(
    operation: PathOperation,
  ): z.ZodObject<any> {
    const inputSchema: Record<string, z.ZodTypeAny> = {};

    // Add path parameters
    operation.parameters?.forEach((param) => {
      if (param.in === "path" || param.in === "query") {
        let zodSchema = this.convertToZodSchema(param.schema);
        if (param.description) {
          zodSchema = zodSchema.describe(param.description);
        }
        if (!param.required && param.in === "query") {
          zodSchema = zodSchema.optional();
        }
        inputSchema[param.name] = zodSchema;
      }
    });

    // Add request body parameters
    if (operation.requestBody?.content["application/json"]?.schema) {
      const schema = operation.requestBody.content["application/json"].schema;
      if (schema.properties) {
        Object.entries(schema.properties).forEach(([key, propSchema]) => {
          let zodSchema = this.convertToZodSchema(propSchema);
          if (!schema.required?.includes(key)) {
            zodSchema = zodSchema.optional();
          }
          inputSchema[key] = zodSchema;
        });
      }
    }

    return z.object(inputSchema);
  }

  // Make HTTP request helper
  private async makeRequest<T>(
    url: string,
    options: RequestInit = {},
  ): Promise<T | null> {
    const headers = {
      "User-Agent": this.userAgent,
      "Content-Type": "application/json",
      ...options.headers,
    };

    try {
      const response = await fetch(url, { ...options, headers });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      console.error(`Error making request to ${url}:`, error);
      return null;
    }
  }

  // Build URL from path template and parameters
  private buildUrl(
    pathTemplate: string,
    pathParams: Record<string, any>,
    queryParams: Record<string, any>,
  ): string {
    let url = this.baseUrl + pathTemplate;

    // Replace path parameters
    Object.entries(pathParams).forEach(([key, value]) => {
      url = url.replace(`{${key}}`, String(value));
    });

    // Add query parameters
    const queryString = new URLSearchParams();
    Object.entries(queryParams).forEach(([key, value]) => {
      if (value !== undefined) {
        queryString.append(key, String(value));
      }
    });

    if (queryString.toString()) {
      url += `?${queryString.toString()}`;
    }

    return url;
  }

  // Generate and register tools from OpenAPI spec - Updated to use registerTool
  public generateTools(): void {
    Object.entries(this.spec.paths).forEach(([path, pathItem]) => {
      Object.entries(pathItem).forEach(([method, operation]) => {
        const toolName = this.generateToolName(path, method, operation);
        const toolDescription =
          operation.summary ||
          operation.description ||
          `${method.toUpperCase()} ${path}`;
        const inputSchema = this.generateInputSchema(operation);

        // Updated to match your JSONPlaceHolder server syntax
        this.server.registerTool(
          toolName,
          {
            title: toolName
              .split("-")
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" "),
            description: toolDescription,
            inputSchema: inputSchema,
          },
          async (args) => {
            const pathParams: Record<string, any> = {};
            const queryParams: Record<string, any> = {};
            const bodyParams: Record<string, any> = {};

            // Categorize parameters
            operation.parameters?.forEach((param) => {
              if (param.in === "path" && args[param.name] !== undefined) {
                pathParams[param.name] = args[param.name];
              } else if (
                param.in === "query" &&
                args[param.name] !== undefined
              ) {
                queryParams[param.name] = args[param.name];
              }
            });

            // Handle request body
            if (operation.requestBody?.content["application/json"]?.schema) {
              const schema =
                operation.requestBody.content["application/json"].schema;
              if (schema.properties) {
                Object.keys(schema.properties).forEach((key) => {
                  if (args[key] !== undefined) {
                    bodyParams[key] = args[key];
                  }
                });
              }
            }

            // Build URL
            const url = this.buildUrl(path, pathParams, queryParams);

            // Make request
            const requestOptions: RequestInit = {
              method: method.toUpperCase(),
            };

            if (Object.keys(bodyParams).length > 0) {
              requestOptions.body = JSON.stringify(bodyParams);
            }

            const result = await this.makeRequest(url, requestOptions);

            if (!result) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Failed to ${method.toUpperCase()} ${path}`,
                  },
                ],
              };
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          },
        );
      });
    });
  }

  // Start the server
  public async start(): Promise<void> {
    this.generateTools();

    const app = express();
    const PORT = process.env.PORT || 3000;

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

    app.use(express.json());

    const activeTransports = new Map<string, StreamableHTTPServerTransport>();

    app.get("/health", (_req: Request, res: Response) => {
      res.json({ status: "ok", server: "OpenAPI MCP Server" });
    });

    app.get("/debug/transports", (_req: Request, res: Response) => {
      const activeSessions = Array.from(activeTransports.keys());
      res.json({
        activeSessions,
        count: activeTransports.size,
        timestamp: new Date().toISOString(),
      });
    });

    app.route("/mcp").all(async (req: Request, res: Response) => {
      console.log(
        `${req.method} /mcp, session: ${req.headers["mcp-session-id"] || "No session"}`,
      );

      let sessionId = req.headers["mcp-session-id"] as string;
      let transport = sessionId ? activeTransports.get(sessionId) : null;

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

        await this.server.connect(transport);
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
      console.log(`MCP Server running at http://localhost:${PORT}`);
      console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`Debug endpoint: http://localhost:${PORT}/debug/transports`);
    });
  }
}

// Utility function to load OpenAPI spec from file
export function loadOpenAPISpec(filePath: string): OpenAPISpec {
  const fileContent = fs.readFileSync(filePath, "utf8");

  if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
    return yaml.load(fileContent) as OpenAPISpec;
  } else if (filePath.endsWith(".json")) {
    return JSON.parse(fileContent) as OpenAPISpec;
  } else {
    throw new Error(
      "Unsupported file format. Please use .yaml, .yml, or .json",
    );
  }
}

// Main function to create and start server from OpenAPI spec
export async function createMCPServerFromOpenAPI(
  specPath: string,
): Promise<void> {
  try {
    const spec = loadOpenAPISpec(specPath);
    const generator = new OpenAPIMCPGenerator(spec);
    await generator.start();
  } catch (error) {
    console.error("Fatal error creating MCP server:", error);
    process.exit(1);
  }
}

// Example usage
async function main() {
  const specPath = process.argv[2];
  if (!specPath) {
    console.error("Usage: node index.js <path-to-openapi-spec>");
    process.exit(1);
  }

  await createMCPServerFromOpenAPI(specPath);
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}
