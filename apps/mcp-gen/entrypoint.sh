#!/bin/sh

echo "🚀 Starting MCP server generation..."

# Chạy quy trình sinh mã
cd /app

echo "🔧 Step 1: Generating MCP server..."
bun run build

# Kiểm tra xem có file được tạo ra không
if [ ! -d "/app/src-generated-ts" ]; then
    echo "❌ Error: src-generated directory not found"
    exit 1
fi

# Kiểm tra xem có file .ts nào được tạo ra không
TS_FILES=$(find /app/src-generated-ts -name "*.ts" | wc -l)
if [ "$TS_FILES" -eq 0 ]; then
    echo "❌ Error: No TypeScript files generated in src-generated-ts directory"
    exit 1
fi

echo "✅ MCP server generated successfully!"
echo "🚀 Step 2: Starting MCP server..."

# Chạy launcher để start MCP server với Bun
bun run start
