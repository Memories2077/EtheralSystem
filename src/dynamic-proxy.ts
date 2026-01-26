import { Agent } from "http";
import http from "http";
import httpProxy from "http-proxy";
import { URL } from "url"; // Use WHATWG URL API instead of deprecated url.parse
import { MongoClient, Db, Collection } from "mongodb";
import jwt from "jsonwebtoken";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ServerLogEntry {
  serverId: string;
  serverName: string;
  dockerImage: string;
  status: "created" | "error" | "deleted" | "started" | "stopped" | "running";
  publicUrl: string;
  token: string;
  hostPort: number;
  containerPort: number;
  containerId?: string;
  createdAt: Date;
  updatedAt: Date;
  buildLogs?: string[];
}

// giả sử map serverId -> hostPort (thực tế bạn lấy từ DB/in-memory)
const backends = new Map<string, number>();

const mongoUrl = process.env.MONGO_URI || "mongodb://localhost:27017";
const dbName = "docker";

const mongoClient = new MongoClient(mongoUrl);
let hosts: any[] = [];
let db;
let logsCollection: Collection<ServerLogEntry>;

const persistenceFilePath = path.resolve(__dirname, "../data/persistence.json");

function loadPersistedData(): string | null {
  try {
    if (fs.existsSync(persistenceFilePath)) {
      const data = fs.readFileSync(persistenceFilePath, "utf8");

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
  }
  return null;
}

const jwtSecret = loadPersistedData();

async function initializeMongoDB() {
  try {
    await mongoClient.connect();
    db = mongoClient.db(dbName);
    logsCollection = db.collection<ServerLogEntry>("logs");

    // Create index for better query performance
    await logsCollection.createIndex({ serverId: 1 });
    await logsCollection.createIndex({ createdAt: -1 });

    console.log("✅ Connected to MongoDB successfully");
  } catch (error) {
    console.error("❌ Failed to connect to MongoDB:", error);
    console.log("Continuing without MongoDB logging...");
  }

  if (logsCollection) {
    try {
      hosts = await logsCollection
        .find({
          $or: [
            { status: "running" },
            { status: "created" },
            { status: "stopped" },
          ],
        })
        .project({ serverId: 1, hostPort: 1, _id: 0 })
        .toArray();
    } catch (error) {
      console.warn("Failed to fetch server data from MongoDB:", error);
      console.log("Continuing without existing server data...");
    }
  }

  for (const h of hosts) {
    const port = Number(h.hostPort);
    if (!Number.isInteger(port)) continue;
    backends.set(String(h.serverId), port);
  }
}

const proxy = httpProxy.createProxyServer({
  ws: true,
  changeOrigin: true,
  timeout: 30000,
  proxyTimeout: 30000,
});

// Tối ưu agent (reuse connections to backends)
const agent = new Agent({ keepAlive: true, maxSockets: 100 });

// lỗi chung
proxy.on("error", (err, req, res) => {
  console.error("proxy error", err);
  try {
    if (res && typeof (res as any).end === "function") {
      if (!(res as http.ServerResponse).headersSent) {
        (res as http.ServerResponse).writeHead(502, {
          "Content-Type": "text/plain",
        });
      }
      (res as any).end("Bad Gateway");
    }
  } catch (e) {
    console.error("error sending 502", e);
  }
});

const server = http.createServer(async (req, res) => {
  // route pattern /mcp/<serverId>
  try {
    const reqUrl = new URL(
      req.url || "",
      `http://${req.headers.host || "localhost"}`
    );

    // check if the url follows the format "/mcp/server123"
    const match = reqUrl.pathname.match(/^\/mcp\/([^\/]+)\/?(.*)$/);
    if (!match) {
      res.writeHead(404);
      return res.end("Not found");
    }

    const serverId = match[1];
    const remainingPath = match[2] || "";

    // Extract token from query parameters
    const token = reqUrl.searchParams.get("token");

    if (!token) {
      res.writeHead(401);
      return res.end(JSON.stringify({ error: "Token required" }));
    }

    // Verify JWT token
    if (jwtSecret) {
      try {
        const decoded = jwt.verify(token, jwtSecret) as any;

        console.log("Token decoded successfully");

        if (decoded.serverId !== serverId) {
          console.log("Token serverId mismatch");
          res.writeHead(403);
          return res.end(
            JSON.stringify({ error: "Invalid token for this server" })
          );
        }

        console.log("Token validation passed");

        // Check if server exists and is running
        if (logsCollection) {
          const serverData = await logsCollection.findOne({ serverId });

          if (!serverData) {
            console.log("Server not found in database");
            res.writeHead(404);
            return res.end(JSON.stringify({ error: "Server not found" }));
          }

          if (serverData.status !== "running") {
            res.writeHead(400);
            return res.end(
              JSON.stringify({
                error: "Server is not running",
                status: serverData.status,
              })
            );
          }
        }
      } catch (error) {
        console.error("Authentication error:", error);
        res.writeHead(401);
        return res.end(JSON.stringify({ error: "Invalid token" }));
      }
    }
    else {
      console.warn("JWT secret not found, rejecting all requests");
      res.writeHead(503);
      return res.end(JSON.stringify({ error: "Token not found or invalid!" }));
    }

    // Check if serverId exists in backends map
    let port = backends.get(serverId);
    if (!port) {
      const hostPortDoc = await logsCollection
        .find({
          $and: [{ status: "running" }, { serverId: `${serverId}` }],
        })
        .project({ serverId: 1, hostPort: 1, _id: 0 })
        .next();

      port = hostPortDoc?.hostPort;
    }

    if (!port) {
      res.writeHead(404);
      return res.end("Server not found");
    }

    const targetHost = process.env.BACKEND_HOST || "127.0.0.1";

    const target = `http://${targetHost}:${port}`;

    // Rewrite the URL to include /mcp path for the backend
    const newPath = `/mcp${remainingPath ? "/" + remainingPath : ""}`;

    // Remove token from query params when forwarding to backend
    const searchParams = new URLSearchParams(reqUrl.search);
    searchParams.delete("token");
    const cleanQuery = searchParams.toString();

    req.url = newPath + (cleanQuery ? "?" + cleanQuery : "");

    console.log(`Proxying ${reqUrl.pathname} -> ${target}${req.url}`);

    // preserve querystring automatically when proxying
    proxy.web(req, res, { target, agent });
  } catch (e) {
    console.error("URL parsing error:", e);
    res.writeHead(400);
    res.end("Bad Request");
  }
});

server.on("upgrade", async (req, socket, head) => {
  try {
    const reqUrl = new URL(
      req.url || "",
      `http://${req.headers.host || "localhost"}`
    );
    const match = reqUrl.pathname.match(/^\/mcp\/([^\/]+)\/?(.*)$/);
    if (!match) {
      socket.destroy();
      return;
    }
    const serverId = match[1];
    const remainingPath = match[2] || "";

    let port = backends.get(serverId);

    if (!port) {
      const hostPortDoc = await logsCollection
        .find({
          $and: [{ status: "running" }, { serverId: `${serverId}` }],
        })
        .project({ serverId: 1, hostPort: 1, _id: 0 })
        .next();

      port = hostPortDoc?.hostPort;
    }

    if (!port) {
      socket.destroy();
      return;
    }

    const target = `http://127.0.0.1:${port}`;

    // Rewrite the URL for WebSocket upgrade
    const newPath = `/mcp${remainingPath ? "/" + remainingPath : ""}`;
    req.url = newPath + (reqUrl.search || "");

    console.log(`WebSocket upgrade ${reqUrl.pathname} -> ${target}${req.url}`);

    proxy.ws(req, socket, head, { target });
  } catch (e) {
    console.error("WebSocket URL parsing error:", e);
    socket.destroy();
  }
});

(async () => {
  await initializeMongoDB();
  server.listen(8081, () => console.log("listening :8081"));
})();

process.on("SIGINT", async () => {
  console.log("shutdown");
  await mongoClient.close();
  process.exit(0);
});

// Fix the The Root Problem:
// Backend servers are listening on /mcp but the proxy was either:

// Not properly extracting the serverId from the URL
// Not correctly rewriting the path back to /mcp for the target server
// Having issues with URL parsing due to the deprecated url.parse() method
