import express from "express";
import Docker from "dockerode";
import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import fs from "fs";
import tar from "tar-fs";
import path from "path";
import yaml from "js-yaml";
import { randomBytes } from "crypto";
import { createServer } from "net";
import { fileURLToPath } from "url";
import { MongoClient, Db, Collection } from "mongodb";
import { writeFileSafe, remove, exists } from "./utils/fs.ts";
import { confirm } from "./generator/validator.ts";
import { generateOpenAPISpec } from "./generator/index.ts";

import {
  MessageQueueService,
  BuildMessage,
  StatusUpdateMessage,
  GetClaudeConfig,
  GetClaudeConfigResponse,
  DeleteMessage,
} from "./services/message-queue-service.ts";

interface ServerLogEntry {
  serverId: string;
  //serverName: string;
  dockerImage: string;
  status:
    | "created"
    | "error"
    | "deleted"
    | "started"
    | "stopped"
    | "running"
    | "building";
  publicUrl: string;
  token: string;
  hostPort: number;
  containerPort: number;
  containerId?: string;
  createdAt: Date;
  updatedAt: Date;
  buildLogs?: string[];
  inputContent: string;
  action: "created" | "error" | "deleted" | "started" | "stopped";
}

interface PersistedData {
  jwtSecret: string;
  status: boolean;
}

// Lấy đường dẫn hiện tại
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MCPServerManager {
  private docker: Docker;
  private servers: Map<string, ServerLogEntry> = new Map();
  private app: express.Application;
  private jwtSecret!: string;
  private basePort: number = 4000;
  private expressPort: number = 8080;
  private usedPorts: Set<number> = new Set();
  private defaultDockerfilePath: string;
  private persistenceFilePath: string;

  // MongoDB properties
  private mongoClient: MongoClient;
  private db!: Db;
  private logsCollection!: Collection<ServerLogEntry>;
  private mongoUrl: string =
    process.env.MONGO_URI || "mongodb://localhost:27017";
  private dbName: string = "docker";

  // Message Queue Service
  private messageQueue: MessageQueueService;

  constructor(defaultDockerfilePath: string, jwtSecret?: string) {
    this.app = express();

    this.docker = new Docker();
    this.defaultDockerfilePath = defaultDockerfilePath;

    this.mongoClient = new MongoClient(this.mongoUrl);

    // ✅ Set persistence file path
    this.persistenceFilePath = path.resolve(
      __dirname,
      "../data/persistence.json",
    );

    // ✅ Ensure data directory exists
    const dataDir = path.dirname(this.persistenceFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Initialize message queue service
    this.messageQueue = new MessageQueueService();

    //this.initializeMongoDB();
    this.initializeData(jwtSecret);
    this.setupRoutes();
  }

  private async checkDependencies(): Promise<void> {
    const usePing = process.env.USE_DOCKER_PING !== "false"; // default true nếu ko set

    if (usePing) {
      try {
        await this.docker.ping();
        console.log("✅ Docker connection successful");
      } catch (error) {
        throw new Error(
          "❌ Docker is not available. Please ensure Docker is running.",
        );
      }
    } else {
      console.log("ℹ️ Skipping Docker ping (running inside container)");
    }

    // Check if MongoDB is available
    try {
      await this.mongoClient.db("admin").command({ ping: 1 });
      console.log("✅ MongoDB connection successful");
    } catch (error) {
      console.warn(
        "⚠️ MongoDB is not available. Continuing without database features.",
      );
    }

    // Check if RabbitMQ is available
    try {
      await this.messageQueue.initialize();
      await this.setupMessageHandlers();
      console.log("✅ RabbitMQ connection successful");
    } catch (error) {
      console.warn(
        "⚠️ RabbitMQ is not available. Continuing without message queue features.",
      );
    }
  }

  private async setupMessageHandlers(): Promise<void> {
    await this.messageQueue.setupConsumers(
      // Build message handler
      async (message: BuildMessage) => {
        await this.processBuildMessage(message);
      },
      // Status update handler
      async (message: StatusUpdateMessage) => {
        await this.processStatusUpdate(message);
      },

      // Get config Handler
      async (message: GetClaudeConfig) => {
        await this.processGetConfig(message);
      },

      // Delete server handler
      async (message: DeleteMessage) => {
        await this.processDeleteServer(message);
      },
    );
  }

  private async processBuildMessage(message: BuildMessage): Promise<void> {
    const { serverId, dockerfilePath, contextPath } = message;

    try {
      // Update status to building
      if (this.messageQueue.connected) {
        await this.messageQueue.publishStatusUpdate({
          serverId,
          status: "building",
        });
      } else {
        await this.processStatusUpdate({ serverId, status: "building" });
      }

      const server = this.servers.get(serverId);
      if (!server) {
        throw new Error(`Server ${serverId} not found`);
      }

      // Build and run container
      const containerId = await this.buildAndRunContainer(
        server,
        dockerfilePath,
      );

      // Update status to created (instead of running, wait for "ready" signal)
      if (this.messageQueue.connected) {
        await this.messageQueue.publishStatusUpdate({
          serverId,
          status: "created",
          containerId,
        });
      } else {
        await this.processStatusUpdate({
          serverId,
          status: "created",
          containerId,
        });
      }
    } catch (error) {
      console.error(`Build failed for server ${serverId}:`, error);

      // Try to stop the container if containerId is available
      const server = this.servers.get(serverId);
      const containerId = server?.containerId;
      if (containerId) {
        try {
          const container = this.docker.getContainer(containerId);
          await container.stop();
        } catch (stopError) {
          console.error(`Failed to stop container ${containerId}:`, stopError);
        }
      }

      // Update status to error
      if (this.messageQueue.connected) {
        await this.messageQueue.publishStatusUpdate({
          serverId,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      } else {
        await this.processStatusUpdate({
          serverId,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async processStatusUpdate(
    message: StatusUpdateMessage,
  ): Promise<void> {
    const { serverId, status, containerId, buildLogs, error } = message;

    try {
      const server = this.servers.get(serverId);
      if (!server) {
        console.warn(`Server ${serverId} not found for status update`);
        return;
      }

      // Update server status
      server.status = status;
      server.updatedAt = new Date();

      if (containerId) {
        server.containerId = containerId;
      }

      if (buildLogs) {
        server.buildLogs = [...(server.buildLogs || []), ...buildLogs];
      }

      if (error) {
        server.buildLogs = [...(server.buildLogs || []), `Error: ${error}`];
      }

      // Save to database
      await this.SaveToDB(server, status as any);

      console.log(`Status updated for server ${serverId}: ${status}`);
    } catch (error) {
      console.error(`Failed to process status update for ${serverId}:`, error);
    }
  }

  private async processGetConfig(message: GetClaudeConfig): Promise<void> {
    const { serverId, correlationId } = message;
    try {
      const config = await this.getClaudeConfig(serverId);

      // Send response back through message queue
      if (correlationId && this.messageQueue.connected) {
        await this.messageQueue.publishGetConfigResponse({
          serverId,
          correlationId,
          success: true,
          config,
        });
      }

      console.log(`Successfully retrieved Claude config for ${serverId}`);
    } catch (error) {
      console.error(`Failed to get the Claude config for ${serverId}:`, error);

      // Send error response back through message queue
      if (correlationId && this.messageQueue.connected) {
        await this.messageQueue.publishGetConfigResponse({
          serverId,
          correlationId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async processDeleteServer(message: DeleteMessage): Promise<void> {
    const { serverId } = message;
    try {
      await this.deleteServer(serverId);
    } catch (error) {
      console.error(`Failed to delete the determined MCP server`, error);
    }
  }

  private async initializeMongoDB() {
    try {
      await this.mongoClient.connect();
      this.db = this.mongoClient.db(this.dbName);
      this.logsCollection = this.db.collection<ServerLogEntry>("logs");

      // Create index for better query performance
      await this.logsCollection.createIndex({ serverId: 1 });
      await this.logsCollection.createIndex({ createdAt: -1 });

      console.log("✅ Connected to MongoDB successfully");
    } catch (error) {
      console.error("❌ Failed to connect to MongoDB:", error);
      console.log("Continuing without MongoDB logging...");
    }
  }

  private loadPersistedData(): string | null {
    try {
      if (fs.existsSync(this.persistenceFilePath)) {
        const data = fs.readFileSync(this.persistenceFilePath, "utf8");

        // ✅ Check if file is empty or contains invalid JSON
        if (!data.trim()) {
          console.log("Persistence file is empty, will generate new data");
          return null;
        }

        const parsed = JSON.parse(data);
        // If file is { "jwtSecret": "..." } support that format
        if (typeof parsed === "string") return parsed;
        if (parsed && typeof parsed.jwtSecret === "string")
          return parsed.jwtSecret;
        console.warn("Unexpected persistence format");
      }
    } catch (error) {
      console.error("Failed to load persistent data:", error);

      // ✅ If file is corrupted, remove it and start fresh
      try {
        fs.unlinkSync(this.persistenceFilePath);
        console.log("Removed corrupted persistence file");
      } catch (unlinkError) {
        console.error("Failed to remove corrupted file:", unlinkError);
      }
    }
    return null;
  }

  private savePersistedData(): void {
    try {
      const data: PersistedData = {
        jwtSecret: this.jwtSecret,
        status: true,
      };

      fs.writeFileSync(this.persistenceFilePath, JSON.stringify(data, null, 2));
      console.log("✅ Saved persistent data");
    } catch (error) {
      console.error("Failed to save persistent data:", error);
    }
  }

  private initializeData(providedSecret?: string) {
    try {
      // ✅ Try to load existing JWT secret first
      const persistedData = this.loadPersistedData();

      if (persistedData) {
        // Use existing JWT secret
        this.jwtSecret = persistedData;
        console.log("✅ Using existing JWT secret from persistence");
      } else if (providedSecret) {
        // Use provided secret and save it
        this.jwtSecret = providedSecret;
        this.savePersistedData();
        console.log("✅ Using provided JWT secret and saved to persistence");
      } else {
        // Generate new secret and save it
        this.jwtSecret = randomBytes(64).toString("hex");
        this.savePersistedData();
        console.log("✅ Generated new JWT secret and saved to persistence");
      }
    } catch (error) {
      console.error("Failed to initialize persistent data:", error);
      // Fallback
      this.jwtSecret = providedSecret || randomBytes(64).toString("hex");
      this.savePersistedData();
    }
  }

  private async SaveToDB(
    server: ServerLogEntry,
    action: string,
  ) {
    try {
      if (!this.logsCollection) {
        console.warn("MongoDB not initialized, skipping database save");
        return;
      }

      // Create a copy to avoid mutating the original object's _id
      const dataToSave = { ...server };
      delete (dataToSave as any)._id; // Mongo doesn't like updating/upserting with _id in the body

      dataToSave.updatedAt = new Date();

      await this.logsCollection.updateOne(
        { serverId: server.serverId },
        { $set: dataToSave },
        { upsert: true }
      );

      console.log(
        `✅ Saved server ${server.serverId} to MongoDB with action: ${action}`,
      );
    } catch (error) {
      console.error("❌ Failed to save to MongoDB:", error);
      // Don't throw error to avoid breaking the main flow
    }
  }

  // Method to get server statistics from MongoDB
  public async getServerStats(): Promise<{
    totalServers: number;
    runningServers: number;
    stoppedServers: number;
    errorServers: number;
  }> {
    try {
      if (!this.logsCollection) {
        console.warn("MongoDB not initialized");
        return {
          totalServers: 0,
          runningServers: 0,
          stoppedServers: 0,
          errorServers: 0,
        };
      }

      // Get the latest status for each server
      const pipeline = [
        {
          $sort: { serverId: 1, updatedAt: -1 },
        },
        {
          $group: {
            _id: "$serverId",
            latestLog: { $first: "$$ROOT" },
          },
        },
        {
          $group: {
            _id: "$latestLog.status",
            count: { $sum: 1 },
          },
        },
      ];

      const stats = await this.logsCollection.aggregate(pipeline).toArray();

      const result = {
        totalServers: 0,
        runningServers: 0,
        stoppedServers: 0,
        errorServers: 0,
      };

      stats.forEach((stat) => {
        result.totalServers += stat.count;
        switch (stat._id) {
          case "running":
            result.runningServers = stat.count;
            break;
          case "stopped":
            result.stoppedServers = stat.count;
            break;
          case "error":
            result.errorServers = stat.count;
            break;
        }
      });

      return result;
    } catch (error) {
      console.error("❌ Failed to fetch server stats from MongoDB:", error);
      return {
        totalServers: 0,
        runningServers: 0,
        stoppedServers: 0,
        errorServers: 0,
      };
    }
  }

  public async recoverRunningContainers() {
    console.log("Recovering running containers...");

    // Skip recovery if MongoDB is not available
    if (!this.logsCollection) {
      console.warn("MongoDB not available, skipping container recovery");
      return;
    }

    try {
      const servers_in_db = await this.logsCollection
        .find({
          $or: [
            { status: "running" },
            { status: "created" },
            { status: "stopped" },
          ],
        })
        .toArray(); // Get full documents instead of projecting

      for (const config of servers_in_db) {
        const serverId = config.serverId;
        try {
          if (config.containerId) {
            const container = this.docker.getContainer(config.containerId);
            const containerInfo = await container.inspect();

            if (containerInfo.State.Running) {
              // Update only status and updatedAt to avoid overwriting other fields
              await this.logsCollection.updateOne(
                { serverId: serverId },
                {
                  $set: {
                    status: "running",
                    updatedAt: new Date(),
                  },
                },
              );

              console.log(`Recovered running container for server ${serverId}`);
            } else {
              // Container is stopped, paused, or in another non-running state
              const containerStatus = containerInfo.State.Paused
                ? "paused"
                : "stopped";

              await this.logsCollection.updateOne(
                { serverId: serverId },
                {
                  $set: {
                    status: "stopped",
                    updatedAt: new Date(),
                  },
                },
              );

              console.log(
                `Container for server ${serverId} is ${containerStatus}`,
              );
            }
          } else {
            console.log(
              `Server ${serverId} has no containerId, marking for cleanup`,
            );

            // Update only status and updatedAt
            await this.logsCollection.updateOne(
              { serverId: serverId },
              {
                $set: {
                  status: "error",
                  updatedAt: new Date(),
                },
              },
            );
          }
        } catch (error: any) {
          console.error(
            `Failed to recover container for server ${serverId}:`,
            error,
          );

          // Check if container was manually deleted (404 error)
          if (
            error.statusCode === 404 ||
            error.reason === "no such container"
          ) {
            console.log(
              `Container ${config.containerId} was manually deleted, cleaning up server data for ${serverId}`,
            );

            // Update status and clear containerId without affecting other fields
            await this.logsCollection.updateOne(
              { serverId: serverId },
              {
                $set: {
                  status: "error",
                  updatedAt: new Date(),
                },
                $unset: {
                  containerId: "",
                },
              },
            );

            // Release the port since container is gone
            if (config.hostPort) {
              this.usedPorts.delete(config.hostPort);
            }

            console.log(
              `Cleaned up orphaned container reference for server ${serverId}`,
            );
          } else {
            // Other errors, just mark as error
            await this.logsCollection.updateOne(
              { serverId: serverId },
              {
                $set: {
                  status: "error",
                  updatedAt: new Date(),
                },
              },
            );
          }
        }
      }
    } catch (error) {
      console.error("Failed to recover running containers:", error);
      console.log("Continuing without container recovery...");
    }
  }

  private setupRoutes() {
    // Increase payload size limits so large API docs (e.g. ~100KB+) are accepted.
    // Also accept urlencoded and plain text bodies (for raw OpenAPI/YAML uploads).
    this.app.use(express.json({ limit: "5mb" }));
    this.app.use(express.urlencoded({ limit: "5mb", extended: true }));
    this.app.use(express.text({ limit: "5mb", type: "*/*" }));

    // API tạo MCP server mới
    this.app.post("/api/mcp/create", async (req, res) => {
      try {
        const { request, name, dockerImage, userId, email } = req.body;

        // ✅ Validate required fields
        if (!request || !userId || !email) {
          return res.status(400).json({
            error: "Missing required fields: request, userId, email",
          });
        }

        const serverId = randomUUID();
        const hostPort = await this.getAvailablePort();

        // Tạo JWT token
        const token = jwt.sign(
          {
            sub: userId,
            email: email,
            serverId: serverId,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
          },
          this.jwtSecret,
        );

        // Lấy public url của server, nếu không có thì fallback localhost
        const baseUrl = process.env.PUBLIC_URL || "http://localhost:8081";

        const serverConfig: ServerLogEntry = {
          serverId: serverId,
          //serverName: name,
          dockerImage:
            dockerImage || process.env.DEFAULT_MCP_IMAGE || "mcp-gen",
          containerPort: 3000, // Port mặc định trong container
          hostPort: hostPort,
          status: "created",
          publicUrl: `${baseUrl}/mcp/${serverId}`,
          token: token,
          createdAt: new Date(),
          updatedAt: new Date(),
          buildLogs: [],
          inputContent: request,
          action: "created",
        };

        this.servers.set(serverId, serverConfig);

        await this.SaveToDB(serverConfig, "created");

        // Kiểm tra loại input: JSON, YAML, hay plain text
        let inputType: "json" | "yaml" | "text" = "text";
        try {
          // Kiểm tra JSON
          JSON.parse(request);
          inputType = "json";
        } catch {
          // Nếu không phải JSON, thử kiểm tra YAML
          try {
            yaml.load(request);
            inputType = "yaml";
          } catch {
            inputType = "text";
          }
        }
        serverConfig.buildLogs?.push(`Input type detected: ${inputType}`);

        // Lấy đường dẫn hiện tại
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);

        // Đặt tên file dựa vào inputType
        let fileName: string;
        switch (inputType) {
          case "json":
            fileName = `api-input-${serverId}.json`;
            break;
          case "yaml":
            fileName = `api-input-${serverId}.yaml`;
            break;
          default:
            fileName = `api-input-${serverId}.txt`;
        }

        const defaultOutputDir = path.join(__dirname, "..", "input");
        const outputPath = path.join(defaultOutputDir, fileName);

        // Ensure output directory exists
        if (!fs.existsSync(defaultOutputDir)) {
          fs.mkdirSync(defaultOutputDir, { recursive: true });
        }

        console.log("💾 Creating the file...");

        if (await exists(outputPath)) {
          console.log("🗑️ Removing the existing file...");
          await remove(outputPath);
        }

        await writeFileSafe(outputPath, request);
        console.log(`✅ Input file created: ${outputPath}`);

        let openapi_filepath = path.join(
          __dirname,
          "..",
          "src-generated-yaml",
          `${serverId}.yaml`,
        );

        // Nếu inputType là yaml thì copy trực tiếp sang openapi_filepath
        if (inputType === "yaml") {
          // Ensure output directory exists
          const openapi_dir = path.dirname(openapi_filepath);
          if (!fs.existsSync(openapi_dir)) {
            fs.mkdirSync(openapi_dir, { recursive: true });
          }
          fs.copyFileSync(outputPath, openapi_filepath);
          console.log(
            `✅ Copied YAML input to OpenAPI spec: ${openapi_filepath}`,
          );
        } else if (inputType === "json") {
          console.log("🔄 Converting JSON to YAML...");
          const jsonContent = fs.readFileSync(outputPath, "utf8");
          const jsonObj = JSON.parse(jsonContent);
          const yamlContent = yaml.dump(jsonObj);
          const openapi_dir = path.dirname(openapi_filepath);
          if (!fs.existsSync(openapi_dir)) {
            fs.mkdirSync(openapi_dir, { recursive: true });
          }
          fs.writeFileSync(openapi_filepath, yamlContent);
          console.log(
            `✅ Converted JSON to YAML and saved to: ${openapi_filepath}`,
          );
        } else if (inputType === "text") {
          console.log("🤖 Calling Gemini to generate OpenAPI spec...");
          await generateOpenAPISpec(outputPath, serverId, 0);
        }

        console.log("📍 Using OpenAPI spec:", openapi_filepath);

        let checking = await confirm(openapi_filepath);
        if (inputType !== "json") {
          let retryCount = 0;
          const maxRetries = 5;
          let lastError = "";

          while (!checking.success && retryCount < maxRetries) {
            console.log(
              `🔄 Retry attempt ${retryCount + 1} of ${maxRetries} for OpenAPI spec generation`,
            );
            await generateOpenAPISpec(
              outputPath,
              serverId,
              retryCount + 1,
              checking.error,
            );
            checking = await confirm(openapi_filepath);
            retryCount++;
          }

          if (checking.success) {
            console.log(
              `✅ OpenAPI spec validated successfully after ${retryCount} attempts (Total LLM calls: ${retryCount + 1})`,
            );
          }
        }

        if (!checking.success) {
          console.log("❌ Validation failed after maximum retries");
          // Clean up allocated resources
          this.servers.delete(serverId);
          this.usedPorts.delete(hostPort);
          await this.SaveToDB({ ...serverConfig, status: "error" }, "error");

          return res.status(500).json({
            error: "Failed to generate valid OpenAPI specification",
            serverId: serverId,
          });
        }

        // Queue build message or process synchronously
        if (this.messageQueue.connected) {
          await this.messageQueue.publishBuildMessage({
            serverId: serverConfig.serverId,
            dockerImage: serverConfig.dockerImage,
            dockerfilePath: "../Dockerfile",
            hostPort,
            containerPort: serverConfig.containerPort,
          });

          res.json({
            serverId: serverId,
            publicUrl: serverConfig.publicUrl,
            claudeConfig: this.generateClaudeConfig(serverId, serverConfig),
            status: "building",
            message: "Server creation queued successfully",
          });
        } else {
          // Fallback to synchronous processing
          const containerId = await this.buildAndRunContainer(
            serverConfig,
            "../Dockerfile",
          );

          serverConfig.containerId = containerId;
          serverConfig.status = "created";
          await this.SaveToDB(serverConfig, "created");

          res.json({
            serverId: serverId,
            publicUrl: serverConfig.publicUrl,
            claudeConfig: this.generateClaudeConfig(serverId, serverConfig),
            status: serverConfig.status,
          });
        }
      } catch (error) {
        console.error("Error creating MCP server:", error);
        res.status(500).json({
          error: "Failed to create MCP server",
          details: error,
        });
      }
    });

    // API list servers
    this.app.get("/api/mcp/servers", async (req, res) => {
      try {
        if (!this.logsCollection) {
          return res.status(503).json({
            error: "Database not available",
            servers: [],
          });
        }

        const serverList = await this.logsCollection.find({}).toArray();
        res.json({
          servers: serverList,
          count: serverList.length,
        });
      } catch (error) {
        console.error("Error fetching server list:", error);
        res.status(500).json({
          error: "Failed to fetch server list",
          servers: [],
        });
      }
    });

    // API lấy Claude config cho server cụ thể
    this.app.get("/api/mcp/:serverId/claude-config", async (req, res) => {
      try {
        const { serverId } = req.params;

        if (this.messageQueue.connected) {
          // Use message queue with request-response pattern
          const response = await this.messageQueue.publishGetConfig({
            serverId,
          });

          if (response.success) {
            res.json(response.config);
          } else {
            res.status(404).json({ error: response.error });
          }
        } else {
          // Fallback to direct call when message queue is not available
          const config = await this.getClaudeConfig(serverId);
          res.json(config);
        }
      } catch (error) {
        console.error("Error getting Claude config:", error);
        res.status(500).json({ error: "Failed to get Claude config" });
      }
    });

    // API xóa server
    this.app.delete("/api/mcp/:serverId", async (req, res) => {
      try {
        const { serverId } = req.params;
        const token = req.query.token as string;

        // Validate input
        if (!serverId) {
          return res.status(400).json({ error: "Server ID is required" });
        }

        if (!token) {
          return res.status(401).json({ error: "Token required" });
        }

        // Check if server exists
        const existingServer = await this.logsCollection?.findOne({ serverId });
        if (!existingServer) {
          return res.status(404).json({ error: "Server not found" });
        }

        // Validate JWT token
        const jwtSecret = this.loadPersistedData();
        if (!jwtSecret) {
          return res.status(500).json({ error: "Server configuration error" });
        }

        try {
          const decoded = jwt.verify(token, jwtSecret) as any;

          if (decoded.serverId !== serverId) {
            console.log("Token serverId mismatch");
            return res.status(403).json({
              error: "Invalid token for this server",
            });
          }

          // Process deletion
          if (this.messageQueue.connected) {
            // Use message queue with request-response pattern
            await this.messageQueue.publishDeleteMessage({
              serverId,
            });

            res.json({
              success: true,
              message: "Server deletion queued successfully",
              serverId,
            });
          } else {
            // Fallback to direct deletion when message queue is not available
            await this.deleteServer(serverId);

            res.json({
              success: true,
              message: "Server deleted successfully",
              serverId,
            });
          }
        } catch (jwtError) {
          console.error("Authentication error:", jwtError);
          return res.status(401).json({ error: "Invalid token" });
        }
      } catch (error) {
        console.error("Error deleting server:", error);
        res.status(500).json({
          error: "Failed to delete server",
          details: process.env.NODE_ENV === "development" ? error : undefined,
        });
      }
    });

    // API to get server statistics from MongoDB
    this.app.get("/api/mcp/stats", async (req, res) => {
      try {
        const stats = await this.getServerStats();
        res.json(stats);
      } catch (error) {
        console.error("Error getting server stats:", error);
        res.status(500).json({ error: "Failed to get server statistics" });
      }
    });

    // API to inform that server is ready
    this.app.post("/api/mcp/:serverId/ready", async (req, res) => {
      try {
        const { serverId } = req.params;
        console.log(`📡 Received ready notification for server ${serverId}`);

        const message: StatusUpdateMessage = {
          serverId,
          status: "running",
        };

        if (this.messageQueue.connected) {
          await this.messageQueue.publishStatusUpdate(message);
        } else {
          await this.processStatusUpdate(message);
        }

        res.json({ success: true, message: "Status updated to running" });
      } catch (error) {
        console.error(
          `Error processing ready notification for ${req.params.serverId}:`,
          error,
        );
        res.status(500).json({ error: "Failed to process ready notification" });
      }
    });

    // API to get generated files
    this.app.get("/api/mcp/:serverId/files", async (req, res) => {
      try {
        const { serverId } = req.params;

        // Define paths (using the same logic as in the rest of the application/volumes)
        const inputDir = path.join(__dirname, "..", "input");
        const yamlDir = path.join(__dirname, "..", "src-generated-yaml");
        const tsDir = path.join(__dirname, "..", "src-generated-ts");

        // 1. Find input file
        const extensions = [".txt", ".json", ".yaml"];
        let inputPath = "";
        let inputFileName = "";
        for (const ext of extensions) {
          const fileName = `api-input-${serverId}${ext}`;
          const filePath = path.join(inputDir, fileName);
          if (fs.existsSync(filePath)) {
            inputPath = filePath;
            inputFileName = fileName;
            break;
          }
        }

        // 2. OpenAPI Spec
        const yamlFileName = `${serverId}.yaml`;
        const yamlPath = path.join(yamlDir, yamlFileName);

        // 3. TypeScript Server
        const tsFileName = `${serverId}.ts`;
        const tsPath = path.join(tsDir, tsFileName);

        // Check for existence
        if (!inputPath || !fs.existsSync(yamlPath) || !fs.existsSync(tsPath)) {
          return res.status(404).json({
            error: "One or more artifacts not found",
            exists: {
              input: !!inputPath,
              openapi: fs.existsSync(yamlPath),
              typescript: fs.existsSync(tsPath),
            },
          });
        }

        // Read contents
        const inputContent = fs.readFileSync(inputPath, "utf8");
        const yamlContent = fs.readFileSync(yamlPath, "utf8");
        const tsContent = fs.readFileSync(tsPath, "utf8");

        res.json({
          serverId,
          files: {
            input: {
              name: inputFileName,
              content: inputContent,
            },
            openapi: {
              name: yamlFileName,
              content: yamlContent,
            },
            typescript: {
              name: tsFileName,
              content: tsContent,
            },
          },
        });
      } catch (error) {
        console.error(
          `Error retrieving files for ${req.params.serverId}:`,
          error,
        );
        res.status(500).json({ error: "Failed to retrieve generated files" });
      }
    });
  }

  private async checkImageExists(imageName: string): Promise<boolean> {
    try {
      await this.docker.getImage(imageName).inspect();
      return true;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  private async buildAndRunContainer(
    config: ServerLogEntry,
    dockerfilePath?: string,
  ): Promise<string> {
    try {
      // Kiểm tra image có tồn tại không
      let imageExists = await this.checkImageExists(config.dockerImage);

      // Nếu image không tồn tại, build từ Dockerfile
      if (!imageExists) {
        const buildPath = dockerfilePath || this.defaultDockerfilePath;
        if (!buildPath) {
          throw new Error(
            `Docker image not found and no Dockerfile path provided: ${config.dockerImage}`,
          );
        }
        await this.buildDockerImage(config, buildPath);
      }

      if (!config.hostPort) {
        config.hostPort = await this.getAvailablePort();
      }

      // Create and start container
      const container = await this.docker.createContainer({
        Image: config.dockerImage,
        name: `mcp-server-${config.serverId}`,
        ExposedPorts: {
          [`${config.containerPort}/tcp`]: {},
        },
        HostConfig: {
          PortBindings: {
            [`${config.containerPort}/tcp`]: [
              {
                HostPort: config.hostPort.toString(),
              },
            ],
          },
          RestartPolicy: {
            Name: "unless-stopped",
          },
          Mounts: [
            {
              Target: "/app/input",
              Source: "shared_input",
              Type: "volume",
              ReadOnly: true,
            },
            {
              Target: "/app/src-generated-yaml",
              Source: "shared_openapi_spec",
              Type: "volume",
              ReadOnly: true,
            },
            {
              Target: "/app/src-generated-ts",
              Source: "shared_mcpserver_ts",
              Type: "volume",
              ReadOnly: false,
            },
          ],
          ExtraHosts: ["host.docker.internal:host-gateway"],
        },
        Env: [
          `SERVER_ID=${config.serverId}`,
          `JWT_TOKEN=${config.token}`,
          `MANAGER_URL=${process.env.MANAGER_URL || "http://host.docker.internal:8080"}`,
        ],
      });

      config.buildLogs?.push("Starting container...");
      await container.start();

      config.buildLogs?.push(
        "Container started, waiting for service to be ready...",
      );
      config.containerId = container.id;
      return container.id;
    } catch (error) {
      config.status = "error";
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      config.buildLogs?.push(
        `Failed to build and run container: ${errorMessage}`,
      );

      throw error;
    }
  }

  private async buildDockerImage(
    config: ServerLogEntry,
    dockerfilePath?: string,
    contextPath?: string,
  ): Promise<void> {
    try {
      const buildPath = dockerfilePath || this.defaultDockerfilePath;
      const context = contextPath || buildPath;

      if (!fs.existsSync(buildPath)) {
        throw new Error(`Dockerfile path not found: ${buildPath}`);
      }

      const dockerfileName = path.join(buildPath, "Dockerfile");
      if (!fs.existsSync(dockerfileName)) {
        throw new Error(`Dockerfile not found: ${dockerfileName}`);
      }

      console.log(`Building Docker image for server ${config.serverId}...`);
      config.buildLogs?.push(`Starting build process...`);
      config.buildLogs?.push(`Build context: ${context}`);
      config.buildLogs?.push(`Dockerfile: ${dockerfileName}`);

      // tạo tar stream của context directory
      const tarStream = tar.pack(context);

      await new Promise<void>((resolve, reject) => {
        this.docker.buildImage(
          tarStream,
          {
            t: config.dockerImage, // tag cho image
            dockerfile: "Dockerfile",
          },
          (err, output) => {
            if (err) {
              config.buildLogs?.push(`Build failed: ${err.message}`);
              return reject(err);
            }

            // ép kiểu output sang NodeJS.ReadableStream
            const stream = output as NodeJS.ReadableStream;

            // đọc stream log từ docker
            this.docker.modem.followProgress(
              stream,
              (doneErr, res) => {
                if (doneErr) {
                  config.buildLogs?.push(`Build failed: ${doneErr.message}`);
                  return reject(doneErr);
                }
                config.buildLogs?.push("Build completed successfully");
                resolve();
              },
              (event) => {
                if (event.stream) {
                  config.buildLogs?.push(event.stream.trim());
                }
              },
            );
          },
        );
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      config.buildLogs?.push(`Build failed: ${errorMessage}`);
      throw error;
    }
  }

  private async removeContainer(containerId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);

      // Kiểm tra container có đang chạy không
      const containerInfo = await container.inspect();
      if (containerInfo.State.Running) {
        await container.stop({ t: 10 }); // Graceful shutdown 10s
      }

      await container.remove({ force: true });
    } catch (error) {
      console.error(`Error removing container ${containerId}:`, error);
      // Không throw error để không block việc cleanup
    }
  }

  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createServer();

      server.listen(port, () => {
        server.once("close", () => resolve(true));
        server.close();
      });

      server.on("error", () => resolve(false));
    });
  }

  private async getAvailablePort(): Promise<number> {
    let port = this.basePort;

    while (true) {
      // Skip Express server port
      if (port === this.expressPort) {
        port++;
        continue;
      }

      // Check if port is used internally
      if (this.usedPorts.has(port)) {
        port++;
        continue;
      }

      // Check if port is actually available on system
      if (await this.isPortAvailable(port)) {
        this.usedPorts.add(port);
        return port;
      }

      port++;
    }
  }

  private generateClaudeConfig(serverId: string, config: ServerLogEntry) {
    const args = ["mcp-remote", `${config.publicUrl}?token=${config.token}`];
    if (config.publicUrl.includes("localhost")) {
      args.push("--allow-http");
    }
    return {
      mcpServers: {
        [serverId]: {
          command: "npx",
          args,
        },
      },
    };
  }

  private async getClaudeConfig(serverId: string) {
    try {
      if (!this.logsCollection) {
        return {
          error: "Database not available",
        };
      }

      const server = await this.logsCollection.findOne({ serverId });
      if (!server) {
        throw new Error(`Server with id ${serverId} not found`);
      }
      return {
        mcpServers: {
          [serverId]: {
            command: "npx",
            args: ["mcp-remote", `${server.publicUrl}?token=${server.token}`],
          },
        },
      };
    } catch (error) {
      console.error("Error fetching Claude config:", error);
      throw error;
    }
  }

  private async deleteServer(serverId: string) {
    try {
      const server = await this.logsCollection.findOne({
        serverId: `${serverId}`,
      });
      if (server) {
        server.status = "deleted";
      }
      if (!server) {
        console.log("Server not found");
        return;
      }

      // Stop và remove container
      if (server.containerId) {
        await this.removeContainer(server.containerId);
      }

      await this.SaveToDB(server as ServerLogEntry, "deleted");

      // Release port
      this.usedPorts.delete(server.hostPort);

      this.servers.delete(serverId);

      console.log(`Server ${serverId} deleted successfully`);
    } catch (error) {
      console.error("Error deleting server:", error);
    }
  }

  public async start(port: number = 8080) {
    this.expressPort = port;
    this.usedPorts.add(port);

    // ✅ Ensure MongoDB is initialized before using it
    if (!this.logsCollection) {
      console.log("Waiting for MongoDB initialization...");
      await this.initializeMongoDB();
    }

    let servers_in_user = 0;
    let hostPorts: any[] = [];

    // Only access database if it's available
    if (this.logsCollection) {
      try {
        servers_in_user = await this.logsCollection.countDocuments({
          $or: [
            { status: "running" },
            { status: "created" },
            { status: "stopped" },
          ],
        });

        hostPorts = await this.logsCollection
          .find({
            $or: [
              { status: "running" },
              { status: "created" },
              { status: "stopped" },
            ],
          })
          .project({ hostPort: 1, _id: 0 })
          .toArray();
      } catch (error) {
        console.warn("Failed to fetch server data from MongoDB:", error);
        console.log("Continuing without existing server data...");
      }
    } else {
      console.warn(
        "MongoDB not available, starting without existing server data",
      );
    }

    for (let i = 0; i < hostPorts.length; i++) {
      this.usedPorts.add(hostPorts[i].hostPort);
    }

    // ✅ Check dependencies first
    await this.checkDependencies();

    if (!(await this.isPortAvailable(port))) {
      throw new Error(`Port ${port} is already in use`);
    }

    // Recover running containers before starting
    await this.recoverRunningContainers();

    this.app.listen(port, () => {
      console.log(`MCP Server Manager running on port ${port}`);
      console.log(`Container ports will start from ${this.basePort}`);
      console.log(`Recovered ${servers_in_user} servers`);
    });
  }

  public async gracefulShutdown() {
    console.log("Performing graceful shutdown...");

    this.savePersistedData();

    try {
      await this.mongoClient.close();
      console.log("✅ MongoDB connection closed");
    } catch (error) {
      console.error("❌ Error closing MongoDB connection:", error);
    }

    try {
      await this.messageQueue.close();
    } catch (error) {
      console.error("❌ Error closing RabbitMQ connection:", error);
    }

    console.log("Shutdown complete");
  }
}

const manager = new MCPServerManager("./");

// Handle process termination
process.on("SIGINT", async () => {
  console.log("Received SIGINT, shutting down gracefully...");
  await manager.gracefulShutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Received SIGTERM, shutting down gracefully...");
  await manager.gracefulShutdown();
  process.exit(0);
});

manager.start(8080);
