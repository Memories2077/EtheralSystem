## Context

The repository already has an `mcp-flow-validation` capability that covers end-to-end chatbot generation, generated MCP activation, tool use, feedback, and scoped environment cleanup. This change narrows the validation run to the project-root JSONPlaceholder fixture and makes observability part of the acceptance criteria.

Metaclaw and the Docker Compose stack are assumed to be running. The implementation should verify and use the live stack first, only restarting services when a health check proves the current stack cannot serve the validation flow.

## Goals / Non-Goals

**Goals:**

- Treat the root `INPUT_SAMPLE.txt` JSONPlaceholder prompt as the canonical input for this validation.
- Exercise the browser UI path through `POST /chat`, LangGraph/LangChain orchestration, mcp-gen server creation, MCP server manager activation, metadata fetch, and UI state update.
- Correlate all essential metrics with `buildRequestId`, `traceId`, `sessionId`, and `experimentId`.
- Assert that metric events exist for chat streaming, orchestration, generation, input normalization, OpenAPI generation, Docker build, container start, MCP create completion, and metadata verification.

**Non-Goals:**

- Do not redesign the chatbot UI or MCP server manager API.
- Do not add a new metrics backend; use the existing research events storage and environment controls.
- Do not introduce new generated MCP capabilities beyond the JSONPlaceholder validation fixture.

## Decisions

1. Use browser E2E as the source of truth.

   The validation must start from the UI because the requested proof is the full UI-to-manager-to-UI round trip. API-only tests are useful for debugging but cannot prove the browser request payload, SSE updates, local active server state, metadata fetch, and rendered response path.

2. Use root `INPUT_SAMPLE.txt` instead of embedding the prompt in tests.

   Keeping the JSONPlaceholder input in one root fixture avoids drift between manual runs, documentation, and automated validation. The test should read the file at runtime and fail clearly if it is missing or empty.

3. Require correlated metric assertions, not just event presence.

   Every required event must share the same `buildRequestId`, `traceId`, and `experimentId` captured from the UI request. This proves the metrics belong to the same run rather than stale data in the database.

4. Keep the implementation contract-compatible.

   Instrumentation should use existing request fields, research context helpers, and MCP metadata routes. Public route shapes should remain compatible unless an existing route is proven unable to carry required correlation data.

## Risks / Trade-offs

- Running stack is stale or partially unhealthy -> Probe frontend, backend, Mongo, and mcp-gen manager reachability before running the browser flow; report the failing boundary before making code changes.
- Metrics arrive asynchronously -> Poll the research events collection by `buildRequestId` with a bounded timeout instead of assuming immediate persistence.
- Previous runs pollute assertions -> Generate a unique `experimentId` or trace context for each validation and filter metrics by `buildRequestId`.
- Generated MCP build latency varies -> Use generous E2E timeouts while still logging latency metrics so slow stages are visible.
- JSONPlaceholder generation succeeds but metadata activation fails -> Treat MCP metadata/tool count verification as a first-class failure, not a warning, because it is the return path into the UI.
