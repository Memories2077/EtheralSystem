# Context Size Analysis - LLM Token Limit

## Vấn đề hiện tại

LLM đang sử dụng có giới hạn **128k tokens** context window. Cần phân tích xem prompt gửi đến LLM có thể vượt quá giới hạn này không.

## Cấu trúc Prompt hiện tại

### 1. Generate OpenAPI Spec (`buildOpenAPIPromptWithExamples`)

**Input context gồm:**

```
├── System Instruction (SYSTEM_INSTRUCTION_For_Generating_OPENAPISpec)
│   ├── Instruction text: ~3,000 tokens
│   ├── INPUT_FORMAT examples: ~800 tokens
│   ├── Patterns & rules: ~2,000 tokens
│   └── Total: ~5,800 tokens
│
├── User Message
│   ├── INPUT_EXAMPLE (api endpoints): Variable (50-5,000 tokens)
│   ├── OUTPUT_EXAMPLE (OpenAPI YAML): ~2,000-15,000 tokens
│   ├── API Endpoints (user input): Variable (100-50,000 tokens)
│   └── Instructions: ~500 tokens
│
└── TOTAL: ~8,450 + Variable content (150-70,000 tokens)
```

**Ước tính:** 8k-70k tokens (có thể vượt 128k với API lớn)

---

### 2. Generate MCP Server TS (`buildPromptWithExamples`)

**Input context gồm:**

```
├── System Instruction (SYSTEM_INSTRUCTION_For_Generating_MCPServer)
│   ├── Core instructions: ~1,500 tokens
│   ├── OPENAPI_TO_ZOD_MAPPING: ~1,200 tokens
│   ├── FLEXIBLE_BODY_PATTERNS: ~600 tokens
│   ├── DYNAMIC_SCHEMA_INSTRUCTION: ~400 tokens
│   ├── CONTENT_TYPE_PATTERNS: ~500 tokens
│   ├── Tool registration patterns: ~1,500 tokens
│   ├── Main function pattern: ~2,000 tokens
│   └── Total: ~7,700 tokens
│
├── User Message
│   ├── Reference Structure: ~1,500 tokens
│   ├── INPUT_EXAMPLE (YAML OpenAPI Spec): ~2,000-15,000 tokens
│   ├── OUTPUT_EXAMPLE (MCP Server TS): ~5,000-50,000 tokens
│   ├── OpenAPI Spec (actual to convert): Variable (1,000-50,000 tokens)
│   └── Instructions: ~800 tokens
│
└── TOTAL: ~18,000 + Variable content (8,000-115,000 tokens)
```

**Ước tính:** 26k-133k tokens ⚠️ **CÓ THỂ VƯỢT QUÁ 128k**

---

## Phân tích rủi ro

### Trường hợp vượt quá giới hạn:

1. **OpenAPI spec quá lớn** (nhiều endpoints, schemas phức tạp)
2. **Example files quá lớn** (JSONPlaceHolder_MCPServer.ts ~50k tokens)
3. **Reference structure dài** (OpenAPI_to_MCPServer_structure.ts)
4. **System instructions dài** (~7,700 tokens)

### Tổng hợp:

```
System: 7,700 tokens
Example Input: 15,000 tokens (worst case)
Example Output: 50,000 tokens (worst case)
Actual OpenAPI: 50,000 tokens (worst case)
Instructions: 2,000 tokens
─────────────────────────────
TOTAL: 124,700 tokens ⚠️ GẦN ĐẠT GIỚI HẠN
```

Với một số API phức tạp hơn, **có thể vượt quá 128k tokens**.

---

## Giải pháp đề xuất

### ✅ Solution 1: Token Counting & Truncation (Khuyến nghị)

```typescript
import { encoding_for_model } from "tiktoken";

function estimateTokens(text: string): number {
  // Rough estimation: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

function truncateIfNeeded(
  messages: ChatMessage[],
  maxTokens: number = 120000
): ChatMessage[] {
  const totalTokens = messages.reduce(
    (sum, msg) => sum + estimateTokens(msg.content),
    0
  );

  if (totalTokens <= maxTokens) {
    return messages;
  }

  console.warn(
    `⚠️ Context too large (${totalTokens} tokens). Truncating examples...`
  );

  // Strategy: Reduce example sizes first
  // Keep system instruction intact
  // Truncate output example more aggressively

  return messages.map((msg, idx) => {
    if (idx === 0) return msg; // Keep system instruction

    // For user message, truncate examples
    if (msg.content.includes("OUTPUT EXAMPLE")) {
      const parts = msg.content.split("OUTPUT EXAMPLE");
      const outputExample = parts[1].split("NOW GENERATE FOR THIS")[0];

      // Truncate to 20k tokens max (~80k chars)
      const truncatedOutput =
        outputExample.substring(0, 80000) +
        "\n... (truncated for context size)\n";

      return {
        ...msg,
        content:
          parts[0] +
          "OUTPUT EXAMPLE" +
          truncatedOutput +
          "NOW GENERATE FOR THIS" +
          parts[1].split("NOW GENERATE FOR THIS")[1],
      };
    }

    return msg;
  });
}
```

### ✅ Solution 2: Chunking Strategy (Cho API rất lớn)

```typescript
interface EndpointChunk {
  paths: Record<string, any>;
  schemas: Record<string, any>;
}

function chunkOpenAPISpec(
  spec: any,
  maxEndpointsPerChunk: number = 10
): EndpointChunk[] {
  const chunks: EndpointChunk[] = [];
  const paths = Object.entries(spec.paths);

  for (let i = 0; i < paths.length; i += maxEndpointsPerChunk) {
    const chunkPaths = Object.fromEntries(
      paths.slice(i, i + maxEndpointsPerChunk)
    );

    // Extract only relevant schemas for this chunk
    const relevantSchemas = extractRelevantSchemas(
      chunkPaths,
      spec.components.schemas
    );

    chunks.push({
      paths: chunkPaths,
      schemas: relevantSchemas,
    });
  }

  return chunks;
}

async function generateMCPInChunks(spec: any, ...args): Promise<string> {
  const chunks = chunkOpenAPISpec(spec);
  const generatedParts: string[] = [];

  for (const chunk of chunks) {
    const partialSpec = {
      ...spec,
      paths: chunk.paths,
      components: { schemas: chunk.schemas },
    };

    const code = await generateMCP(partialSpec, ...args);
    generatedParts.push(extractToolRegistrations(code));
  }

  // Merge all parts into one complete MCP server
  return mergeGeneratedCode(generatedParts);
}
```

### ✅ Solution 3: Summarize Examples (Giảm kích thước example)

```typescript
function summarizeExample(
  fullExample: string,
  maxLength: number = 50000
): string {
  if (fullExample.length <= maxLength) {
    return fullExample;
  }

  // Keep imports, server initialization, first 2 tools, and main function
  const sections = {
    imports: extractSection(fullExample, /^import.*$/gm),
    serverInit: extractSection(fullExample, /const server = new McpServer/),
    firstTools: extractFirstNTools(fullExample, 2),
    mainFunction: extractSection(fullExample, /async function main\(\)/),
  };

  return `
${sections.imports}

${sections.serverInit}

// Example tool registrations (2 shown, pattern repeats for all endpoints):
${sections.firstTools}

// ... (additional tool registrations follow the same pattern)

${sections.mainFunction}
  `.trim();
}
```

### ✅ Solution 4: Switch to Claude 3.5 Sonnet (200k context)

```typescript
// In config.ts or genai.ts
export const llmConfig = {
  provider: "anthropic", // or "ollama"
  model: "claude-3-5-sonnet-20241022", // 200k context
  // OR
  model: "gemini-1.5-pro", // 2M context
  maxTokens: 200000,
};
```

---

## Khuyến nghị triển khai

### Ngắn hạn (Immediate):

1. ✅ Thêm token counting vào `prompt.ts`
2. ✅ Truncate example outputs nếu quá lớn
3. ✅ Log cảnh báo khi context gần đạt giới hạn

### Trung hạn (Next sprint):

4. ✅ Implement chunking strategy cho API lớn (>50 endpoints)
5. ✅ Tối ưu hóa system instructions (loại bỏ redundancy)
6. ✅ Cache examples để tái sử dụng

### Dài hạn (Future):

7. ✅ Switch sang LLM có context lớn hơn (Claude 3.5 Sonnet - 200k, Gemini 1.5 Pro - 2M)
8. ✅ Implement RAG (Retrieval-Augmented Generation) cho example retrieval
9. ✅ Fine-tune smaller model cho specific task này

---

## Implementation Priority

| Priority | Solution                      | Effort    | Impact    |
| -------- | ----------------------------- | --------- | --------- |
| 🔥 P0    | Add token counting & warnings | Low       | High      |
| 🔥 P0    | Truncate examples if needed   | Low       | High      |
| ⚡ P1    | Optimize system instructions  | Medium    | Medium    |
| ⚡ P1    | Chunking for large APIs       | High      | High      |
| 📅 P2    | Switch to larger context LLM  | Low       | Very High |
| 📅 P3    | RAG implementation            | Very High | Medium    |
