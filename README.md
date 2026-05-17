# EtheralSystem

Monorepo for the Etheral MCP ecosystem.

## Workspaces

- `apps/chatbot_mcp_client` - Next.js chatbot UI and FastAPI backend
- `apps/mcp-gen` - API-to-MCP generator and proxy services
- `apps/langChain-application` - LangGraph agent service

`MetaClaw` is intentionally kept outside this monorepo and remains an external integration through environment variables.

## Commands

```bash
bun install
bun run dev
bun run typecheck
bun run test
docker compose config
docker compose up --build
```

Python test dependencies are managed outside Bun:

```bash
python -m pip install -r apps/chatbot_mcp_client/backend/requirements-dev.txt
python -m pip install -e "apps/langChain-application[dev]"
bun run test
```

Copy `.env.example` to `.env` when running the full Docker stack.
