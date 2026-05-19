## Why

Current paper metrics prove the JSONPlaceholder flow and generated tool invocation, but they do not yet provide a reproducible comparison matrix across multiple live-callable API cases and ablation variants. The paper needs backend-level E2E measurements that are cleaner than browser automation and strong enough to compare static prompts, dynamic skill selection, and RAG behavior.

## What Changes

- Add a backend API E2E benchmark that builds generated MCP servers through `POST /chat`, verifies metadata through `POST /mcp/metadata`, and probes generated tools through follow-up `POST /chat` requests.
- Run a fixed matrix of 4 live-public API cases, 4 variants, and 3 repeats per cell.
- Record build success, runtime metadata readiness, tool-call pass rate, skipped tool coverage, latency, and estimated token usage.
- Export machine-readable JSONL/CSV artifacts and Markdown paper tables grouped by case, API type, variant, skill-selection mode, and RAG mode.
- Keep Playwright UI validation as smoke coverage only; paper benchmark metrics come from backend API E2E runs.

## Capabilities

### New Capabilities
- `backend-api-toolcall-matrix-benchmark`: Reproducible backend API E2E benchmark for live-public MCP generation cases across static/dynamic skill-selection and RAG on/off variants.

### Modified Capabilities

## Impact

- Affected scripts: research benchmark runner, headless tool-call validation flow, report exporter, and benchmark dataset fixtures.
- Affected services: chatbot backend `/chat` and `/mcp/metadata`, LangGraph generation path, mcp-gen server manager, research event persistence.
- No breaking API changes; existing route shapes and current Playwright validation remain compatible.
