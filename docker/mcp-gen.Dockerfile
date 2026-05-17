FROM oven/bun:1.3.14-alpine

WORKDIR /repo

COPY package.json bun.lock turbo.json ./
COPY apps/chatbot_mcp_client/package.json apps/chatbot_mcp_client/package.json
COPY apps/mcp-gen/package.json apps/mcp-gen/package.json
COPY apps/langChain-application/package.json apps/langChain-application/package.json

RUN bun install --frozen-lockfile

COPY apps/mcp-gen apps/mcp-gen

WORKDIR /repo/apps/mcp-gen

CMD ["bun", "./src/mcp-server-manager.ts"]
