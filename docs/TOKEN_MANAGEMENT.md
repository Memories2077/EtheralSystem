# Token Management - Quick Reference

## Vấn đề

- LLM hiện tại: **128k tokens** context limit
- Prompt lớn có thể vượt quá giới hạn này khi:
  - OpenAPI spec có nhiều endpoints (>50)
  - Examples files lớn (JSONPlaceHolder_MCPServer.ts ~50k tokens)
  - API có schemas phức tạp

## Giải pháp đã implement

### ✅ Token Counting & Monitoring

- File: `src/utils/token-counter.ts`
- Tính toán token count cho mỗi message
- Cảnh báo khi context gần đạt giới hạn

### ✅ Automatic Truncation

- Tự động truncate examples nếu context quá lớn
- Ưu tiên giữ system instructions
- Truncate OUTPUT_EXAMPLE trước (thường lớn nhất)
- Sau đó truncate INPUT_EXAMPLE nếu cần

### ✅ Warning Levels

| Level    | Usage  | Action              |
| -------- | ------ | ------------------- |
| Safe     | <70%   | No action           |
| Warning  | 70-85% | Log warning         |
| Danger   | 85-95% | Auto truncate       |
| Critical | >95%   | Aggressive truncate |

## Logs mới thêm vào

Khi generate, bạn sẽ thấy:

```
📊 Context size: 45.2k tokens (safe)
🤖 Sending request to LLM: 45.2k tokens
✅ Received response: 12.3k tokens
```

Nếu context quá lớn:

```
📊 Context size: 135.7k tokens (critical)
⚠️ Large context detected, applying truncation to fit within limits...
   📝 Truncated OUTPUT EXAMPLE: 52,341 → 15,000 tokens
   📝 Truncated INPUT EXAMPLE: 12,543 → 8,000 tokens
🤖 Sending request to LLM: 118.5k tokens
✅ Received response: 15.2k tokens
```

## Token Estimation

Công thức ước tính: **1 token ≈ 4 characters**

Ví dụ:

- 4,000 characters ≈ 1,000 tokens
- 400,000 characters ≈ 100,000 tokens
- 1MB text file ≈ 250,000 tokens

## Configuration

Trong `prompt.ts`, có thể điều chỉnh:

```typescript
// Max tokens cho input (reserve 8k for response)
truncateMessages(messages, 120000);

// Preserve ratio khi truncate (60% đầu, 40% cuối)
truncateToTokenLimit(text, maxTokens, 0.6);
```

## Best Practices

1. **Giữ examples nhỏ gọn**: Chỉ include patterns cần thiết
2. **Remove redundant instructions**: Loại bỏ phần trùng lặp
3. **Use references**: Thay vì copy toàn bộ, reference đến patterns
4. **Monitor logs**: Chú ý warnings về context size

## Nâng cấp trong tương lai

### Option 1: Sử dụng LLM có context lớn hơn

```typescript
// Claude 3.5 Sonnet: 200k tokens
// Gemini 1.5 Pro: 2M tokens
export const llmConfig = {
  model: "claude-3-5-sonnet-20241022",
  maxTokens: 200000,
};
```

### Option 2: Chunking Strategy

```typescript
// Chia OpenAPI spec thành nhiều chunks
// Generate từng phần, sau đó merge lại
const chunks = chunkOpenAPISpec(spec, 10); // 10 endpoints per chunk
for (const chunk of chunks) {
  await generateMCPChunk(chunk);
}
```

### Option 3: RAG Implementation

```typescript
// Chỉ load examples liên quan
// Sử dụng vector search để tìm similar patterns
const relevantExamples = await findSimilarExamples(endpoint);
```

## Troubleshooting

### Lỗi: "context length exceeded"

1. Kiểm tra logs để xem token count
2. Thử reduce kích thước examples
3. Xem xét nâng cấp sang LLM có context lớn hơn

### Truncation làm mất thông tin quan trọng

1. Adjust `preserveStart` ratio (mặc định 0.6)
2. Implement custom truncation logic cho patterns quan trọng
3. Split generation thành multiple calls

### Performance chậm

1. Token counting là overhead nhỏ (~1ms per message)
2. Truncation chỉ chạy khi cần
3. Nếu vẫn chậm, disable truncation và handle manually

## Files liên quan

- `src/utils/token-counter.ts` - Core token counting utilities
- `src/generator/prompt.ts` - Integrated truncation logic
- `src/utils/genai.ts` - LLM call with logging
- `docs/CONTEXT_SIZE_ANALYSIS.md` - Detailed analysis
