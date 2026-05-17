import amqp, { Channel, ChannelModel, Message } from "amqplib";

export interface BuildMessage {
  serverId: string;
  dockerImage: string;
  dockerfilePath?: string;
  contextPath?: string;
  hostPort: number;
  containerPort: number;
}

export interface StatusUpdateMessage {
  serverId: string;
  status:
    | "created"
    | "error"
    | "deleted"
    | "started"
    | "stopped"
    | "running"
    | "building";
  containerId?: string;
  buildLogs?: string[];
  error?: string;
}

export interface GetClaudeConfig {
  serverId: string;
  correlationId?: string;
  replyTo?: string;
}

export interface GetClaudeConfigResponse {
  serverId: string;
  correlationId: string;
  success: boolean;
  config?: any;
  error?: string;
}

export interface DeleteMessage {
  serverId: string;
}

export class MessageQueueService {
  private connection!: ChannelModel;
  private channel!: Channel;
  private rabbitUrl: string;
  private buildQueue: string = "mcp.build";
  private statusQueue: string = "mcp.status";
  private GetConfigQueue: string = "mcp.getConfig";
  private GetConfigResponseQueue: string = "mcp.getConfig.response";
  private deleteQueue: string = "mcp.delete";
  private isConnected: boolean = false;
  private pendingRequests: Map<string, (response: any) => void> = new Map();

  constructor(rabbitUrl?: string) {
    // Priority: parameter > environment variable > default
    this.rabbitUrl =
      rabbitUrl || process.env.RABBITMQ_URL || "amqp://localhost";

    console.log(
      `🐰 RabbitMQ URL: ${this.rabbitUrl.replace(/\/\/.*@/, "//***:***@")}`,
    );
  }

  async initialize(): Promise<void> {
    try {
      this.connection = await amqp.connect(this.rabbitUrl);
      this.channel = await this.connection.createChannel();

      // Declare queues
      await this.channel.assertQueue(this.buildQueue, { durable: true });
      await this.channel.assertQueue(this.statusQueue, { durable: true });
      await this.channel.assertQueue(this.GetConfigQueue, { durable: true });
      await this.channel.assertQueue(this.GetConfigResponseQueue, {
        durable: true,
      });
      await this.channel.assertQueue(this.deleteQueue, { durable: true });

      this.isConnected = true;
      console.log("✅ RabbitMQ initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize RabbitMQ:", error);
      this.isConnected = false;
      throw error;
    }
  }

  async publishBuildMessage(message: BuildMessage): Promise<void> {
    if (!this.isConnected) {
      throw new Error("RabbitMQ not connected");
    }

    try {
      const messageBuffer = Buffer.from(JSON.stringify(message));
      this.channel.sendToQueue(this.buildQueue, messageBuffer, {
        persistent: true,
      });
      console.log(`Build message queued for server ${message.serverId}`);
    } catch (error) {
      console.error("Failed to publish build message:", error);
      throw error;
    }
  }

  async publishStatusUpdate(message: StatusUpdateMessage): Promise<void> {
    if (!this.isConnected) {
      console.warn("RabbitMQ not connected, skipping status update");
      return;
    }

    try {
      const messageBuffer = Buffer.from(JSON.stringify(message));
      this.channel.sendToQueue(this.statusQueue, messageBuffer, {
        persistent: true,
      });
    } catch (error) {
      console.error("Failed to publish status update:", error);
    }
  }

  async publishGetConfig(message: GetClaudeConfig): Promise<any> {
    if (!this.isConnected) {
      throw new Error("RabbitMQ not connected");
    }

    try {
      const correlationId =
        message.correlationId || Math.random().toString(36).substring(7);
      const requestMessage = {
        ...message,
        correlationId,
        replyTo: this.GetConfigResponseQueue,
      };

      return new Promise((resolve, reject) => {
        // Store the pending request
        this.pendingRequests.set(correlationId, resolve);

        // Set timeout to avoid hanging forever
        setTimeout(() => {
          this.pendingRequests.delete(correlationId);
          reject(new Error("Request timeout"));
        }, 30000); // 30 second timeout

        const messageBuffer = Buffer.from(JSON.stringify(requestMessage));
        this.channel.sendToQueue(this.GetConfigQueue, messageBuffer, {
          persistent: true,
          correlationId,
          replyTo: this.GetConfigResponseQueue,
        });
      });
    } catch (error) {
      console.error("Failed to publish get config:", error);
      throw error;
    }
  }

  async publishDeleteMessage(message: DeleteMessage): Promise<void> {
    if (!this.isConnected) {
      console.warn("RabbitMQ not connected, skipping status update");
      return;
    }

    try {
      const messageBuffer = Buffer.from(JSON.stringify(message));
      this.channel.sendToQueue(this.deleteQueue, messageBuffer, {
        persistent: true,
      });
    } catch (error) {
      console.error("Failed to publish delete message:", error);
    }
  }

  async publishGetConfigResponse(
    response: GetClaudeConfigResponse,
  ): Promise<void> {
    if (!this.isConnected) {
      console.warn("RabbitMQ not connected, skipping response");
      return;
    }

    try {
      const messageBuffer = Buffer.from(JSON.stringify(response));
      this.channel.sendToQueue(this.GetConfigResponseQueue, messageBuffer, {
        persistent: true,
        correlationId: response.correlationId,
      });
    } catch (error) {
      console.error("Failed to publish get config response:", error);
    }
  }

  async setupConsumers(
    buildHandler: (message: BuildMessage) => Promise<void>,
    statusHandler: (message: StatusUpdateMessage) => Promise<void>,
    getConfigHandler: (message: GetClaudeConfig) => Promise<void>,
    deleteHandler: (message: DeleteMessage) => Promise<void>,
  ): Promise<void> {
    if (!this.isConnected) {
      throw new Error("RabbitMQ not connected");
    }

    // Build queue consumer
    await this.channel.consume(
      this.buildQueue,
      async (msg: Message | null) => {
        if (msg) {
          try {
            const buildMessage: BuildMessage = JSON.parse(
              msg.content.toString(),
            );
            await buildHandler(buildMessage);
            this.channel.ack(msg);
          } catch (error) {
            console.error("Error processing build message:", error);
            this.channel.nack(msg, false, false);
          }
        }
      },
      { noAck: false },
    );

    // Status update queue consumer
    await this.channel.consume(
      this.statusQueue,
      async (msg: Message | null) => {
        if (msg) {
          try {
            const statusMessage: StatusUpdateMessage = JSON.parse(
              msg.content.toString(),
            );
            await statusHandler(statusMessage);
            this.channel.ack(msg);
          } catch (error) {
            console.error("Error processing status update:", error);
            this.channel.nack(msg, false, false);
          }
        }
      },
      { noAck: false },
    );

    await this.channel.consume(
      this.GetConfigQueue,
      async (msg: Message | null) => {
        if (msg) {
          try {
            const getConfigMessage: GetClaudeConfig = JSON.parse(
              msg.content.toString(),
            );
            await getConfigHandler(getConfigMessage);
            this.channel.ack(msg);
          } catch (error) {
            console.error("Error getting Claude Config:", error);
            this.channel.nack(msg, false, false);
          }
        }
      },
      { noAck: false },
    );

    await this.channel.consume(
      this.deleteQueue,
      async (msg: Message | null) => {
        if (msg) {
          try {
            const deleteMessage: DeleteMessage = JSON.parse(
              msg.content.toString(),
            );
            await deleteHandler(deleteMessage);
            this.channel.ack(msg);
          } catch (error) {
            console.error("Error getting Claude Config:", error);
            this.channel.nack(msg, false, false);
          }
        }
      },
      { noAck: false },
    );

    // Response queue consumer
    await this.channel.consume(
      this.GetConfigResponseQueue,
      async (msg: Message | null) => {
        if (msg) {
          try {
            const response: GetClaudeConfigResponse = JSON.parse(
              msg.content.toString(),
            );

            // Find and resolve the pending request
            const resolver = this.pendingRequests.get(response.correlationId);
            if (resolver) {
              resolver(response);
              this.pendingRequests.delete(response.correlationId);
            }

            this.channel.ack(msg);
          } catch (error) {
            console.error("Error processing get config response:", error);
            this.channel.nack(msg, false, false);
          }
        }
      },
      { noAck: false },
    );

    console.log("✅ Message consumers set up successfully");
  }

  async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.isConnected = false;
      console.log("✅ RabbitMQ connection closed");
    } catch (error) {
      console.error("❌ Error closing RabbitMQ connection:", error);
    }
  }

  get connected(): boolean {
    return this.isConnected;
  }
}
