#!/usr/bin/env node
import { Command } from "commander";
import path from "path";
import fs from "fs";
import { exec } from "child_process";

const program = new Command();
const serverId = process.env.SERVER_ID;

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

  // Keep the process alive and handle signals
  child.stdout?.on("data", (data) => {
    process.stdout.write(data);
  });

  child.stderr?.on("data", (data) => {
    process.stderr.write(data);
  });

  child.on("close", (code) => {
    console.log(`\n💀 Server process exited with code ${code}`);
    process.exit(code || 0);
  });

  // Handle Ctrl+C gracefully
  process.on("SIGINT", () => {
    console.log("\n🛑 Shutting down server...");
    child.kill("SIGINT");
  });
});

program.parse();
