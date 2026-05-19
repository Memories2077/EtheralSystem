## Why

The project needs defensible research metrics before the May 30, 2026 paper deadline, but the existing logging plan is larger than the remaining paper window. This change creates the smallest end-to-end metrics layer needed to collect reproducible evidence for MCP generation quality, dynamic skill selection, RAG contribution, and runtime reliability.

## What Changes

- Add a research metrics event contract with stable correlation fields across the chatbot backend, LangGraph agent, and mcp-gen.
- Add feature-gated event recording to MongoDB with JSONL fallback for local/offline experiment runs.
- Propagate `traceId` and `experimentId` alongside existing `sessionId`, `buildRequestId`, and `serverId` context.
- Instrument paper-critical stages: chat streaming, LangGraph routing/RAG/indexing, mcp-gen generation/skill selection/Docker lifecycle, feedback, and runtime MCP smoke checks.
- Add a small benchmark dataset, runner, and exporter that produce paper-ready CSV and Markdown tables.
- Keep the full telemetry roadmap, security telemetry, frontend telemetry, deep MetaClaw memory/RL metrics, and resource profiling out of this MVP unless already available from existing logs.

## Capabilities

### New Capabilities

- `research-metrics-mvp`: Research-grade event capture, benchmark execution, and aggregate report export for the paper-focused MCP pipeline experiments.

### Modified Capabilities

- `mcp-flow-validation`: Existing MCP flow validation should include research correlation context and runtime reliability observations when experiment metrics are enabled.

## Impact

- Affected systems: `apps/chatbot_mcp_client/backend`, `apps/langChain-application`, `apps/mcp-gen`, Docker environment configuration, and OpenSpec specs.
- Public interfaces gain optional request/context fields only; no breaking API changes.
- MongoDB gains a `research_events` collection when metrics are enabled.
- New scripts and fixtures support repeatable benchmark runs and export paper tables.
