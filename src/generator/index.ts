// src/generator/index.ts - Fixed version
import {
  buildOpenAPIPromptWithExamples,
  buildPromptWithExamples,
} from "./prompt.ts";
import { genaiCompletion } from "../utils/genai.ts";
import { readFile, writeFileSafe, remove, exists } from "../utils/fs.ts";
import { confirm } from "./validator.ts";
import path from "path";
import { fileURLToPath } from "url";

// Lấy đường dẫn hiện tại
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const api_input_example = path.join(
  __dirname,
  "..",
  "..",
  "test",
  "generate_openapi",
  "input_example.ts",
);

const openapi_spec_output_example = path.join(
  __dirname,
  "..",
  "..",
  "test",
  "generate_openapi",
  "output_example.yaml",
);

const openapi_spec_output_example_reddit = path.join(
  __dirname,
  "..",
  "..",
  "test",
  "generate_openapi",
  "output_example_reddit.yaml",
);

const openapi_spec_output_example_twilio = path.join(
  __dirname,
  "..",
  "..",
  "test",
  "generate_openapi",
  "output_example_twilio.yaml",
);

const outputDir_yaml = path.join(__dirname, "..", "..", "src-generated-yaml");

export interface GenerationResult {
  code: string;
  llmCallCount: number;
}

export async function generateOpenAPISpec(
  input: string,
  name: string,
  retryCount: number = 0,
) {
  try {
    console.log("📖 Reading Input...");
    const read_input = await readFile(input);

    console.log("📖⬅️ Reading Input Examples...");
    const input_Example = await readFile(api_input_example);

    console.log("📖➡️ Reading Output Examples...");
    const output_Example = await readFile(openapi_spec_output_example);

    // Read additional examples for Reddit and Twilio
    let output_Example_Reddit = "";
    let output_Example_Twilio = "";

    try {
      output_Example_Reddit = await readFile(
        openapi_spec_output_example_reddit,
      );
      console.log("📖✅ Reddit example loaded");
    } catch (error) {
      console.log("📖⚠️ Reddit example not found, skipping...");
    }

    try {
      output_Example_Twilio = await readFile(
        openapi_spec_output_example_twilio,
      );
      console.log("📖✅ Twilio example loaded");
    } catch (error) {
      console.log("📖⚠️ Twilio example not found, skipping...");
    }

    const messages = buildOpenAPIPromptWithExamples(
      read_input,
      input_Example,
      output_Example,
      output_Example_Reddit,
      output_Example_Twilio,
    );

    console.log(
      `🤖 Calling LLM to generate OpenAPI spec (Attempt ${retryCount + 1})...`,
    );
    const aiCode = await genaiCompletion({
      messages,
    });

    console.log("🔧 Stitching code together...");
    // Strip markdown code blocks if present (```yaml ... ``` or ```...```)
    let fullCode = aiCode.trim();

    // 🚨 CRITICAL: Remove ALL markdown formatting BEFORE other processing
    // Step 1: Remove markdown headers (# Title, ## Subtitle, etc.)
    if (/^#{1,6}\s+/m.test(fullCode)) {
      console.log("⚠️ Detected markdown headers, removing...");
      fullCode = fullCode
        .split("\n")
        .filter((line) => !line.match(/^#{1,6}\s+/))
        .join("\n")
        .trim();
    }

    // Step 2: Remove markdown code blocks more aggressively
    // Handle various formats: ```yaml, ```yml, ```, etc.
    if (fullCode.includes("```")) {
      console.log("⚠️ Detected markdown code block wrapper, removing...");

      // Try to extract content between ```yaml and ``` or between ``` and ```
      const codeBlockMatch = fullCode.match(
        /```(?:yaml|yml)?\s*\n([\s\S]*?)\n```/,
      );
      if (codeBlockMatch && codeBlockMatch[1]) {
        fullCode = codeBlockMatch[1].trim();
        console.log(
          `✅ Extracted from code blocks, length: ${fullCode.length} chars`,
        );
      } else {
        // Fallback: remove all lines with ```
        fullCode = fullCode
          .split("\n")
          .filter((line) => !line.trim().startsWith("```"))
          .join("\n")
          .trim();
        console.log(
          `✅ Removed code block markers, length: ${fullCode.length} chars`,
        );
      }
    }

    // Step 3: Double-check with regex-based removal
    if (fullCode.startsWith("```") || fullCode.includes("```")) {
      console.warn("⚠️ Code blocks still present, using aggressive removal...");
      fullCode = fullCode.replace(/^```[a-z]*\n/gim, "");
      fullCode = fullCode.replace(/\n```\s*$/gim, "");
      fullCode = fullCode.replace(/```/g, "");
      fullCode = fullCode.trim();
    }

    // 🚨 CRITICAL: Detect template syntax (Jinja2, Handlebars, etc.)
    const templatePatterns = [
      /\{%-?\s*(for|if|set|endif|endfor)/gi, // Jinja2: {%- for, {%- if, etc.
      /\{\{-?\s*[a-z_]+/gi, // Jinja2/Handlebars: {{- variable, {{ bos_token
      /<%[=\-]?\s*/gi, // EJS: <%, <%=, <%-
      /\{%\s*(for|if)/gi, // Liquid: {% for, {% if
    ];

    for (const pattern of templatePatterns) {
      if (pattern.test(fullCode)) {
        console.error("❌ Detected template syntax in output!");
        console.error("   The model returned template code instead of YAML.");
        console.error("   This is likely a model configuration issue.");
        console.error(`   Pattern matched: ${pattern}`);
        console.error(`   First 200 chars: ${fullCode.substring(0, 200)}...`);
        throw new Error(
          "Model output contains template syntax (Jinja2/Handlebars/etc.) instead of pure YAML. " +
            "This indicates the model is confused about the output format. " +
            "Please check the model configuration or try a different model.",
        );
      }
    }

    // 🚨 CRITICAL: Detect duplicate OpenAPI declarations (model copied examples)
    const openapiMatches = fullCode.match(/^openapi:\s*3\./gm);
    if (openapiMatches && openapiMatches.length > 1) {
      console.error("❌ Detected multiple OpenAPI declarations in output!");
      console.error(
        `   Found ${openapiMatches.length} 'openapi:' declarations - expected only 1`,
      );
      console.error(
        "   The model copied example specs instead of generating a single spec.",
      );
      console.error(`   First 500 chars: ${fullCode.substring(0, 500)}...`);
      throw new Error(
        `Model output contains multiple OpenAPI specs (${openapiMatches.length} declarations found). ` +
          "The model copied example specs instead of generating a single new spec. " +
          "This is a prompt adherence issue. Please retry.",
      );
    }

    // 🚨 CRITICAL: Check for markdown headers that indicate improper formatting
    if (/^#{1,6}\s+/m.test(fullCode)) {
      console.error("❌ Detected markdown headers in output!");
      console.error(
        "   The model returned markdown-formatted content instead of pure YAML.",
      );
      console.error(`   First 300 chars: ${fullCode.substring(0, 300)}...`);
      throw new Error(
        "Model output contains markdown headers (# Title, ## Subtitle, etc.). " +
          "The output must be pure YAML without any markdown formatting. " +
          "This is a prompt adherence issue. Please retry.",
      );
    }

    // 🚨 CRITICAL: Validate content before writing
    if (!fullCode || fullCode.length < 50) {
      console.error("❌ Generated content is too short or empty!");
      console.error(`   Content length: ${fullCode.length} bytes`);
      console.error(`   Content: "${fullCode}"`);
      throw new Error(
        `Invalid generated content: too short (${fullCode.length} bytes). ` +
          "Model may have failed to generate proper YAML. " +
          "Original response length: " +
          aiCode.length +
          " bytes",
      );
    }

    // Validate it starts with openapi:
    if (!fullCode.startsWith("openapi:")) {
      console.error("❌ Generated content does not start with 'openapi:'!");
      console.error(`   First 200 chars: ${fullCode.substring(0, 200)}...`);
      throw new Error(
        "Invalid generated content: does not start with 'openapi:'. " +
          "Model may have included extra text or markdown.",
      );
    }

    // 🚨 CRITICAL: Check for example reference comments
    if (/^#.*HTTPBin|^#.*Reddit|^#.*Twilio/m.test(fullCode)) {
      console.error("❌ Detected example reference comments in output!");
      console.error("   The model included references to example specs.");
      console.error(`   First 300 chars: ${fullCode.substring(0, 300)}...`);
      throw new Error(
        "Model output contains references to example specs (HTTPBin/Reddit/Twilio). " +
          "The model should generate NEW content, not copy examples. " +
          "This is a prompt adherence issue. Please retry.",
      );
    }

    console.log(
      `📝 Cleaned YAML (first 100 chars): ${fullCode.substring(0, 100)}...`,
    );

    console.log("🗑️ Cleaning up existing .yaml files...");
    // Delete the specific YAML file if it exists
    const outputPath = path.join(outputDir_yaml, `${name}.yaml`);
    if (await exists(outputPath)) {
      console.log(`🗑️ Removing existing ${name}.yaml...`);
      await remove(outputPath);
    }

    console.log("💾 Writing to file...");

    // Delete existing YAML file if it exists (in case the randomUUID duplicates)
    if (await exists(outputPath)) {
      console.log("🗑️ Removing existing YAML file...");
      await remove(outputPath);
    }

    await writeFileSafe(outputPath, fullCode);

    console.log(
      `✅ OpenAPI spec generated successfully! (Total LLM calls: ${retryCount + 1})`,
    );
  } catch (error) {
    console.error("❌ Error generating OpenAPI spec:", error);
    throw error;
  }
}

export async function generateMCP(
  specPath: string,
  sample_convert_structure_path: string,
  input_example: string,
  output_example: string,
  outDir: string,
  name: string | undefined,
  retryCount: number = 0,
): Promise<GenerationResult> {
  try {
    console.log("📖 Reading OpenAPI spec...");
    const spec = await readFile(specPath);

    console.log("✅ Validating OpenAPI spec");
    const result = await confirm(specPath);
    if (!result) {
      const errorMsg =
        "❌ Invalid OpenAPI spec. Cannot proceed with MCP server generation.";
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    console.log("✅ OpenAPI spec validation passed!");

    console.log("📖 Reading Convertion Structure spec...");
    const structure = await readFile(sample_convert_structure_path);

    console.log("📖 Reading Input Example...");
    const inputExample = await readFile(input_example);

    console.log("📖 Reading Output Example...");
    const outputExample = await readFile(output_example);

    // Try to read auth example
    let authExample = "";
    try {
      const authExamplePath = path.join(
        __dirname,
        "..",
        "..",
        "test",
        "specs",
        "OpenAPI_Auth_Examples.ts",
      );
      authExample = await readFile(authExamplePath);
      console.log("📖✅ Auth example loaded");
    } catch (error) {
      console.log("📖⚠️ Auth example not found, skipping...");
    }

    const messages = buildPromptWithExamples(
      spec,
      structure,
      inputExample,
      outputExample,
      authExample,
    );

    // Gọi GenAI với messages thay vì prompt đơn giản
    console.log(
      `🤖 Calling LLM to generate MCP server (Attempt ${retryCount + 1})...`,
    );
    const aiCode = await genaiCompletion({
      messages,
    });

    console.log("🔧 Stitching code together...");
    // Strip markdown code blocks if present (```typescript ... ``` or ```...```)
    let fullCode = aiCode.trim();

    // 🚨 CRITICAL: Remove markdown code blocks more aggressively
    // Handle various formats: ```typescript, ```ts, ```, etc.
    if (fullCode.startsWith("```")) {
      console.log("⚠️ Detected markdown code block wrapper, removing...");
      // Remove opening fence (```typescript, ```ts, ```, etc.)
      fullCode = fullCode.replace(/^```[a-z]*\n/i, "");
      // Remove closing fence
      fullCode = fullCode.replace(/\n```\s*$/i, "");
      fullCode = fullCode.trim();
      console.log(`✅ Removed code blocks, length: ${fullCode.length} chars`);
    }

    // Double-check: if still starts with ```, try more aggressive removal
    if (fullCode.startsWith("```")) {
      console.warn("⚠️ Code blocks still present, using aggressive removal...");
      const lines = fullCode.split("\n");
      // Remove first line if it's a code fence
      if (lines[0].startsWith("```")) {
        lines.shift();
      }
      // Remove last line if it's a code fence
      if (lines[lines.length - 1].trim() === "```") {
        lines.pop();
      }
      fullCode = lines.join("\n").trim();
    }

    // 🚨 CRITICAL: Detect template syntax (Jinja2, Handlebars, etc.)
    const templatePatterns = [
      /\{%-?\s*(for|if|set|endif|endfor)/gi, // Jinja2: {%- for, {%- if, etc.
      /\{\{-?\s*[a-z_]+\s*\}\}/gi, // Jinja2/Handlebars: {{- variable }}, {{ bos_token }}
      /<%[=\-]?\s*/gi, // EJS: <%, <%=, <%-
      /\{%\s*(for|if)/gi, // Liquid: {% for, {% if
    ];

    for (const pattern of templatePatterns) {
      if (pattern.test(fullCode)) {
        console.error("❌ Detected template syntax in output!");
        console.error(
          "   The model returned template code instead of TypeScript.",
        );
        console.error("   This is likely a model configuration issue.");
        console.error(`   Pattern matched: ${pattern}`);
        console.error(`   First 200 chars: ${fullCode.substring(0, 200)}...`);
        throw new Error(
          "Model output contains template syntax (Jinja2/Handlebars/etc.) instead of pure TypeScript. " +
            "This indicates the model is confused about the output format. " +
            "Please check the model configuration or try a different model.",
        );
      }
    }

    console.log(
      `📝 Cleaned TypeScript (first 100 chars): ${fullCode.substring(
        0,
        100,
      )}...`,
    );

    console.log("🗑️ Cleaning up existing .ts files...");
    // Delete the specific TS file if it exists
    const outputPath = path.join(outDir, `${name}.ts`);
    if (await exists(outputPath)) {
      console.log(`🗑️ Removing existing ${name}.ts...`);
      await remove(outputPath);
    }

    console.log("💾 Writing to file...");

    // Delete existing TS file if it exists
    if (await exists(outputPath)) {
      console.log("🗑️ Removing existing TS file...");
      await remove(outputPath);
    }

    await writeFileSafe(outputPath, fullCode);

    console.log(
      `✅ MCP server generated successfully! (Total LLM calls: ${retryCount + 1})`,
    );
    return {
      code: fullCode,
      llmCallCount: retryCount + 1,
    };
  } catch (error) {
    console.error("❌ Error generating MCP server:", error);
    throw error;
  }
}
