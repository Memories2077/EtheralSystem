## Context

The completed MAPR run produced valid build artifacts but invalid evidence for two metric groups. First, `research-events.jsonl` contains only `chatbot-backend` and `mcp-gen` services; there are no `langgraph-agent` events, so `rag_retrieval_by_variant.csv` used backend fallback `examiner_completed` events with hardcoded zero RAG counts. Second, `mcp-gen` emits numeric usage-like metrics such as `prompt_token_estimate`, `token_count`, and `skill_total_tokens`, but the research redactor treats every key containing `token` as sensitive, so the exporter receives `[REDACTED]` and normalizes usage to zero. Cost is also zero because no producer emits `estimated_cost_usd` and no pricing rule derives it.

The intended architecture remains `chatbot-backend -> agent-service/LangGraph examiner -> generator -> mcp-gen`. The current benchmark assumption is that all LLM paths use Gemini 2.5 Flash, including MetaClaw because its current backend is Gemini 2.5 Flash. The fix must prove the metric path with one build before any larger benchmark run.

## Goals / Non-Goals

**Goals:**

- Make RAG-on benchmark evidence come from real `langgraph-agent` examiner events.
- Ensure API-doc MCP creation requests route through examiner before generator in the benchmark path.
- Preserve safe numeric token usage metrics while continuing to redact real secrets and raw inputs.
- Normalize usage and derive estimated cost for all benchmark LLM usage with the effective Gemini 2.5 Flash prices: `$0.30 / 1M` text input tokens and `$2.50 / 1M` text output tokens.
- Report missing or redacted evidence as unavailable/failing validation, not as valid zero metrics.
- Add a single-build smoke acceptance path that verifies RAG evidence, token usage, cost, and cleanup.

**Non-Goals:**

- Replace LangGraph, Chroma, Mongo, or the MCP generator architecture.
- Claim provider billing accuracy; usage and cost remain estimates unless a provider response supplies authoritative usage.
- Store raw prompts, raw API docs, full RAG chunks, API keys, bearer tokens, JWTs, cookies, or full API responses.
- Rerun the full 36-build paper matrix as part of this change.

## Decisions

### Treat `langgraph-agent` events as authoritative RAG evidence

RAG retrieval metrics will be computed only from real `service="langgraph-agent"` events, primarily `event_name="examiner_completed"`. Backend `backend_langgraph_fallback` events may remain as stream diagnostics, but the runner/exporter must ignore them for MAPR RAG retrieval metrics and must not convert missing real evidence into zeros.

Alternative considered: keep backend fallback metrics and mark them with a source tag. That preserves table shape but hides a broken path, which is exactly what caused the misleading `0/0/0` retrieval result.

### Force benchmark API-doc create flows through examiner first

For MCP creation requests that contain API documentation, the LangGraph supervisor path should deterministically call `delegate_to_examiner_agent` before generator. The examiner will record RAG metrics, build the structured task containing `ORIGINAL_PROMPT`, `API_DOCUMENTATION`, and `ENRICHED_CONTEXT (RAG)`, then delegate to generator. The smoke run should verify that `mcp-gen` input length and/or safe input markers indicate generator received the enriched payload.

Alternative considered: rely on LLM routing alone. That is too variable for a benchmark and can bypass examiner.

### Preserve safe numeric usage fields during redaction

Research redaction should distinguish secret credential tokens from usage-count tokens. Numeric usage fields such as `prompt_token_estimate`, `completion_token_estimate`, `total_token_estimate`, `token_count`, `rag_context_tokens`, and `skill_total_tokens` are safe metadata and must remain numeric. Secret-bearing keys such as `access_token`, `refresh_token`, `authorization`, `jwt`, `cookie`, `api_key`, and `password` remain redacted.

Alternative considered: rename all usage keys to avoid `token`. That creates a broad cross-service migration and still leaves future usage keys vulnerable to over-redaction.

### Normalize usage and derive cost from the effective benchmark model

Each run should expose:

- `estimated_prompt_tokens`
- `estimated_completion_tokens`
- `estimated_total_tokens`
- `estimated_cost_usd`
- `usage_status`
- `usage_source`

Provider-reported usage should be preferred when available. Otherwise, prompt/input tokens can use existing prompt estimates and completion/output tokens can be estimated from generated output length. For this benchmark, every LLM path uses the effective model `gemini-2.5-flash`, including MetaClaw-backed calls. Cost is therefore derived uniformly for all correlated LLM usage in the run:

`estimated_prompt_tokens * 0.30 / 1_000_000 + estimated_completion_tokens * 2.50 / 1_000_000`

If either side of the usage estimate is missing, `usage_status` must indicate the issue and cost must be `null` or not applicable rather than `0`.

Alternative considered: leave cost zero when unavailable. That makes reports look cheaper than reality and prevents detecting broken usage capture.

Alternative considered: price by the visible provider field only. That would undercount MetaClaw usage in the current setup because MetaClaw is also backed by Gemini 2.5 Flash.

### Add one-build acceptance before broader runs

Implementation should include a one-build smoke target, preferably `jsonplaceholder-input-doc` with `dynamic-rag-on`, that validates:

- At least one real `langgraph-agent` `examiner_completed` event exists for the build request.
- RAG-on has `rag_retrieval_status="evaluated"` and non-empty `rag_top_3_evidence` when retrieval returns evidence.
- Token and cost fields are numeric and non-zero when estimates are available.
- Fallback backend examiner events are ignored by MAPR retrieval aggregation.
- Generated containers and unneeded images are cleaned up safely.

Alternative considered: rerun the full paper matrix immediately. That wastes time and compute if the instrumentation path is still broken.

## Risks / Trade-offs

- Real examiner event still missing -> fail the smoke run with a diagnostic listing services/events seen for that build request.
- Examiner runs but retrieval returns no evidence -> mark retrieval as `no_evidence` and fail only RAG-on acceptance that explicitly requires evidence.
- Redaction allowlist leaks secrets via a poorly named field -> allow only numeric values for usage-token keys and keep string/object values redacted unless explicitly safe.
- Completion token estimate differs from provider billing -> tag `usage_source="estimate"` and keep cost fields named estimates.
- A future run switches MetaClaw or another path away from Gemini 2.5 Flash -> require the benchmark config to update the effective model and price table before accepting cost estimates.
- Image cleanup removes reusable project images -> cleanup only generated MCP containers/images or Docker dangling images unless the user explicitly approves broader pruning.

## Migration Plan

1. Update redaction and usage normalization tests first.
2. Update LangGraph routing and event persistence so benchmark API-doc creates pass through examiner and record `langgraph-agent` evidence.
3. Update runner/exporter validation to reject missing real RAG evidence and missing/redacted usage for the one-build smoke.
4. Run one `dynamic-rag-on` JSONPlaceholder build, export reports, and inspect the correlated JSONL/CSV fields.
5. Clean up the generated MCP container and no-longer-needed generated/dangling images.
6. Commit after each completed sub-unit if tests pass and the working tree only contains that unit's intended changes.

Rollback is to disable the strict smoke validation and revert the instrumentation changes; existing build functionality should remain compatible because the public chat/build API is unchanged.
