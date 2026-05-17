FROM oven/bun:1.3.14-alpine AS builder

WORKDIR /repo

ARG NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL

COPY package.json bun.lock turbo.json ./
COPY apps/chatbot_mcp_client/package.json apps/chatbot_mcp_client/package.json
COPY apps/mcp-gen/package.json apps/mcp-gen/package.json
COPY apps/langChain-application/package.json apps/langChain-application/package.json

RUN bun install --frozen-lockfile

COPY apps/chatbot_mcp_client apps/chatbot_mcp_client

WORKDIR /repo/apps/chatbot_mcp_client
RUN bun run build

FROM oven/bun:1.3.14-alpine

WORKDIR /repo

COPY package.json bun.lock turbo.json ./
COPY apps/chatbot_mcp_client/package.json apps/chatbot_mcp_client/package.json
COPY apps/mcp-gen/package.json apps/mcp-gen/package.json
COPY apps/langChain-application/package.json apps/langChain-application/package.json

RUN bun install --frozen-lockfile --production

COPY --from=builder /repo/apps/chatbot_mcp_client/.next apps/chatbot_mcp_client/.next
COPY --from=builder /repo/apps/chatbot_mcp_client/public apps/chatbot_mcp_client/public
COPY --from=builder /repo/apps/chatbot_mcp_client/next.config.ts apps/chatbot_mcp_client/next.config.ts
COPY --from=builder /repo/apps/chatbot_mcp_client/entrypoint.sh apps/chatbot_mcp_client/entrypoint.sh

WORKDIR /repo/apps/chatbot_mcp_client

EXPOSE 9002

ENTRYPOINT ["sh", "entrypoint.sh"]
