#!/usr/bin/env node
import { Command } from "commander";
import path from "path";
import fs from "fs";
import { exec } from "child_process";

const program = new Command();
const serverId = process.env.SERVER_ID;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForHealth(port: string, hasExited: () => boolean) {
  const deadline = Date.now() + 30_000;
  const healthUrl = `http://127.0.0.1:${port}/health`;

  while (Date.now() < deadline) {
    if (hasExited()) {
      throw new Error("Server process exited before health check passed");
    }

    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // Server may still be starting.
    }

    await sleep(1000);
  }

  throw new Error(`Timed out waiting for health check: ${healthUrl}`);
}

async function notifyManagerReady(serverId: string) {
  const jwtToken = process.env.JWT_TOKEN;
  if (!jwtToken) {
    throw new Error("JWT_TOKEN environment variable is required");
  }

  const managerUrl = process.env.MANAGER_URL || "http://localhost:8080";
  const response = await fetch(`${managerUrl}/api/mcp/${serverId}/ready`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwtToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Failed to notify manager: ${response.status} ${response.statusText} ${body}`.trim(),
    );
  }
}

program.action(() => {
  // Validate SERVER_ID
  if (!serverId) {
    console.error("❌ SERVER_ID environment variable is required");
    process.exit(1);
  }

  const srcGeneratedDir = "src-generated-ts";

  if (!fs.existsSync(srcGeneratedDir)) {
    console.error(`❌ Directory does not exist: ${srcGeneratedDir}`);
    process.exit(1);
  }

  // Find all .ts files in src-generated
  const tsFiles = fs
    .readdirSync(srcGeneratedDir)
    .filter((file) => file.endsWith(".ts"));

  if (tsFiles.length === 0) {
    console.error(`❌ No TypeScript files found in ${srcGeneratedDir}`);
    process.exit(1);
  }

  const serverPath = path.join(srcGeneratedDir, `${serverId}.ts`);

  // Verify the server file exists
  if (!fs.existsSync(serverPath)) {
    console.error(`❌ Server file not found: ${serverPath}`);
    process.exit(1);
  }

  const serverName = serverId;

  console.log(`🚀 Starting ${serverName} MCP server...`);

  const child = exec(`npx tsx ${serverPath}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Error: ${error.message}`);
      return;
    }
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
  });
  let exited = false;

  // Keep the process alive and handle signals
  child.stdout?.on("data", (data) => {
    process.stdout.write(data);
  });

  child.stderr?.on("data", (data) => {
    process.stderr.write(data);
  });

  child.on("close", (code) => {
    exited = true;
    console.log(`\n💀 Server process exited with code ${code}`);
    process.exit(code || 0);
  });

  void (async () => {
    const port = process.env.PORT || "3000";
    await waitForHealth(port, () => exited);
    await notifyManagerReady(serverId);
    console.log("✅ Manager notified that server is ready");
  })().catch((error) => {
    console.error("❌ Server readiness failed:", error);
    child.kill("SIGTERM");
    process.exit(1);
  });

  // Handle Ctrl+C gracefully
  process.on("SIGINT", () => {
    console.log("\n🛑 Shutting down server...");
    child.kill("SIGINT");
  });
});

program.parse();
