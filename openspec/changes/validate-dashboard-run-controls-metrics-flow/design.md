## Context

The dashboard currently exposes run controls for `experimentId`, RAG on/off, and static/dynamic skill selection. Chat requests already carry research identifiers and can activate generated MCP servers, while the benchmark/reporting layer already knows about the four paper variants: `static-rag-off`, `static-rag-on`, `dynamic-rag-off`, and `dynamic-rag-on`.

This change validates and hardens the dashboard-driven path so a manual user run has the same evidence quality as a scripted benchmark run. The path crosses the Next.js dashboard/chat store, FastAPI `/chat` and `/mcp/metadata`, LangGraph generation state, mcp-gen server creation, generated server records, and research report export.

## Goals / Non-Goals

**Goals:**
- Treat dashboard controls as the source of truth for a manual run variant.
- Prove selected controls are visible in the dashboard, persisted in chat settings, sent on the backend payload, and reflected by generated server records.
- Ensure RAG and static/dynamic choices affect runtime behavior, not only labels.
- Ensure successful MCP server creation emits enough metrics for build success, metadata readiness, latency, estimated token/cost fields, and tool-call pass-rate inputs.
- Keep tool-call pass rate nullable/unknown when the user has not run tool validation.

**Non-Goals:**
- Replace the existing benchmark runner or report exporter.
- Require the dashboard to automatically execute every generated tool.
- Change public route names unless an existing route cannot carry required evidence.
- Persist raw prompts, secrets, tokens, cookies, JWTs, or full tool/API responses.

## Decisions

### Use one effective variant context

The frontend, FastAPI, LangGraph, mcp-gen, and reports SHALL use a normalized context containing:
- `experimentId`
- `traceId`
- `sessionId`
- `buildRequestId`
- `ragEnabled`
- `dynamicSkillSelection`
- `skillSelectionVariant`
- derived `variantId`

Rationale: a single context prevents the UI from showing one variant while backend events or report rows are labeled as another. The alternative was to let each service infer defaults from environment variables, but that makes manual dashboard runs vulnerable to stale process-level flags.

### Preserve dashboard as a manual control surface

The dashboard SHALL launch users into the chat/build flow with the selected controls already persisted. It does not need to become a separate benchmark runner in this change.

Rationale: the user wants to input and run tests manually. Reusing the existing chat build flow limits scope and keeps the generated MCP activation path identical to the production UI path. A separate dashboard-only run endpoint would duplicate orchestration and make the evidence harder to compare.

### Record tool-call pass rate as measured, skipped, or unknown

Reports SHALL compute tool-call pass rate only from completed tool validation outcomes. If the dashboard run only builds and activates a server, report rows SHALL preserve build and metadata metrics while marking tool-call coverage as unknown or skipped instead of failed.

Rationale: the user plans to test tool success rate manually. Treating untested tools as failures would corrupt build-success and cost analysis.

### Prefer focused assertions over a large browser suite

Implementation SHALL add narrow tests for payload mapping, backend normalization, RAG bypass, static/dynamic prompt selection, server record persistence, and report aggregation. One browser smoke/manual QA path SHALL cover the visible dashboard controls and payload sent to `/chat`.

Rationale: most risk is at service boundaries. Focused tests catch regressions faster than a brittle full E2E suite, while a smoke flow still verifies the user-facing dashboard behavior.

## Risks / Trade-offs

- Variant flags can be represented as booleans in the UI and strings in backend/mcp-gen environments -> Normalize at each API boundary and assert exact stored values.
- Existing reports may already contain historical rows without new fields -> Exporters should tolerate missing values and emit empty/unknown fields rather than crashing.
- RAG disabled behavior can look like a successful empty retrieval -> Events must explicitly record `rag_enabled=false` and zero context counts.
- Static mode naming may drift between `static`, `control`, and `dynamicSkillSelection=false` -> Use `skillSelectionVariant=static` or a documented compatibility mapping, then test report grouping.
- Tool-call validation may be expensive or require credentials -> Keep tool validation optional for dashboard runs and represent skipped/unknown coverage separately.
