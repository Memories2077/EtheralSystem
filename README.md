# Etheral System

Etheral System is a full-stack chatbot and MCP (Model Context Protocol) platform. It combines a Next.js chat interface, a FastAPI orchestration backend, a LangGraph agent, and a TypeScript service that can generate and proxy MCP servers from API definitions.

The repository is organized as a Bun/Turborepo monorepo and can be run locally through Docker Compose or as individual development services.

## What It Includes

| Area | Purpose |
| --- | --- |
| Chat interface | Next.js 15 and React 19 application for starting and managing chat sessions. |
| Orchestration API | FastAPI service that streams chat responses, connects to MCP servers, and coordinates LLM providers. |
| MCP generation | TypeScript/Bun service for creating, listing, and proxying generated MCP servers. |
| Agent runtime | LangGraph and LangChain application with access to vector storage and local model runtime support. |
| Infrastructure | MongoDB, RabbitMQ, ChromaDB, and Ollama provided through Docker Compose. |

## Architecture

```text
Browser
  |
  v
Chatbot Frontend (Next.js, port 9002)
  |
  v
Chatbot Backend (FastAPI, port 8000)
  |
  +--> LangGraph Agent (port 2024)
  |      +--> ChromaDB (port 8025)
  |      +--> Ollama (port 11434)
  |
  +--> MCP Manager (port 8080)
         +--> MCP Proxy (port 8081)
         +--> MongoDB (port 27017)
         +--> RabbitMQ (ports 5672 and 15672)
```

## Services

| Service | Default port | Description |
| --- | ---: | --- |
| Chatbot Frontend | 9002 | Next.js chat UI. |
| Chatbot Backend | 8000 | FastAPI API for chat, MCP metadata, feedback, and health checks. |
| MCP Manager | 8080 | Generates and manages MCP servers. |
| MCP Proxy | 8081 | Routes requests to generated MCP servers. |
| LangGraph Agent | 2024 | Agent runtime for LangGraph workflows. |
| MongoDB | 27017 | Persistent storage. |
| RabbitMQ | 5672, 15672 | Queue and management dashboard. |
| ChromaDB | 8025 | Vector database. |
| Ollama | 11434 | Local model runtime. |

## Prerequisites

- Docker Engine and Docker Compose for the full stack.
- Bun for local monorepo development.
- Python 3.12 for backend and LangGraph development outside Docker.
- At least one configured LLM provider key: Gemini, Groq, OpenAI, or Anthropic.

## Quick Start

1. Create a local environment file:

   ```bash
   cp .env.example .env
   ```

2. Add the provider credentials and any deployment-specific values to `.env`.

3. Start the stack:

   ```bash
   docker compose up --build -d
   ```

4. Open the application:

   | Target | URL |
   | --- | --- |
   | Chat UI | http://localhost:9002 |
   | Backend health check | http://localhost:8000/health |
   | RabbitMQ dashboard | http://localhost:15672 |

The first Docker build can take several minutes while dependencies are installed. Later runs should reuse cached layers unless dependencies or Dockerfile stages change.

## Environment Configuration

Start from `.env.example` and configure only the values needed for your runtime.

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | One required | LLM provider credentials used by the backend. |
| `NEXT_PUBLIC_BACKEND_URL` | Recommended | Public URL used by the frontend to reach the FastAPI backend. |
| `MONGO_URI` / `MONGODB_URL` | Docker default provided | MongoDB connection string. |
| `RABBITMQ_URL` | Docker default provided | RabbitMQ connection string. |
| `LANGGRAPH_API_URL` | Docker default provided | LangGraph agent endpoint. |
| `MCP_GEN_URL`, `MCP_BASE_URL`, `MCP_MANAGER_URL` | Docker default provided | MCP manager and proxy endpoints. |
| `METACLAW_API_KEY`, `METACLAW_BASE_URL` | Optional | Enables MetaClaw integration when configured. |

## Development

Install dependencies from the repository root:

```bash
bun install
```

Run the full monorepo in development mode:

```bash
bun run dev
```

Run common checks:

```bash
bun run build
bun run typecheck
bun run test
```

Run individual services:

```bash
bun run dev:backend   # FastAPI backend
bun run manager       # MCP manager
bun run proxy         # MCP proxy
```

## Docker Operations

```bash
bun run docker:config     # Validate the Compose configuration
bun run docker:up         # Build and start the stack
docker compose logs -f    # Follow service logs
docker compose ps         # Inspect service status
docker compose down       # Stop the stack
```

The MCP manager mounts `/var/run/docker.sock` so it can build and run generated MCP server containers. Run this stack only on trusted development or deployment hosts.

## Monorepo Layout

```text
apps/
  chatbot_mcp_client/
    src/                 Next.js frontend
    backend/             FastAPI backend
  mcp-gen/
    src/                 MCP manager, generator, and proxy services
    API_ENDPOINTS.md     MCP service endpoint reference
  langChain-application/
    my_agent/            LangGraph agent implementation
openspec/
  specs/                 Project specifications
  changes/               Proposed and archived changes
```

## Root Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Starts workspace development processes through Turborepo. |
| `bun run build` | Builds all workspaces. |
| `bun run start` | Starts production processes where defined. |
| `bun run lint` | Runs workspace lint tasks. |
| `bun run typecheck` | Runs workspace type checks. |
| `bun run test` | Runs workspace test suites. |
| `bun run manager` | Starts the MCP manager workspace task. |
| `bun run proxy` | Starts the MCP proxy workspace task. |
| `bun run dev:backend` | Starts the chatbot backend workspace task. |
| `bun run docker:config` | Prints the resolved Docker Compose configuration. |
| `bun run docker:up` | Builds and starts the Docker Compose stack. |
