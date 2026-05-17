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
import { fileURLToPath, pathToFileURL } from "url";
import { EventEmitter } from "events";
import { MongoClient, Db, Collection, type Filter } from "mongodb";
import { writeFileSafe, remove, exists } from "./utils/fs.ts";
import { confirm } from "./generator/validator.ts";
import { generateOpenAPISpec } from "./generator/index.ts";
import { SkillSelectionAgent } from "./skill-intelligence/agent.js";
import type { ServerFeedbackLog } from "./skill-intelligence/types.js";
import { FEATURE_FLAGS } from "./utils/config.ts";

// Simple in-memory rate limiter for feedback endpoint
interface RateLimitWindow {
  timestamps: number[];
  resetTime: number;
}

class SimpleRateLimiter {
  private windows: Map<string, RateLimitWindow> = new Map();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs: number = 15 * 60 * 1000, maxRequests: number = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  private cleanupOldWindows(): void {
    const now = Date.now();
    for (const [ip, window] of this.windows.entries()) {
      if (now > window.resetTime) {
        this.windows.delete(ip);
      }
    }
  }

  isLimited(ip: string): boolean {
    this.cleanupOldWindows();
    const now = Date.now();
    let window = this.windows.get(ip);

    if (!window || now > window.resetTime) {
      window = {
        timestamps: [],
        resetTime: now + this.windowMs,
      };
      this.windows.set(ip, window);
    }

    // Remove timestamps outside the current window
    window.timestamps = window.timestamps.filter(
      (ts) => now - ts < this.windowMs,
    );

    if (window.timestamps.length >= this.maxRequests) {
      return true;
    }

    window.timestamps.push(now);
    return false;
  }

  getRemaining(ip: string): number {
    const window = this.windows.get(ip);
    if (!window) return this.maxRequests;
    return Math.max(0, this.maxRequests - window.timestamps.length);
  }
}

const feedbackRateLimiter = new SimpleRateLimiter(
  Number(process.env.FEEDBACK_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  Number(process.env.FEEDBACK_RATE_LIMIT_MAX) || 100,
);

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
  ragContext?: string;
  buildRequestId?: string;
  requestId?: string;
  sessionId?: string;
  workspaceId?: string;
  memoryScope?: string;
  // Feedback fields
  likeCount: number;
  dislikeCount: number;
  feedbacks: FeedbackEntry[];
}

interface FeedbackEntry {
  feedbackId: string;
  type: "like" | "dislike";
  userId?: string;
  comment?: string;
  timestamp: Date;
}

const SERVER_STATUSES = [
  "created",
  "error",
  "deleted",
  "started",
  "stopped",
  "running",
  "building",
] as const;
const VALID_SERVER_STATUSES = new Set<string>(SERVER_STATUSES);

interface PersistedData {
  jwtSecret: string;
  status: boolean;
}

// Resolve the current module directory for artifact and data paths.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class MCPServerManager {
  private docker: Docker;
  private servers: Map<string, ServerLogEntry> = new Map();
  private app: express.Application;
  private jwtSecret!: string;
  private basePort: number = 4000;
  private expressPort: number = 8080;
  private usedPorts: Set<number> = new Set();
  private buildRequestIndex: Map<string, string> = new Map();
  private defaultDockerfilePath: string;
  private persistenceFilePath: string;
  private events: EventEmitter;
  private mcpNetworkName: string = process.env.MCP_NETWORK || "mcp-network";

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

    this.messageQueue = new MessageQueueService();
    this.events = new EventEmitter();

    //this.initializeMongoDB();
    this.initializeData(jwtSecret);
    this.setupRoutes();
  }

  private async checkDependencies(): Promise<void> {
    const usePing = process.env.USE_DOCKER_PING !== "false"; // Defaults to true when not configured.

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
        await this.processStatusUpdate(message, true);
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
        contextPath || dockerfilePath,
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
    skipPublish: boolean = false,
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
      if (status === "error" || status === "deleted") {
        if (server.buildRequestId) {
          this.buildRequestIndex.delete(server.buildRequestId);
        }
      }

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

      // Emit status update event
      this.events.emit(`status:${serverId}`, status);

      // Publish to RabbitMQ for external consumers
      if (!skipPublish && this.messageQueue.connected) {
        await this.messageQueue.publishStatusUpdate({
          serverId,
          status,
          containerId,
          buildLogs,
          error,
        });
      }
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

  private waitForStatus(
    serverId: string,
    targetStatus: string,
    timeoutMs: number = 300000,
  ): Promise<string> {
    const currentStatus = this.servers.get(serverId)?.status;
    if (currentStatus === targetStatus || currentStatus === "error") {
      return Promise.resolve(currentStatus);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.events.off(`status:${serverId}`, listener);
        reject(new Error("Timeout waiting for server status update"));
      }, timeoutMs);

      const listener = (status: string) => {
        if (status === targetStatus || status === "error") {
          clearTimeout(timer);
          this.events.off(`status:${serverId}`, listener);
          resolve(status);
        }
      };

      this.events.on(`status:${serverId}`, listener);
    });
  }

  private async initializeMongoDB() {
    try {
      await this.mongoClient.connect();
      this.db = this.mongoClient.db(this.dbName);
      this.logsCollection = this.db.collection<ServerLogEntry>("logs");

      // Create indexes for better query performance
      await this.logsCollection.createIndex({ serverId: 1 });
      await this.logsCollection.createIndex(
        { buildRequestId: 1 },
        { sparse: true },
      );
      await this.logsCollection.createIndex({ createdAt: -1 });
      await this.logsCollection.createIndex({ status: 1, updatedAt: -1 }); // Optimize stats queries

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
    action: "created" | "error" | "deleted" | "updated",
  ) {
    try {
      if (!this.logsCollection) {
        console.warn("MongoDB not initialized, skipping database save");
        return;
      }

      // Create a copy to avoid mutating the original object
      const dataToSave = { ...server };
      // MongoDB _id cannot be in update/upsert bodies
      delete (dataToSave as any)._id;

      dataToSave.updatedAt = new Date();

      await this.logsCollection.updateOne(
        { serverId: server.serverId },
        { $set: dataToSave },
        { upsert: true },
      );

      console.log(
        `✅ Saved server ${server.serverId} to MongoDB with action: ${action}`,
      );
    } catch (error) {
      console.error("❌ Failed to save to MongoDB:", error);
      // Don't throw error to avoid breaking the main flow
    }
  }

  private triggerHumanFeedbackImport(log: ServerFeedbackLog): void {
    void (async () => {
      try {
        const agent = SkillSelectionAgent.getInstance({ tokenBudget: 30_000 });
        await agent.initialize();
        const summary = await agent.importHumanFeedbackFromLogs([log]);
        console.log(
          `[SkillSelect] human_feedback_import scanned=${summary.scannedLogs} matched=${summary.matchedOutcomes} imported=${summary.importedFeedbacks} duplicates=${summary.skippedDuplicates}`,
        );
      } catch (error) {
        console.warn(
          "[SkillSelect] Failed to import human feedback signal:",
          error,
        );
      }
    })();
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

              // ✅ Populate in-memory map
              this.servers.set(serverId, config as ServerLogEntry);

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

              // ✅ Populate in-memory map even if stopped
              this.servers.set(serverId, config as ServerLogEntry);
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

            // Update in-memory state to match database
            const inMemoryServer = this.servers.get(serverId);
            if (inMemoryServer) {
              inMemoryServer.status = "error";
              inMemoryServer.containerId = undefined;
            }

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

  private sendError(
    res: express.Response,
    status: number,
    message: string,
    error?: unknown,
  ): void {
    const response: { error: string; details?: unknown } = { error: message };

    // Only include error details in development mode
    if (process.env.NODE_ENV === "development" && error) {
      response.details = error instanceof Error ? error.message : String(error);
    }

    res.status(status).json(response);
  }

  private extractRequestToken(req: express.Request): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      return authHeader.slice("Bearer ".length).trim();
    }

    const queryToken = req.query.token;
    return typeof queryToken === "string" && queryToken ? queryToken : null;
  }

  private validateServerToken(serverId: string, token: string): boolean {
    const decoded = jwt.verify(token, this.jwtSecret) as jwt.JwtPayload;
    return decoded.serverId === serverId;
  }

  private async ensureServerLoaded(
    serverId: string,
  ): Promise<ServerLogEntry | null> {
    const inMemoryServer = this.servers.get(serverId);
    if (inMemoryServer) {
      return inMemoryServer;
    }

    if (!this.logsCollection) {
      return null;
    }

    const persistedServer = await this.logsCollection.findOne({ serverId });
    if (!persistedServer) {
      return null;
    }

    const server = persistedServer as ServerLogEntry;
    this.servers.set(serverId, server);
    return server;
  }

  private isReusableCreateStatus(status?: string): boolean {
    return Boolean(
      status &&
        !["error", "deleted"].includes(String(status).toLowerCase()),
    );
  }

  private createResponsePayload(server: ServerLogEntry, message?: string) {
    return {
      serverId: server.serverId,
      publicUrl: server.publicUrl,
      claudeConfig: this.generateClaudeConfig(server.serverId, server),
      status: server.status,
      buildRequestId: server.buildRequestId,
      message:
        message ||
        (server.status === "running"
          ? "Server created and running successfully"
          : "Server build is still in progress"),
    };
  }

  private async findServerByBuildRequestId(
    buildRequestId: string,
  ): Promise<ServerLogEntry | null> {
    if (!buildRequestId) return null;

    const indexedServerId = this.buildRequestIndex.get(buildRequestId);
    if (indexedServerId) {
      const indexedServer = this.servers.get(indexedServerId);
      if (indexedServer) {
        return indexedServer;
      }
    }

    for (const server of this.servers.values()) {
      if (server.buildRequestId === buildRequestId) {
        return server;
      }
    }

    if (!this.logsCollection) return null;

    const persisted = await this.logsCollection.findOne({ buildRequestId });
    if (!persisted) return null;

    const server = persisted as ServerLogEntry;
    this.servers.set(server.serverId, server);
    this.buildRequestIndex.set(buildRequestId, server.serverId);
    if (server.hostPort) {
      this.usedPorts.add(server.hostPort);
    }
    return server;
  }

  private async findServerByIdentifier(
    identifier: string,
  ): Promise<ServerLogEntry | null> {
    const normalizedIdentifier = String(identifier || "").trim();
    if (!normalizedIdentifier) return null;

    const byServerId = await this.ensureServerLoaded(normalizedIdentifier);
    if (byServerId) {
      return byServerId;
    }

    return this.findServerByBuildRequestId(normalizedIdentifier);
  }

  private async findReusableBuild(
    buildRequestId: string,
  ): Promise<ServerLogEntry | null> {
    if (!buildRequestId) return null;

    const indexedServerId = this.buildRequestIndex.get(buildRequestId);
    if (indexedServerId) {
      const indexedServer = this.servers.get(indexedServerId);
      if (indexedServer && this.isReusableCreateStatus(indexedServer.status)) {
        return indexedServer;
      }
    }

    for (const server of this.servers.values()) {
      if (
        server.buildRequestId === buildRequestId &&
        this.isReusableCreateStatus(server.status)
      ) {
        return server;
      }
    }

    if (!this.logsCollection) return null;

    const persisted = await this.logsCollection.findOne({
      buildRequestId,
      status: { $nin: ["error", "deleted"] },
    });
    if (!persisted) return null;

    const server = persisted as ServerLogEntry;
    this.servers.set(server.serverId, server);
    this.buildRequestIndex.set(buildRequestId, server.serverId);
    if (server.hostPort) {
      this.usedPorts.add(server.hostPort);
    }
    return server;
  }

  private setupRoutes() {
    // Enable CORS for configured origins (Docker-friendly configuration).
    // Set CORS_ORIGINS as a comma-separated list, for example: "http://localhost:9002,http://frontend:3000".
    const corsOrigins = process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    if (corsOrigins.length === 0 && process.env.NODE_ENV !== "production") {
      console.warn(
        "⚠️ CORS_ORIGINS is empty. Browser clients such as http://localhost:9002 will not be able to call manager APIs.",
      );
    }

    this.app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && corsOrigins.includes(origin)) {
        res.header("Access-Control-Allow-Origin", origin);
        res.header("Access-Control-Allow-Credentials", "true");
      }
      res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      if (req.method === "OPTIONS") {
        return res.sendStatus(200);
      }
      next();
    });

    // Increase payload size limits so large API docs (e.g. ~100KB+) are accepted.
    // Also accept urlencoded and plain text bodies (for raw OpenAPI/YAML uploads).
    this.app.use(express.json({ limit: "5mb" }));
    this.app.use(express.urlencoded({ limit: "5mb", extended: true }));
    this.app.use(express.text({ limit: "5mb", type: "*/*" }));

    // API to create a new MCP server.
    this.app.post("/api/mcp/create", async (req, res) => {
      let idempotencyKey = "";
      let allocatedServerId = "";
      try {
        const {
          request,
          name,
          dockerImage,
          userId,
          email,
          rag_context,
          buildRequestId,
          sessionId,
          workspaceId,
          memoryScope,
        } =
          req.body;

        // ✅ Validate required fields
        if (!request || !userId || !email) {
          return this.sendError(
            res,
            400,
            "Missing required fields: request, userId, email",
          );
        }

        idempotencyKey =
          String(
            buildRequestId ||
              req.header("Idempotency-Key") ||
              req.header("X-Idempotency-Key") ||
              "",
          ).trim();

        const existingBuild = await this.findReusableBuild(idempotencyKey);
        if (existingBuild) {
          const statusCode = existingBuild.status === "running" ? 200 : 202;
          return res
            .status(statusCode)
            .json(
              this.createResponsePayload(
                existingBuild,
                "Existing MCP server build returned for this idempotency key",
              ),
            );
        }

        const pendingServerId = idempotencyKey
          ? this.buildRequestIndex.get(idempotencyKey)
          : "";
        if (pendingServerId) {
          for (let attempt = 0; attempt < 50; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            const pendingBuild = await this.findReusableBuild(idempotencyKey);
            if (pendingBuild) {
              const statusCode = pendingBuild.status === "running" ? 200 : 202;
              return res
                .status(statusCode)
                .json(
                  this.createResponsePayload(
                    pendingBuild,
                    "Existing MCP server build returned for this idempotency key",
                  ),
                );
            }
          }

          return res.status(202).json({
            serverId: pendingServerId,
            status: "building",
            buildRequestId: idempotencyKey,
            claudeConfig: {},
            message: "Existing MCP server build is still allocating resources",
          });
        }

        const serverId = randomUUID();
        allocatedServerId = serverId;
        if (idempotencyKey) {
          this.buildRequestIndex.set(idempotencyKey, serverId);
        }
        const hostPort = await this.getAvailablePort();

        const now = Math.floor(Date.now() / 1000);
        const expiration = now + 365 * 24 * 60 * 60; // 1 year

        // Create JWT token.
        const token = jwt.sign(
          {
            sub: userId,
            email: email,
            serverId: serverId,
            iat: now,
            exp: expiration,
          },
          this.jwtSecret,
        );

        // Resolve the public proxy URL for generated MCP clients.
        const baseUrl = process.env.PUBLIC_URL || "http://localhost:8081";

        const serverConfig: ServerLogEntry = {
          serverId: serverId,
          //serverName: name,
          dockerImage:
            dockerImage || process.env.DEFAULT_MCP_IMAGE || "mcp-gen",
          containerPort: 3000, // Default port inside the generated container.
          hostPort: hostPort,
          status: "created",
          publicUrl: `${baseUrl}/mcp/${serverId}`,
          token: token,
          createdAt: new Date(),
          updatedAt: new Date(),
          buildLogs: [],
          inputContent: request,
          action: "created",
          ragContext: rag_context,
          buildRequestId: idempotencyKey || undefined,
          sessionId: sessionId ? String(sessionId) : undefined,
          workspaceId: workspaceId ? String(workspaceId) : undefined,
          memoryScope: memoryScope ? String(memoryScope) : undefined,
          likeCount: 0,
          dislikeCount: 0,
          feedbacks: [],
        };

        this.servers.set(serverId, serverConfig);

        await this.SaveToDB(serverConfig, "created");

        // Detect input type: JSON, YAML, or plain text.
        let inputType: "json" | "yaml" | "text" = "text";
        try {
          // Check JSON first.
          const jsonObj = JSON.parse(request);
          if (typeof jsonObj === "object" && jsonObj !== null) {
            inputType = "json";
          }
        } catch {
          // If it is not JSON, try YAML.
          try {
            const yamlObj = yaml.load(request);
            if (typeof yamlObj === "object" && yamlObj !== null) {
              // Ensure it's not a primitive mapped to YAML (like string/number)
              inputType = "yaml";
            } else {
              inputType = "text";
            }
          } catch {
            inputType = "text";
          }
        }
        serverConfig.buildLogs?.push(`Input type detected: ${inputType}`);

        // Resolve the current module directory for artifact paths.
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);

        // Name the input artifact based on detected input type.
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

        // YAML input can be copied directly to the OpenAPI artifact path.
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

          // Unified retry loop for text generation: handles both generation errors
          // (template syntax, API failures) and validation failures
          let checking: { success: boolean; error?: string } = {
            success: false,
          };
          let lastError: string | undefined;
          let retryCount = 0;
          const maxRetries = 5;

          while (!checking.success && retryCount < maxRetries) {
            try {
              console.log(
                `🔄 Generation attempt ${retryCount + 1} of ${maxRetries}...`,
              );
              await generateOpenAPISpec(
                outputPath,
                serverId,
                retryCount,
                lastError,
                rag_context,
                idempotencyKey || serverId,
              );

              // Validate the generated spec
              checking = await confirm(openapi_filepath);
              if (!checking.success) {
                lastError = checking.error || "Validation failed";
                console.log(
                  `⚠️ Validation failed: ${lastError}. Will retry...`,
                );
              }
            } catch (error: any) {
              // Generation failed (template syntax, API error, etc.)
              lastError = error.message;
              console.log(
                `❌ Generation error: ${error.message}. Will retry...`,
              );
              checking = { success: false, error: error.message };
            }

            retryCount++;
          }

          if (checking.success) {
            console.log(
              `✅ OpenAPI spec validated successfully after ${retryCount} attempts (Total LLM calls: ${retryCount + 1})`,
            );
          } else {
            console.log("❌ Validation failed after maximum retries");
            // Clean up allocated resources
            this.servers.delete(serverId);
            this.usedPorts.delete(hostPort);
            if (idempotencyKey) this.buildRequestIndex.delete(idempotencyKey);
            await this.SaveToDB({ ...serverConfig, status: "error" }, "error");

            return this.sendError(
              res,
              500,
              "Failed to generate valid OpenAPI specification",
              checking.error,
            );
          }
        }

        console.log("📍 Using OpenAPI spec:", openapi_filepath);

        // For JSON/YAML inputs, already converted - just validate once
        if (inputType !== "text") {
          console.log("✅ Input already in OpenAPI format, validating...");
          const checking = await confirm(openapi_filepath);
          if (!checking.success) {
            console.log("❌ Validation failed for direct input");
            this.servers.delete(serverId);
            this.usedPorts.delete(hostPort);
            if (idempotencyKey) this.buildRequestIndex.delete(idempotencyKey);
            await this.SaveToDB({ ...serverConfig, status: "error" }, "error");

            return this.sendError(
              res,
              500,
              "Failed to generate valid OpenAPI specification",
              checking.error,
            );
          }
          console.log("✅ OpenAPI spec validated successfully");
        }

        // Queue build message or process synchronously
        if (this.messageQueue.connected) {
          await this.messageQueue.publishBuildMessage({
            serverId: serverConfig.serverId,
            dockerImage: serverConfig.dockerImage,
            dockerfilePath: ".",
            contextPath: ".",
            hostPort,
            containerPort: serverConfig.containerPort,
          });
        } else {
          // Fallback to synchronous processing
          const containerId = await this.buildAndRunContainer(
            serverConfig,
            ".",
          );

          serverConfig.containerId = containerId;
          if (serverConfig.status !== "running") {
            serverConfig.status = "created";
            await this.SaveToDB(serverConfig, "created");
          } else {
            await this.SaveToDB(serverConfig, "updated");
          }
        }

        // Final Wait for "running" status before returning response to client
        try {
          console.log(`⏳ Waiting for server ${serverId} to be running...`);
          const finalStatus = await this.waitForStatus(serverId, "running");

          if (finalStatus === "running") {
            const updatedServer = this.servers.get(serverId) || serverConfig;
            res.json(
              this.createResponsePayload(
                updatedServer,
                "Server created and running successfully",
              ),
            );
          } else {
            if (idempotencyKey) this.buildRequestIndex.delete(idempotencyKey);
            res.status(500).json({
              error: "Server encountered an error during startup",
              serverId: serverId,
              status: "error",
            });
          }
        } catch (waitError: any) {
          console.error(`Error waiting for server ${serverId}:`, waitError);
          serverConfig.buildLogs = [
            ...(serverConfig.buildLogs || []),
            `Warning: ${waitError instanceof Error ? waitError.message : String(waitError)}`,
          ];
          serverConfig.updatedAt = new Date();
          await this.SaveToDB(serverConfig, "updated");

          const updatedServer = this.servers.get(serverId) || serverConfig;
          res
            .status(202)
            .json(
              this.createResponsePayload(
                updatedServer,
                "Server build is still in progress; poll status or wait for ready notification",
              ),
            );
        }
      } catch (error) {
        console.error("Error creating MCP server:", error);
        if (idempotencyKey && allocatedServerId) {
          this.buildRequestIndex.delete(idempotencyKey);
        }
        this.sendError(res, 500, "Failed to create MCP server", error);
      }
    });

    // API list servers
    this.app.get("/api/mcp/servers", async (req, res) => {
      try {
        if (!this.logsCollection) {
          return this.sendError(res, 503, "Database not available");
        }

        const rawStatuses = String(req.query.statuses || "").trim();
        const requestedStatuses = rawStatuses
          ? rawStatuses
              .split(",")
              .map((status) => status.trim().toLowerCase())
              .filter(Boolean)
          : [];
        const invalidStatuses = requestedStatuses.filter(
          (status) => !VALID_SERVER_STATUSES.has(status),
        );
        if (invalidStatuses.length > 0) {
          return this.sendError(
            res,
            400,
            `Invalid server status filter: ${invalidStatuses.join(", ")}`,
          );
        }

        const query: Filter<ServerLogEntry> =
          requestedStatuses.length > 0
            ? {
                status: {
                  $in: requestedStatuses as ServerLogEntry["status"][],
                },
              }
            : {};
        const serverList = await this.logsCollection.find(query).toArray();

        // Sanitize: remove sensitive fields and large/unnecessary data
        const sanitizedServers = serverList.map((server) => {
          const {
            token,
            containerId,
            hostPort,
            containerPort,
            dockerImage,
            inputContent,
            action,
            buildLogs,
            ragContext,
            _id,
            ...rest
          } = server;
          // Also sanitize feedbacks: remove userId for privacy
          const sanitizedFeedbacks: FeedbackEntry[] = (
            rest.feedbacks || []
          ).map((fb: FeedbackEntry) => {
            const { userId, ...fbRest } = fb;
            return fbRest;
          });
          return {
            ...rest,
            feedbacks: sanitizedFeedbacks,
          };
        });

        res.json({
          servers: sanitizedServers,
          count: sanitizedServers.length,
        });
      } catch (error) {
        console.error("Error fetching server list:", error);
        this.sendError(res, 500, "Failed to fetch server list");
      }
    });

    // API to get current server/build status by serverId or buildRequestId.
    this.app.get("/api/mcp/:identifier/status", async (req, res) => {
      try {
        const { identifier } = req.params;
        const server = await this.findServerByIdentifier(identifier);

        if (!server) {
          const pendingServerId = this.buildRequestIndex.get(
            String(identifier || "").trim(),
          );
          if (pendingServerId) {
            return res.status(202).json({
              serverId: pendingServerId,
              status: "building",
              buildRequestId: identifier,
              claudeConfig: {},
              message: "Server build is still allocating resources",
            });
          }
          return this.sendError(res, 404, "Server or build request not found");
        }

        res.json(
          this.createResponsePayload(
            server,
            server.status === "running"
              ? "Server is running"
              : "Server build is still in progress",
          ),
        );
      } catch (error) {
        console.error("Error fetching server status:", error);
        this.sendError(res, 500, "Failed to fetch server status");
      }
    });

    // API submit feedback for MCP server
    this.app.post("/api/mcp/:serverId/feedback", async (req, res) => {
      try {
        // Rate limiting check
        const clientIp = req.ip || req.connection.remoteAddress || "unknown";
        if (feedbackRateLimiter.isLimited(clientIp)) {
          return this.sendError(
            res,
            429,
            "Too many feedback requests, please try again later",
          );
        }

        const { serverId } = req.params;
        const { type, userId, comment } = req.body;

        // Validate required fields
        if (!type || !["like", "dislike"].includes(type)) {
          return this.sendError(
            res,
            400,
            "Invalid feedback type. Must be 'like' or 'dislike'",
          );
        }

        // Validate comment length if provided (max 1000 chars)
        const MAX_COMMENT_LENGTH = 1000;
        if (comment && comment.length > MAX_COMMENT_LENGTH) {
          return this.sendError(
            res,
            400,
            `Comment too long (maximum ${MAX_COMMENT_LENGTH} characters)`,
          );
        }

        if (!this.logsCollection) {
          return this.sendError(res, 503, "Database not available");
        }

        // Create feedback entry (sanitize comment for potential HTML)
        const sanitizedComment = comment
          ? comment.replace(/<[^>]*>/g, "")
          : undefined;
        const feedbackEntry = {
          feedbackId: randomUUID(),
          type,
          comment: sanitizedComment || undefined,
          userId: userId || undefined,
          timestamp: new Date(),
        };

        // Atomic update: increment counter and push feedback entry
        const result = await this.logsCollection.updateOne(
          { serverId },
          {
            $inc: {
              likeCount: type === "like" ? 1 : 0,
              dislikeCount: type === "dislike" ? 1 : 0,
            },
            $push: { feedbacks: feedbackEntry },
          },
          { upsert: false }, // Only update existing servers
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            error: "Server not found",
          });
        }

        // Fetch updated document to return current counts
        const updatedDoc = await this.logsCollection.findOne(
          { serverId },
          {
            projection: {
              serverId: 1,
              requestId: 1,
              buildRequestId: 1,
              likeCount: 1,
              dislikeCount: 1,
              feedbacks: 1,
            },
          },
        );

        this.triggerHumanFeedbackImport({
          serverId,
          requestId:
            typeof updatedDoc?.requestId === "string"
              ? updatedDoc.requestId
              : undefined,
          buildRequestId:
            typeof updatedDoc?.buildRequestId === "string"
              ? updatedDoc.buildRequestId
              : undefined,
          likeCount: updatedDoc?.likeCount || 0,
          dislikeCount: updatedDoc?.dislikeCount || 0,
          feedbacks: updatedDoc?.feedbacks || [],
        });

        res.json({
          success: true,
          serverId,
          likeCount: updatedDoc?.likeCount || 0,
          dislikeCount: updatedDoc?.dislikeCount || 0,
          totalFeedbacks: updatedDoc?.feedbacks?.length || 0,
        });
      } catch (error) {
        console.error("Error submitting feedback:", error);
        res.status(500).json({
          error: "Failed to submit feedback",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // API to get Claude config for a specific server.
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
            return this.sendError(
              res,
              404,
              response.error || "Failed to get Claude config",
            );
          }
        } else {
          // Fallback to direct call when message queue is not available
          const config = await this.getClaudeConfig(serverId);
          res.json(config);
        }
      } catch (error) {
        console.error("Error getting Claude config:", error);
        this.sendError(res, 500, "Failed to get Claude config");
      }
    });

    // API to delete a server.
    this.app.delete("/api/mcp/:serverId", async (req, res) => {
      try {
        const { serverId } = req.params;
        const token = req.query.token as string;

        // Validate input
        if (!serverId) {
          return this.sendError(res, 400, "Server ID is required");
        }

        if (!token) {
          return this.sendError(res, 401, "Token required");
        }

        // Check if server exists
        const existingServer = await this.logsCollection?.findOne({ serverId });
        if (!existingServer) {
          return this.sendError(res, 404, "Server not found");
        }

        // Validate JWT token
        const jwtSecret = this.loadPersistedData();
        if (!jwtSecret) {
          return this.sendError(res, 500, "Server configuration error");
        }

        try {
          const decoded = jwt.verify(token, jwtSecret) as any;

          if (decoded.serverId !== serverId) {
            console.log("Token serverId mismatch");
            return this.sendError(res, 403, "Invalid token for this server");
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
          return this.sendError(res, 401, "Invalid token");
        }
      } catch (error) {
        console.error("Error deleting server:", error);
        this.sendError(res, 500, "Failed to delete server");
      }
    });

    // API to get server statistics from MongoDB
    this.app.get("/api/mcp/stats", async (req, res) => {
      try {
        const stats = await this.getServerStats();
        res.json(stats);
      } catch (error) {
        console.error("Error getting server stats:", error);
        this.sendError(res, 500, "Failed to get server statistics");
      }
    });

    this.app.post("/api/mcp/:serverId/ready", async (req, res) => {
      const { serverId } = req.params;
      try {
        console.log(`📡 Received ready notification for server ${serverId}`);

        const token = this.extractRequestToken(req);
        if (!token) {
          return this.sendError(res, 401, "Token required");
        }

        try {
          if (!this.validateServerToken(serverId, token)) {
            return this.sendError(res, 403, "Invalid token for this server");
          }
        } catch (authError) {
          console.error("Ready notification authentication error:", authError);
          return this.sendError(res, 401, "Invalid token");
        }

        const server = await this.ensureServerLoaded(serverId);
        if (!server) {
          const status = this.logsCollection ? 404 : 503;
          const message = this.logsCollection
            ? "Server not found"
            : "Database not available";
          return this.sendError(res, status, message);
        }

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
          `❌ Error processing ready notification for ${serverId}:`,
          error,
        );
        this.sendError(res, 500, "Failed to process ready notification");
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

        const artifactExists = {
          input: !!inputPath,
          openapi: fs.existsSync(yamlPath),
          typescript: fs.existsSync(tsPath),
        };
        const complete =
          artifactExists.input &&
          artifactExists.openapi &&
          artifactExists.typescript;

        const response = {
          serverId,
          complete,
          ...(complete
            ? {}
            : { message: "One or more artifacts are not available yet" }),
          exists: artifactExists,
          files: {
            input: artifactExists.input
              ? {
                  name: inputFileName,
                  content: fs.readFileSync(inputPath, "utf8"),
                }
              : null,
            openapi: artifactExists.openapi
              ? {
                  name: yamlFileName,
                  content: fs.readFileSync(yamlPath, "utf8"),
                }
              : null,
            typescript: artifactExists.typescript
              ? {
                  name: tsFileName,
                  content: fs.readFileSync(tsPath, "utf8"),
                }
              : null,
          },
        };

        res.status(complete ? 200 : 206).json(response);
      } catch (error) {
        console.error(
          `Error retrieving files for ${req.params.serverId}:`,
          error,
        );
        this.sendError(res, 500, "Failed to retrieve generated files");
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
      // Check whether the configured image already exists.
      let imageExists = await this.checkImageExists(config.dockerImage);

      // If the image does not exist, build it from the Dockerfile.
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
          `MANAGER_URL=${process.env.MANAGER_URL || "http://docker-manager:8080"}`,
          `RAG_CONTEXT=${config.ragContext || ""}`,
          `BUILD_REQUEST_ID=${config.buildRequestId || config.serverId}`,
          `MONGO_URI=${process.env.MONGO_URI || ""}`,
          `SKILL_FEEDBACK_ENABLED=${process.env.SKILL_FEEDBACK_ENABLED || ""}`,
          `DYNAMIC_SKILL_SELECTION=${process.env.DYNAMIC_SKILL_SELECTION || ""}`,
          `SKILL_SELECTION_VARIANT=${process.env.SKILL_SELECTION_VARIANT || ""}`,
          `SKILL_SELECTION_HYBRID_CONFIDENCE_THRESHOLD=${process.env.SKILL_SELECTION_HYBRID_CONFIDENCE_THRESHOLD || ""}`,
        ],
        NetworkingConfig: {
          EndpointsConfig: {
            [this.mcpNetworkName]: {},
          },
        },
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

      // Create a tar stream for the build context directory.
      const tarStream = tar.pack(context);

      await new Promise<void>((resolve, reject) => {
        this.docker.buildImage(
          tarStream,
          {
            t: config.dockerImage, // Image tag.
            dockerfile: "Dockerfile",
          },
          (err, output) => {
            if (err) {
              config.buildLogs?.push(`Build failed: ${err.message}`);
              return reject(err);
            }

            // Cast output to a Node.js readable stream.
            const stream = output as NodeJS.ReadableStream;

            // Read Docker build progress from the stream.
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

      // Check whether the container is currently running.
      const containerInfo = await container.inspect();
      if (containerInfo.State.Running) {
        await container.stop({ t: 10 }); // Graceful shutdown 10s
      }

      await container.remove({ force: true });
    } catch (error) {
      console.error(`Error removing container ${containerId}:`, error);
      // Do not throw here; cleanup should continue even if Docker removal fails.
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
    const scanLimit = Number(process.env.MCP_PORT_SCAN_LIMIT || 1000);
    const maxPort = this.basePort + Math.max(1, scanLimit);

    while (port < maxPort) {
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

    throw new Error(
      `No available port found in range ${this.basePort}-${maxPort - 1}`,
    );
  }

  private generateClaudeConfig(serverId: string, config: ServerLogEntry) {
    const args = ["mcp-remote", `${config.publicUrl}?token=${config.token}`];
    if (config.publicUrl.includes("localhost")) {
      args.push("--allow-http");
    }
    return {
      mcpServers: {
        [serverId]: {
          command: "bunx",
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
      return this.generateClaudeConfig(serverId, server as ServerLogEntry);
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

      // Stop and remove container.
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

    if (FEATURE_FLAGS.DYNAMIC_SKILL_SELECTION) {
      try {
        console.log(
          "[SkillSelect] Pre-warming SkillSelectionAgent at startup...",
        );
        await SkillSelectionAgent.prewarm({ tokenBudget: 30_000 });
      } catch (error) {
        console.warn(
          "[SkillSelect] Pre-warm failed; dynamic selection will fall back per request:",
          error,
        );
      }
    }
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

    // ✅ Check for port availability first
    if (!(await this.isPortAvailable(port))) {
      throw new Error(`Port ${port} is already in use`);
    }

    // ✅ Recover running containers BEFORE checking dependencies/RabbitMQ
    await this.recoverRunningContainers();

    // ✅ Check dependencies (RabbitMQ, MongoDB, Docker ping)
    await this.checkDependencies();

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

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
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
}
