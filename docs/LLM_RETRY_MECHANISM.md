# LLM Retry Mechanism & Call Tracking

## Tổng quan

Hệ thống hiện tại đã được nâng cấp để theo dõi và ghi log số lần gọi LLM (Large Language Model) khi tạo MCP server từ file YAML.

## Cơ chế Retry

### 1. Tạo OpenAPI Spec từ Text Input

- **File**: `src/mcp-server-manager.ts`
- **Số lần retry tối đa**: 5
- **Điều kiện retry**: Khi OpenAPI spec không pass validation

```typescript
let retryCount = 0;
const maxRetries = 5;

while (!checking && retryCount < maxRetries) {
  console.log(
    `🔄 Retry attempt ${retryCount + 1} of ${maxRetries} for OpenAPI spec generation`,
  );
  await generateOpenAPISpec(outputPath, serverId, retryCount);
  checking = await confirm(openapi_filepath);
  retryCount++;
}
```

### 2. Tạo MCP Server TypeScript từ OpenAPI Spec

- **File**: `test/test-generation.ts`
- **Số lần retry tối đa**: 3
- **Điều kiện retry**:
  1. Khi generation bị lỗi
  2. Khi file TypeScript được tạo ra không thể chạy (test với `bun`)

```typescript
const MAX_RETRIES = 3;
let retryCount = 0;

while (retryCount < MAX_RETRIES) {
  try {
    result = await generateMCP(..., retryCount);

    // Test if generated server can run
    await execAsync(`bun ${tsFilePath} --help`, { timeout: 10000 });

    console.log(`✅ MCP server test passed!`);
    console.log(`📊 Total LLM calls: ${result.llmCallCount}`);
    console.log(`📊 Total retry attempts: ${retryCount + 1}`);
    break;
  } catch (error) {
    if (retryCount < MAX_RETRIES - 1) {
      console.log(`🔄 Retrying generation (${retryCount + 2}/${MAX_RETRIES})...`);
      retryCount++;
    } else {
      throw error;
    }
  }
}
```

## Tracking LLM Calls

### Interface GenerationResult

```typescript
export interface GenerationResult {
  code: string;
  llmCallCount: number;
}
```

### Logging

Mỗi lần gọi LLM sẽ được log với thông tin:

- Số lần attempt hiện tại
- Tổng số lần gọi LLM khi thành công
- Tổng số lần retry

### Ví dụ Log Output

#### OpenAPI Spec Generation

```
🤖 Calling LLM to generate OpenAPI spec (Attempt 1)...
✅ OpenAPI spec generated successfully! (Total LLM calls: 1)
```

Nếu retry:

```
🔄 Retry attempt 2 of 5 for OpenAPI spec generation
🤖 Calling LLM to generate OpenAPI spec (Attempt 2)...
✅ OpenAPI spec validated successfully after 2 attempts (Total LLM calls: 2)
```

#### MCP Server Generation

```
🤖 Calling LLM to generate MCP server (Attempt 1)...
🧪 Testing generated MCP server (Attempt 1)...
✅ MCP server test passed!
📊 Total LLM calls for this generation: 1
📊 Total retry attempts: 1
```

Nếu retry:

```
🤖 Calling LLM to generate MCP server (Attempt 1)...
🧪 Testing generated MCP server (Attempt 1)...
❌ Generated MCP server failed to run
🔄 Retrying generation (2/3)...
🤖 Calling LLM to generate MCP server (Attempt 2)...
🧪 Testing generated MCP server (Attempt 2)...
✅ MCP server test passed!
📊 Total LLM calls for this generation: 2
📊 Total retry attempts: 2
```

## Lợi ích

1. **Transparency**: Người dùng biết được hệ thống đã gọi LLM bao nhiêu lần
2. **Debugging**: Dễ dàng debug khi có vấn đề về generation
3. **Cost Tracking**: Có thể ước tính chi phí sử dụng LLM
4. **Performance Monitoring**: Theo dõi tỷ lệ thành công/thất bại của generation

## Cấu hình

Có thể điều chỉnh số lần retry tối đa:

- **OpenAPI Spec**: Thay đổi `maxRetries` trong `src/mcp-server-manager.ts` (hiện tại: 5)
- **MCP Server**: Thay đổi `MAX_RETRIES` trong `test/test-generation.ts` (hiện tại: 3)
