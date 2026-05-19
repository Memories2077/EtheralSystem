## Context

`INPUT_SAMPLE.txt` already contains the JSONPlaceholder API guide and the current chat store already sends `sessionId` and `buildRequestId` through `/chat`. The metrics MVP records events across FastAPI, LangGraph, and mcp-gen, but generated-server auto-activation currently calls `/mcp/metadata` without the original correlation context, and the repo has no persistent browser E2E test that proves the full UI path works.

## Goals / Non-Goals

**Goals:**
- Validate the browser flow from root JSONPlaceholder input to generated MCP server activation.
- Keep existing route shapes compatible while propagating optional correlation context.
- Assert essential research events and metric keys across the build/runtime path.
- Use one MongoDB research event database for all services during validation.

**Non-Goals:**
- Add a metrics dashboard or distributed tracing vendor.
- Replace the existing benchmark runner.
- Log raw private prompt content.
- Add exhaustive metrics for every internal branch.

## Decisions

1. Use `INPUT_SAMPLE.txt` as the canonical fixture.
   - It already contains the JSONPlaceholder input referenced by the existing flow-validation spec.
   - Avoids introducing a second nearly-identical root fixture.

2. Add Playwright browser E2E coverage.
   - API-only tests cannot prove the UI stores the generated server as active state.
   - The E2E test will capture the `/chat` request identifiers, wait for build completion, inspect UI active-server state, and query persisted research events.

3. Propagate metadata correlation through existing optional fields.
   - Frontend activation should pass `traceId`, `experimentId`, `sessionId`, `buildRequestId`, and `serverId` to `/mcp/metadata` when available.
   - FastAPI already accepts those fields, so no public route shape change is required.

4. Assert core event coverage instead of adding broad telemetry.
   - Required checks focus on the paper-critical stages already instrumented.
   - Missing correlation or essential fields should be fixed in the narrowest service boundary.

5. Unify event storage with `RESEARCH_EVENTS_DB`.
   - Docker Compose should expose the same optional database env var to chatbot backend, LangGraph agent, mcp-gen manager, proxy, and generated containers.
   - Default behavior remains compatible when metrics are disabled.

## Risks / Trade-offs

- [Risk] Browser E2E requires a live LLM provider and Docker runtime. -> Mark the test as an explicit E2E script outside normal unit test runs.
- [Risk] Full generation is slow and flaky. -> Use fixed experiment/build identifiers and generous timeouts in the E2E harness.
- [Risk] Generated tool names vary. -> Validate non-empty tools and runtime initialization rather than hard-coding exact tool names.
- [Risk] Mongo may be unavailable locally. -> Keep existing JSONL fallback for unit tests; E2E uses Compose MongoDB.
