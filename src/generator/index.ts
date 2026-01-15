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
  "input_example.ts"
);

const openapi_spec_output_example = path.join(
  __dirname,
  "..",
  "..",
  "test",
  "generate_openapi",
  "output_example.yaml"
);

const outputDir_yaml = path.join(__dirname, "..", "..", "src-generated-yaml");

export async function generateOpenAPISpec(
  input: string,
  //input_example: string,
  //output_example: string,
  //outDir: string,
  name: string
) {
  try {
    console.log("📖 Reading Input...");
    const read_input = await readFile(input);

    console.log("📖⬅️ Reading Input Example...");
    const input_Example = await readFile(api_input_example);

    console.log("📖➡️ Reading Output Example...");
    const output_Example = await readFile(openapi_spec_output_example);

    const messages = buildOpenAPIPromptWithExamples(
      read_input,
      input_Example,
      output_Example
    );

    const aiCode = await genaiCompletion({
      messages,
    });

    console.log("🔧 Stitching code together...");
    // Strip markdown code blocks if present (```yaml ... ``` or ```...```)
    let fullCode = aiCode.trim();

    // Remove opening code fence
    if (fullCode.startsWith("```")) {
      const firstNewline = fullCode.indexOf("\n");
      if (firstNewline !== -1) {
        fullCode = fullCode.substring(firstNewline + 1);
      }
    }

    // Remove closing code fence
    if (fullCode.endsWith("```")) {
      fullCode = fullCode.substring(0, fullCode.lastIndexOf("```")).trim();
    }

    console.log(
      `📝 Cleaned YAML (first 100 chars): ${fullCode.substring(0, 100)}...`
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

    console.log("✅ OpenAPI spec generated successfully!");
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
  name: string | undefined
) {
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

    const messages = buildPromptWithExamples(
      spec,
      structure,
      inputExample,
      outputExample
    );

    // Gọi GenAI với messages thay vì prompt đơn giản
    const aiCode = await genaiCompletion({
      messages,
    });

    console.log("🔧 Stitching code together...");
    // Strip markdown code blocks if present (```typescript ... ``` or ```...```)
    let fullCode = aiCode.trim();

    // Remove opening code fence
    if (fullCode.startsWith("```")) {
      const firstNewline = fullCode.indexOf("\n");
      if (firstNewline !== -1) {
        fullCode = fullCode.substring(firstNewline + 1);
      }
    }

    // Remove closing code fence
    if (fullCode.endsWith("```")) {
      fullCode = fullCode.substring(0, fullCode.lastIndexOf("```")).trim();
    }

    console.log(
      `📝 Cleaned TypeScript (first 100 chars): ${fullCode.substring(
        0,
        100
      )}...`
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

    console.log("✅ MCP server generated successfully!");
    return fullCode;
  } catch (error) {
    console.error("❌ Error generating MCP server:", error);
    throw error;
  }
}
