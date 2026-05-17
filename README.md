# Etheral System

AI-powered chatbot platform with an MCP (Model Context Protocol) ecosystem. Unifies a Next.js chat UI, FastAPI backend, LangGraph agent, and dynamic MCP server generation into a single deployable stack.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Etheral System                          │
├─────────────────────────────────────────────────────────────┤
│  Frontend (9002)  →  Backend (8000)  →  Agent (2024)        │
│  Next.js 15          FastAPI           LangGraph             │
│                       │                  │                   │
│                       │            ┌─────┴──────┐            │
│                       │         ChromaDB      Ollama          │
│                       │                                         │
│  MCP Gen (8080/8081) ←┘                                        │
│  Manager + Proxy                                                 │
│       │                                                          │
│  ┌────┴────┬────────────┐                                       │
│  MongoDB   RabbitMQ      │                                       │
│  (27017)   (5672/15672)  │                                       │
└─────────────────────────────────────────────────────────────┘
```

### Services

| Service | Port | Description |
|---|---|---|
| Chatbot Frontend | 9002 | Next.js 15 chat UI |
| Chatbot Backend | 8000 | FastAPI orchestrator |
| MCP Manager | 8080 | API-to-MCP generator |
| MCP Proxy | 8081 | Dynamic request routing |
| LangGraph Agent | 2024 | AI agent with tool use |
| MongoDB | 27017 | Data persistence |
| RabbitMQ | 5672, 15672 | Message queue |
| ChromaDB | 8025 | Vector store |
| Ollama | 11434 | Local LLM runtime |

### Tech Stack

- **Frontend**: Next.js 15, React 19, TailwindCSS, shadcn/ui, Zustand
- **Backend**: FastAPI (Python 3.12), LangChain, SSE streaming
- **MCP Gen**: TypeScript/Bun, Docker SDK, Express proxy
- **Agent**: LangGraph, LangChain, ChromaDB, Ollama
- **Runtime**: Docker Compose, single multi-stage Dockerfile
- **Package Manager**: Bun (workspaces + Turborepo)

## Quick Start

### Prerequisites

- Docker & Docker Compose
- At least one LLM API key (Gemini, Groq, OpenAI, or Anthropic)

### 1. Configure environment

```bash
cp .env.example .env
# Edit .env and add your API keys
```

### 2. Start the full stack

```bash
docker compose up --build -d
```

The first build takes several minutes as it installs all dependencies. Subsequent builds leverage Docker layer caching.

### 3. Access the application

- **Chat UI**: http://localhost:9002
- **Health check**: http://localhost:8000/health
- **RabbitMQ dashboard**: http://localhost:15672 (guest/guest)

## Development

### Local (non-Docker)

```bash
bun install
bun run dev          # Start all apps in dev mode via Turborepo
bun run build        # Production build
bun run typecheck    # Type check all workspaces
bun run test         # Run all tests
```

### Individual services

```bash
bun run dev:backend       # FastAPI backend only
bun run manager            # MCP server manager only
bun run proxy              # MCP dynamic proxy only
```

### Docker

```bash
docker compose up --build -d   # Start all services
docker compose down            # Stop all services
docker compose logs -f         # Follow logs
docker compose ps              # Service status
```

## Monorepo Structure

```
apps/
├── chatbot_mcp_client/   # Next.js frontend + FastAPI backend
│   ├── src/              # Next.js app
│   └── backend/          # FastAPI Python service
├── mcp-gen/              # API-to-MCP generator & proxy
│   └── src/              # TypeScript services
└── langChain-application/ # LangGraph agent
    └── my_agent/          # Python agent code
```

## External Integrations

- **MetaClaw**: Optional external reasoning engine. Configure via `METACLAW_API_KEY` and `METACLAW_BASE_URL`.
- **LLM Providers**: Gemini, Groq, OpenAI, Anthropic — add keys in `.env`.
