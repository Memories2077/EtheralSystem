# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**mcp-gen** is an intelligent API-to-MCP translator that automatically converts RESTful API definitions into MCP (Model Context Protocol) server format. The system uses a hybrid agent skill architecture with modular prompt fragments to generate production-ready MCP servers that integrate with Claude and other LLM platforms.

### Key Technologies
- **Backend**: Node.js/TypeScript with Express
- **AI Providers**: Google Gemini, Groq, Anthropic Claude (via MetaClaw), with fallback support for OpenAI-compatible APIs
- **Database**: MongoDB for server metadata and logging
- **Message Queue**: RabbitMQ for async build/status communication
- **Containerization**: Docker with dynamic container generation
- **LLM SDK**: LangChain for multi-provider support, @modelcontextprotocol/sdk for MCP protocol

## Development Commands

### Installation & Setup
```bash
# Install dependencies
npm install

# Build and start with Docker Compose (production)
docker-compose build
docker-compose up -d

# Access points:
# - API Manager: http://localhost:8080
# - Proxy: http://localhost:8081
# - MongoDB: localhost:27017
# - RabbitMQ Management: http://localhost:15672 (guest/guest)
```

### Development Scripts
```bash
# Start the manager server (development)
npm run start

# Alternative server entry (note: src/server.ts does not exist - may be outdated)
# npm run server

# Test generation (runs the generator with SERVER_ID env var)
npm run build
# Example: SERVER_ID=test123 npm run build

# TypeScript compilation (if needed)
npx tsc --noEmit  # type checking only
```

### Running Individual Components
```bash
# Set SERVER_ID and run the launcher (for generated MCP servers)
SERVER_ID=<server-id> npx tsx src/launcher.ts

# The launcher executes generated servers from src-generated-ts/ directory
```

### Environment Configuration
Copy `.env.example` to `.env` and configure:

```bash
# Required for AI generation (at least one):
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-2.5-flash
# or
GROQ_API_KEY=your_key
GROQ_MODEL=llama-3.3-70b-versatile
# or
METACLAW_ENABLED=true
METACLAW_BASE_URL=http://localhost:30000/v1
METACLAW_API_KEY=metaclaw

# Infrastructure:
MONGO_URI=mongodb://localhost:27017
RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
PUBLIC_URL=http://localhost:8081

# Docker:
DEFAULT_MCP_IMAGE=mcp-gen  # Build this first: docker build -t mcp-gen .
```

### Building the Base MCP Image (Critical)
```bash
# MUST be built before generating servers (saves 20-30s per request)
docker build -t mcp-gen .
```

### Testing the API
```bash
# Create a new MCP server from API spec
curl -X POST http://localhost:8080/api/mcp/create \
  -H "Content-Type: application/json" \
  -d '{
    "request": "Your API documentation...",
    "userId": "user123",
    "email": "user@example.com"
  }'

# List all servers
curl http://localhost:8080/api/mcp/servers

# Get Claude config for a server
curl http://localhost:8080/api/mcp/<serverId>/claude-config

# Delete a server
curl -X DELETE "http://localhost:8080/api/mcp/<serverId>?token=<jwt-token>"
```

## Architecture

### High-Level System Flow

```
User Request → API Manager (Express) → Skill Router → LLM Generation → Docker Build → Running MCP Server
      ↑                                                              ↓
   MongoDB ←────── Message Queue (RabbitMQ) ←────── Status Updates
```

### Core Components

#### 1. **MCPServerManager** (`src/mcp-server-manager.ts`)
Main Express server (port 8080) handling:
- REST API endpoints for MCP server lifecycle
- Docker container management (build, run, stop, delete)
- JWT authentication for server access
- MongoDB persistence for server metadata and logs
- Message queue integration with RabbitMQ

**Key endpoints** (see `API_ENDPOINTS.md`):
- `POST /api/mcp/create` - Create new MCP server
- `GET /api/mcp/servers` - List all servers
- `GET /api/mcp/:serverId/claude-config` - Get Claude config
- `DELETE /api/mcp/:serverId` - Delete server
- `GET /api/mcp/stats` - Statistics from MongoDB

#### 2. **Hybrid Skill System** (`src/skills/`)
Modular prompt architecture preventing knowledge contamination:

```
src/skills/
├── skill-router.ts          # Loads and caches skill fragments
├── auth/                    # Authentication logic fragments
│   ├── input_format.md
│   ├── mcp_requirements.md
│   ├── mcp_anti_contamination.md
│   ├── openapi_requirements.md
│   └── openapi_anti_contamination.md
├── mcp/                    # MCP server generation skills
│   ├── system.md
│   ├── user_message.md
│   ├── zod_mapping.md
│   └── request_patterns.md
└── openapi/               # OpenAPI spec generation skills
    ├── system.md
    └── user_message.md
```

**Auth Detection**: `detectAuthInInput()` and `detectAuthInSpec()` analyze input to conditionally inject auth patterns. If no auth detected, anti-contamination prompts prevent model from hallucinating security features.

#### 3. **Generator** (`src/generator/`)
- `index.ts`: Main generation functions (`generateMCP()`, `generateOpenAPISpec()`)
- `prompt.ts`: Prompt builders using skills (`buildPromptWithExamples()`, `buildOpenAPIPromptWithExamples()`)
- `validator.ts`: OpenAPI spec validation

**Critical validation** in generator:
- Strips markdown code blocks from LLM output
- Detects template syntax (Jinja2/Handlebars) that indicates model confusion
- Validates OpenAPI structure (must start with `openapi:`, single declaration)
- Prevents example reference leakage (HTTPBin/Reddit/Twilio comments)

#### 4. **Message Queue Service** (`src/services/message-queue-service.ts`)
Async build coordination via RabbitMQ:
- Queues: `mcp.build`, `mcp.status`, `mcp.getConfig`, `mcp.delete`
- Publishes status updates during container lifecycle
- Enables horizontal scaling of build workers

#### 5. **Dynamic Proxy** (`src/dynamic-proxy.ts`)
Alternative routing layer (port 8081) that proxies MCP requests to appropriate container based on serverId. Used when PUBLIC_URL points to proxy instead of direct container access.

#### 6. **Launcher** (`src/launcher.ts`)
Entry point for generated MCP servers. Reads TypeScript from `src-generated-ts/` directory and executes it. Receives `SERVER_ID` environment variable to locate the correct file.

## Project Structure

```
mcp-gen/
├── src/
│   ├── mcp-server-manager.ts    # Main Express API server
│   ├── launcher.ts              # Generated server launcher
│   ├── dynamic-proxy.ts         # Proxy router (alternative)
│   ├── generator/               # Generation engine
│   │   ├── index.ts             # Main generation functions
│   │   ├── prompt.ts            # Prompt construction with skills
│   │   └── validator.ts         # OpenAPI validation
│   ├── skills/                  # Modular prompt fragments
│   │   ├── skill-router.ts      # Skill loader and assembler
│   │   ├── auth/                # Auth/anti-contamination fragments
│   │   ├── mcp/                 # MCP generation fragments
│   │   └── openapi/             # OpenAPI generation fragments
│   ├── services/
│   │   └── message-queue-service.ts  # RabbitMQ integration
│   └── utils/
│       ├── config.ts            # Multi-provider AI config
│       ├── fs.ts                # File operations
│       ├── genai.ts             # LLM API wrapper
│       └── token-counter.ts     # Token tracking/truncation
├── test/
│   ├── test-generation.ts       # CLI generation test script
│   ├── generate_openapi/        # OpenAPI generation examples
│   │   ├── input_example.ts
│   │   ├── output_example.yaml
│   │   ├── output_example_reddit.yaml
│   │   └── output_example_twilio.yaml
│   ├── specs/                   # Reference examples
│   │   ├── OpenAPI_to_MCPServer_structure.ts
│   │   ├── Reddit.yaml
│   │   ├── Reddit_MCPServer.ts
│   │   └── OpenAPI_Auth_Examples.ts
│   └── reddit-server-fixed.ts   # Known-good MCP server example
├── data/                        # Persistence (JWT secrets, etc.)
├── input/                       # User API spec uploads (via Docker volumes)
├── src-generated-yaml/          # Generated OpenAPI specs
├── src-generated-ts/            # Generated MCP server TypeScript
├── docs/                        # Documentation
├── docker-compose.yml           # Multi-service orchestration
├── Dockerfile                   # Base MCP server image
├── Dockerfile.manager           # API manager container
├── Dockerfile.proxy             # Proxy container
├── package.json                 # Dependencies and scripts
├── tsconfig.json                # TypeScript configuration
└── .env.example                 # Environment template
```

### Docker Volume Mapping (docker-compose.yml)
- `shared_input` → `/app/input` (manager) - input API specs
- `shared_openapi_spec` → `/app/src-generated-yaml` - generated OpenAPI files
- `shared_mcpserver_ts` → `/app/src-generated-ts` - generated MCP servers
- `jwt_data` → `/app/data` - JWT secrets and persistence

## AI Provider Configuration

The system supports multiple LLM providers via `src/utils/config.ts`:

1. **Google Gemini** (default): `GEMINI_API_KEY`, `GEMINI_MODEL`
2. **Groq**: `GROQ_API_KEY`, `GROQ_MODEL`
3. **MetaClaw** (Anthropic proxy): `METACLAW_ENABLED=true`, `METACLAW_BASE_URL`, `METACLAW_API_KEY`

All providers use LangChain wrappers. Temperature and timeout configurable via `OPENAI_TEMPERATURE` and `OPENAI_TIMEOUT_MS` (legacy naming).

## Testing Approach

No formal unit test suite exists. Testing is done via:
- **Manual API testing**: Use cURL to POST specs and verify generated code
- **Generation script**: `npm run build` with `SERVER_ID` env var
- **Docker integration**: Full stack via `docker-compose up`
- **Example specs**: `test/specs/` contains reference inputs/outputs

To verify generation quality, compare new output against:
- `test/specs/Reddit_MCPServer.ts` (auth example)
- `test/generate_openapi/output_example.yaml` (OpenAPI structure)

## Common Issues & Debugging

### "Server file not found" error
- Check `src-generated-ts/` directory exists and contains `{SERVER_ID}.ts`
- The file is generated by `npm run build` first

### Docker build fails
- Ensure base image built: `docker build -t mcp-gen .`
- Check Docker daemon is running
- Verify volume mounts in docker-compose are accessible

### LLM returns template syntax (Jinja2/Handlebars)
- Indicates model configuration issue - the model is using its training template syntax instead of outputting pure YAML/TypeScript
- Check AI provider API key and model name
- Try a different model (Gemini 2.5 Flash recommended)

### Authentication contamination
- System auto-detects auth via keyword scanning. Verify `detectAuthInInput()` and `detectAuthInSpec()` patterns match your spec format
- If auth is present but not detected, manually add auth keywords to the detection patterns in `src/generator/prompt.ts`

### MongoDB/RabbitMQ connection warnings
- These are non-fatal if services not running
- Features degrade gracefully without them
- For full functionality, ensure services are healthy in docker-compose

### Port conflicts
- Manager uses port 8080, Proxy uses 8081
- Generated MCP servers use dynamic ports starting at 4000
- Check `netstat -tulpn` or Docker container port mappings

### Token limit warnings
- Generator uses token counter and truncates at 120k tokens
- Reduce input spec size or use more concise examples if truncation occurs
- Check logs for "Context size" warnings

## Code Style Guidelines

- TypeScript with ES modules (`"type": "module"` in package.json)
- Use `npx tsx` for running TypeScript directly (no separate compilation step)
- Error messages: console.error with ❌ emoji, logs with ✅/⚠️
- Import paths: relative from `__dirname` using `path.join()`
- File operations: Use utils/fs.ts wrappers (`writeFileSafe`, `exists`, etc.)

## Important Notes

- **No test suite**: The `test` script is placeholder. Use `npm run build` for generation testing.
- **Skill system**: All prompt fragments are in `src/skills/`. Do not hardcode prompts in TypeScript files.
- **Auth isolation**: Critical security feature - ensure anti-contamination guards remain enabled.
- **Docker dependency**: The system requires Docker to run generated MCP servers as containers.
- **Multi-provider AI**: The codebase uses LangChain abstractions; adding new providers requires config in `utils/config.ts` and possibly generator adjustments.
- **Persistence**: JWT secrets stored in `data/persistence.json` (mounted as Docker volume `jwt_data`).
- **Network**: All containers use `mcp-network` for inter-container communication.

## Known Good States

- Recent commit: `e7d5726 Implement MetaClaw routing for mcp-gen`
- Branch: `nttung245` (your current working branch)
- MetaClaw proxy integration working for Anthropic Claude API compatibility
- Improved PUBLIC_URL handling for local and inter-container access
- Hybrid agent skill system and modular prompt refactor complete

## Related Documentation

- `README.md` - User-facing quick start and architecture overview
- `API_ENDPOINTS.md` - Detailed API endpoint reference
- `docs/` - Additional documentation (if present)
- `history.md` - Development changelog
