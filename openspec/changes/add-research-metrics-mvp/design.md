## Context

EtheralSystem already passes `sessionId` and `buildRequestId` through the chat UI, FastAPI backend, LangGraph build handoff, and mcp-gen. MongoDB is already available to the chatbot backend, LangGraph app, and mcp-gen, and mcp-gen already persists build logs and skill feedback. The missing piece is a small, consistent research event contract and repeatable export path for paper tables.

The May 30, 2026 paper deadline makes this a metrics MVP rather than a full observability platform. The implementation must preserve current runtime behavior when metrics are disabled.

## Goals / Non-Goals

**Goals:**

- Capture reproducible, correlated events for end-to-end MCP generation experiments.
- Support paper-critical measurements: dynamic skill selection, RAG contribution, generation quality, runtime reliability, and feedback.
- Provide scripts that run a small frozen benchmark dataset and export CSV/Markdown summaries.
- Avoid logging secrets, JWTs, API keys, or full raw private prompts.

**Non-Goals:**

- No distributed tracing vendor, dashboard, or metrics daemon.
- No frontend telemetry beyond existing request context.
- No deep MetaClaw memory/RL instrumentation in this change.
- No full security scanner or CPU/memory resource profiler.

## Decisions

1. **Use MongoDB-first event storage with JSONL fallback.**
   - MongoDB is already configured across services, so `research_events` can be queried and exported without another dependency.
   - JSONL fallback keeps local benchmark runs usable when Mongo is unavailable.

2. **Gate all recording behind `RESEARCH_METRICS_ENABLED`.**
   - The default stays off to avoid production noise and performance risk.
   - Benchmark scripts explicitly enable the flag.

3. **Use one common event shape in each language.**
   - Python and TypeScript helpers normalize `trace_id`, `experiment_id`, service/stage/event/status, duration, metrics, and tags.
   - Service-local helpers are acceptable for the MVP; a shared package can come later.

4. **Propagate optional context, do not break APIs.**
   - `traceId` and `experimentId` are optional request fields.
   - Existing `sessionId` and `buildRequestId` continue to work as the primary chat/build identifiers.

5. **Export from events plus existing mcp-gen collections.**
   - Events provide lifecycle timings.
   - Existing `logs` and `skill_feedback` records provide feedback and generation-quality metadata.

## Risks / Trade-offs

- [Risk] Metrics collection adds latency or failures to the main flow. -> Log asynchronously/best-effort and never fail user requests because event persistence fails.
- [Risk] Cross-service event names drift. -> Keep a small fixed set of stage/event names in helper modules and tests.
- [Risk] Benchmark data is too small for broad claims. -> Present the dataset as a deadline MVP and report confidence conservatively.
- [Risk] Raw input could leak private content. -> Log content length, hashes, feature flags, and classified input type instead of full text.

## Migration Plan

- Add disabled-by-default metrics helpers and tests.
- Enable metrics only for benchmark runs or explicit local experiments.
- If a rollout problem appears, set `RESEARCH_METRICS_ENABLED=false`; application behavior returns to the existing path.
