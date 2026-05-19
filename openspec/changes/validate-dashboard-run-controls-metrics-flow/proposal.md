## Why

The new research dashboard lets users choose RAG on/off and static/dynamic skill selection before running MCP generation tests, but those UI controls are only useful if the selected variant is visibly reflected, reaches the backend, changes generation behavior, and appears in the resulting metrics. We need a validation change now so dashboard-driven runs can be trusted for build success, tool-call pass rate, and estimated token/cost reporting.

## What Changes

- Validate the dashboard run controls as a first-class user flow: selected RAG and skill-selection mode MUST persist in the UI and be sent on run/chat requests.
- Validate backend propagation of `experimentId`, `ragEnabled`, `dynamicSkillSelection`, and `skillSelectionVariant` from the dashboard request into FastAPI, LangGraph, mcp-gen creation, generated server records, and metadata/report rows.
- Ensure RAG toggles alter runtime behavior: disabled runs bypass retrieval and enabled runs preserve existing retrieval metrics.
- Ensure static/dynamic toggles alter generation behavior and are recorded with the generated MCP server.
- Ensure successful MCP server creation logs/reporting include build success, metadata readiness, effective variant flags, latency, estimated token/cost fields, and tool-call pass-rate inputs when tool validation has run.
- Ensure report/export behavior distinguishes untested tool-call success rate from failed tool-call validation so users can run tool probes manually without corrupting build metrics.
- Add focused automated checks and one browser/manual QA path for the dashboard-to-backend flow.

## Capabilities

### New Capabilities
- `dashboard-run-controls-metrics-flow`: Covers dashboard controls, request payload propagation, generated-server variant metadata, and dashboard/manual-run report evidence.

### Modified Capabilities
- `mcp-flow-validation`: Extend browser validation to cover dashboard-driven variant controls and generated-server state reflection.
- `research-metrics-mvp`: Require dashboard-created MCP servers and reports to include effective variant flags, build success, metadata readiness, estimated token/cost fields, and explicit unknown/skipped tool-call coverage.
- `backend-api-toolcall-matrix-benchmark`: Align backend benchmark/report fields with dashboard-selected RAG/static/dynamic variants and tool-call pass-rate semantics.

## Impact

- Affected frontend: dashboard page, run controls, persisted chat settings, generated server list/state, and any report download or summary UI.
- Affected backend: FastAPI chat request schema/normalization, LangGraph state, RAG/examiner branch, generator/mcp-gen create payload, metadata checks, and generated server records.
- Affected metrics: research event recorder payloads, JSONL/CSV/Markdown exports, benchmark run records, and report rows for dashboard-generated MCP servers.
- Affected verification: frontend payload tests, backend schema/unit tests, LangGraph flag-propagation tests, mcp-gen generation-mode tests, report/export assertions, and a dashboard smoke flow.
