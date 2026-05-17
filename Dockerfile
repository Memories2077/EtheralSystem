# =============================================================================
# Etheral System - Single Multi-Stage Dockerfile
# All application services built from one file with stage targets.
# Infrastructure services (mongodb, rabbitmq, chromadb, ollama) use base images.
# =============================================================================

# ---------------------------------------------------------------------------
# Stage: bun-deps (shared dependency layer for all Bun/Node services)
# ---------------------------------------------------------------------------
FROM oven/bun:1.3.14-alpine AS bun-deps

WORKDIR /repo

COPY package.json bun.lock turbo.json ./
COPY apps/chatbot_mcp_client/package.json apps/chatbot_mcp_client/package.json
COPY apps/mcp-gen/package.json apps/mcp-gen/package.json
COPY apps/langChain-application/package.json apps/langChain-application/package.json

RUN bun install --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage: builder (build Next.js frontend)
# ---------------------------------------------------------------------------
FROM oven/bun:1.3.14-alpine AS builder

ARG NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL

WORKDIR /repo

COPY --from=bun-deps /repo/node_modules node_modules
COPY package.json bun.lock turbo.json ./
COPY apps/chatbot_mcp_client/package.json apps/chatbot_mcp_client/package.json
COPY apps/mcp-gen/package.json apps/mcp-gen/package.json
COPY apps/langChain-application/package.json apps/langChain-application/package.json
COPY apps/chatbot_mcp_client apps/chatbot_mcp_client

WORKDIR /repo/apps/chatbot_mcp_client
RUN bun run build

# ---------------------------------------------------------------------------
# Stage: chatbot-frontend (Next.js production runtime)
# ---------------------------------------------------------------------------
FROM oven/bun:1.3.14-alpine AS chatbot-frontend

WORKDIR /repo

COPY --from=bun-deps /repo/node_modules node_modules
COPY package.json bun.lock turbo.json ./
COPY apps/chatbot_mcp_client/package.json apps/chatbot_mcp_client/package.json
COPY apps/mcp-gen/package.json apps/mcp-gen/package.json
COPY apps/langChain-application/package.json apps/langChain-application/package.json

RUN bun install --frozen-lockfile --production

COPY --from=builder /repo/apps/chatbot_mcp_client/.next apps/chatbot_mcp_client/.next
COPY --from=builder /repo/apps/chatbot_mcp_client/public apps/chatbot_mcp_client/public
COPY --from=builder /repo/apps/chatbot_mcp_client/next.config.ts apps/chatbot_mcp_client/next.config.ts

WORKDIR /repo/apps/chatbot_mcp_client

EXPOSE 9002

CMD ["bun", "run", "start"]

# ---------------------------------------------------------------------------
# Stage: mcp-build (install deps + copy source for TypeScript compile)
# ---------------------------------------------------------------------------
FROM oven/bun:1.3.14-alpine AS mcp-build

WORKDIR /repo

COPY --from=bun-deps /repo/node_modules node_modules
COPY package.json bun.lock turbo.json ./
COPY apps/chatbot_mcp_client/package.json apps/chatbot_mcp_client/package.json
COPY apps/mcp-gen/package.json apps/mcp-gen/package.json
COPY apps/langChain-application/package.json apps/langChain-application/package.json
COPY apps/mcp-gen apps/mcp-gen

WORKDIR /repo/apps/mcp-gen
RUN bun install --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage: mcp-gen-manager (MCP server manager runtime)
# ---------------------------------------------------------------------------
FROM oven/bun:1.3.14-alpine AS mcp-gen-manager

WORKDIR /repo/apps/mcp-gen

COPY --from=mcp-build /repo/apps/mcp-gen .

EXPOSE 8080

CMD ["bun", "./src/mcp-server-manager.ts"]

# ---------------------------------------------------------------------------
# Stage: mcp-gen-proxy (Dynamic proxy runtime)
# ---------------------------------------------------------------------------
FROM oven/bun:1.3.14-alpine AS mcp-gen-proxy

WORKDIR /repo/apps/mcp-gen

COPY --from=mcp-build /repo/apps/mcp-gen .

EXPOSE 8081

CMD ["bun", "./src/dynamic-proxy.ts"]

# ---------------------------------------------------------------------------
# Stage: chatbot-backend (FastAPI Python runtime)
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS chatbot-backend

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY apps/chatbot_mcp_client/backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/chatbot_mcp_client/backend ./backend

WORKDIR /app/backend

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

# ---------------------------------------------------------------------------
# Stage: agent (LangGraph agent runtime)
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS agent

WORKDIR /app

COPY apps/langChain-application/pyproject.toml .
COPY apps/langChain-application/langgraph.json .

RUN mkdir -p my_agent && pip install --no-cache-dir . langgraph-cli

COPY apps/langChain-application/my_agent ./my_agent

ENV PYTHONUNBUFFERED=1

EXPOSE 2024

CMD ["langgraph", "dev", "--host", "0.0.0.0", "--port", "2024"]
