import { generateMCP, GenerationResult } from "../src/generator/index.ts";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { ExecException } from "child_process";

const execAsync = promisify(exec);

// Lấy đường dẫn hiện tại
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Options {
  apiInputPath?: string;
  outputDir?: string;
}

export async function main(options: Options = {}) {
  try {
    console.log("🚀 Starting MCP server generation test...");

    // Sử dụng SERVER_ID từ environment variable để tìm file input chính xác
    const serverId = process.env.SERVER_ID?.toString();
    const inputDir = path.join(__dirname, "..", "input");
    let apiInputPath = options.apiInputPath;

    if (!apiInputPath) {
      if (serverId) {
        // Tìm file cụ thể với SERVER_ID với các extension khác nhau
        const extensions = [".txt", ".json", ".yaml"];
        let specificFile = "";
        let specificPath = "";
        for (const ext of extensions) {
          const file = `api-input-${serverId}${ext}`;
          const filePath = path.join(inputDir, file);
          if (fs.existsSync(filePath)) {
            specificFile = file;
            specificPath = filePath;
            break;
          }
        }

        if (fs.existsSync(specificPath)) {
          apiInputPath = specificPath;
          console.log(
            `📎 Found input file for server ${serverId}: ${specificFile}`,
          );
        } else {
          console.error(`❌ Specific input file not found: ${specificFile}`);
          console.log(`📁 Checking directory contents: ${inputDir}`);
          try {
            const files = fs.readdirSync(inputDir);
            console.log(`📄 Available files: ${files.join(", ")}`);
          } catch (e) {
            console.log(`❌ Cannot read directory: ${e}`);
          }
          process.exit(1);
        }
      } else {
        console.log("⚠️ SERVER_ID not SET");
        process.exit(1);
      }
    }

    const outputDir_yaml = path.join(__dirname, "..", "src-generated-yaml");
    const outputDir_ts = path.join(__dirname, "..", "src-generated-ts");

    console.log(`📖 API input path: ${apiInputPath}`);
    console.log(`📁 Output directory for OpenAPI Spec: ${outputDir_yaml}`);
    console.log(
      `📁 Output directory for MCP Server TypeScript file: ${outputDir_ts}`,
    );

    // Đường dẫn đến file OpenAPI spec
    const specPath = path.join(outputDir_yaml, `${serverId}.yaml`);
    console.log("📍 Using OpenAPI spec:", specPath);

    // Đường dẫn đến file structure
    const structurePath = path.join(
      __dirname,
      "specs",
      "OpenAPI_to_MCPServer_structure.ts",
    );
    console.log(
      "📖 Referring the structure converts OpenAPI spec to MCP Server",
    );

    // Đường dẫn đến input example
    const input_example = path.join(__dirname, "specs", "Reddit.yaml");
    console.log("🔥 Referring the input example");

    // Đường dẫn đến output example
    const output_example = path.join(__dirname, "specs", "Reddit_MCPServer.ts");
    console.log("❄️ Referring the output example");

    // Gọi hàm generate
    console.log("🤖 Calling LLM to generate MCP server...");

    const MAX_RETRIES = 5;
    let retryCount = 0;
    let result: GenerationResult | null = null;
    let lastError: Error | null = null;

    while (retryCount < MAX_RETRIES) {
      try {
        result = await generateMCP(
          specPath,
          structurePath,
          input_example,
          output_example,
          outputDir_ts,
          serverId,
          retryCount,
          lastError?.message,
          process.env.RAG_CONTEXT,
          process.env.BUILD_REQUEST_ID || serverId,
        );

        // Test if generated server can run
        const tsFilePath = path.join(outputDir_ts, `${serverId}.ts`);
        console.log(
          `\n🧪 Testing generated MCP server (Attempt ${retryCount + 1})...`,
        );

        // Type definition for execAsync error
        type ExecError = ExecException & { stdout: string; stderr: string };

        try {
          // Try to run the generated TypeScript file with Bun
          const testResult = await execAsync(`bun ${tsFilePath}`, {
            timeout: 10000, // 10 seconds timeout
          });

          console.log(`✅ MCP server test passed!`);
          console.log(
            `📊 Total LLM calls for this generation: ${result?.llmCallCount}`,
          );
          console.log(`📊 Total retry attempts: ${retryCount + 1}`);
          break; // Success, exit retry loop
        } catch (error: unknown) {
          const execError = error as ExecError;

          const stderr = execError.stderr ? execError.stderr.trim() : "";
          const stdout = execError.stdout ? execError.stdout.trim() : "";
          const isTimeout = execError.killed;

          // Servers run indefinitely. Timeout without stderr = Success
          if (isTimeout && !stderr) {
            console.log(
              `✅ MCP server is running stably (auto-killed after 10s).`,
            );
            console.log(`With stdout: ${stdout}`);
            console.log(
              `📊 Total LLM calls for this generation: ${result.llmCallCount}`,
            );
            console.log(`📊 Total retry attempts: ${retryCount + 1}`);
            break; // Success, exit retry loop
          }

          // Actual failure (Crash, Syntax Error, etc.)
          const errorMsg = stderr || execError.message || String(error);
          console.error(`❌ Generated MCP server failed to run:\n${errorMsg}`);

          // Retry logic
          if (retryCount < MAX_RETRIES - 1) {
            console.log(
              `🔄 Retrying generation (${retryCount + 2}/${MAX_RETRIES})...`,
            );
            retryCount++;
            lastError = new Error(errorMsg);
          } else {
            throw new Error(
              `Failed to generate working MCP server after ${MAX_RETRIES} attempts. Last error: ${errorMsg}`,
            );
          }
        }
      } catch (genError) {
        const errorMsg =
          genError instanceof Error ? genError.message : String(genError);
        console.error(
          `❌ Generation attempt ${retryCount + 1} failed: ${errorMsg}`,
        );

        if (retryCount < MAX_RETRIES - 1) {
          console.log(
            `🔄 Retrying generation (${retryCount + 2}/${MAX_RETRIES})...`,
          );
          retryCount++;
          lastError =
            genError instanceof Error ? genError : new Error(errorMsg);
        } else {
          throw new Error(
            `Failed to generate MCP server after ${MAX_RETRIES} attempts. Last error: ${errorMsg}`,
          );
        }
      }
    }

    if (!result) {
      throw new Error(
        `Failed to generate MCP server after ${MAX_RETRIES} attempts. Last error: ${lastError?.message}`,
      );
    }

    console.log("✅ Generation completed!");
    console.log(
      "📄 Generated file:",
      path.join(outputDir_ts, `${serverId}.ts`),
    );

    if (result && result.code) {
      console.log("📊 Generated code preview:");
      console.log("─".repeat(50));
      console.log(result.code.substring(0, 500) + "...");
      console.log("─".repeat(50));
    } else {
      console.log("No code generated due to invalid spec.");
    }
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
