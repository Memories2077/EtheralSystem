# AGENTS.md - EtheralSystem

## Project Overview

EtheralSystem is a monorepo (Bun + Turbo) for building and evaluating MCP (Model Context Protocol) server infrastructure. It contains a chatbot MCP client, an MCP server generator, research/benchmarking tooling, and E2E validation tests.

## Architecture

### Apps

| App | Path | Description |
|-----|------|-------------|
| `chatbot_mcp_client` | `apps/chatbot_mcp_client/` | Chatbot that connects to MCP servers via a backend proxy |
| `mcp-gen` | `apps/mcp-gen/` | MCP server generator/manager with CLI tooling |
| `langChain-application` | `apps/langChain-application/` | LangChain-based application |

### Key Directories

| Directory | Purpose |
|-----------|---------|
| `scripts/research/` | Research scripts: toolcall matrix, paper MVP benchmarking, report export, RAG env setup |
| `experiments/` | Experiment artifacts, metrics, toolcall matrices, reports |
| `input/` | Input API docs (text format) for research matrix runs |
| `reports/` | Generated research and validation reports |
| `tests/` | E2E tests (Playwright) |
| `docs/` | Project documentation |
| `openspec/` | OpenSpec change proposals |

## Commands

```bash
# Install dependencies
bun install

# Start all dev servers
bun dev

# Build
bun build

# Run tests
bun test
bun test:e2e           # Full E2E suite
bun test:headless-mcp-tool  # Headless MCP validation

# Research
bun research                  # Run research
bun research:toolcall-matrix  # Backend toolcall matrix
bun research:benchmark        # Paper MVP benchmark
bun research:export           # Export research reports

# Docker
bun docker:up    # Start containers
bun docker:config  # Validate compose config
```

## Tech Stack

- **Runtime:** Bun (package manager + runtime)
- **Monorepo:** Turborepo
- **Testing:** Playwright (E2E), Bun test (unit)
- **Infrastructure:** Docker Compose, MCP Inspector
- **Languages:** TypeScript, Python (backend)

## Notes

- The project tracks research metrics and toolcall performance matrices in `experiments/research-metrics/`
- Input API documentation lives in `input/` and feeds into research matrix runs
- Reports are generated to `experiments/research-metrics/reports/` and `reports/`
