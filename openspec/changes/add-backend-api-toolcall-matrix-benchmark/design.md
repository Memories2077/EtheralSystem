## Context

EtheralSystem already has two relevant paths: `run-paper-mvp-benchmark.ts` builds MCP servers for a frozen dataset, and `run-headless-mcp-tool-validation.ts` proves generated tools can be invoked through backend chat without Playwright. Existing reports are useful but not yet a paper-ready ablation matrix because they do not combine live-callable cases, static/dynamic skill-selection variants, RAG on/off variants, repeated runs, tool-call outcomes, and estimated token usage in one reproducible flow.

The benchmark must avoid browser noise. It should still exercise the real backend, LangGraph, mcp-gen, generated MCP runtime, metadata route, research metrics, and tool invocation path.

## Goals / Non-Goals

**Goals:**

- Produce repeatable backend API E2E benchmark results for 4 live-public API cases across a 2x2 static/dynamic skill-selection and RAG on/off matrix.
- Measure build success, metadata readiness, live tool-call pass rate, skipped coverage, latency, and estimated token usage.
- Export paper-friendly CSV and Markdown tables while preserving raw JSONL evidence.
- Enforce `RAG_ENABLED` as an actual runtime behavior switch before interpreting RAG ablation results.

**Non-Goals:**

- Do not replace the existing Playwright JSONPlaceholder validation; it remains UI smoke coverage.
- Do not add provider billing-cost accounting in this change.
- Do not use private credentials or auth-required tool calls as primary benchmark probes.
- Do not change existing public route contracts.

## Decisions

1. **Use backend API E2E as the benchmark source of truth.**
   - The runner will build through `POST /chat`, connect through `POST /mcp/metadata`, and probe tools through follow-up `POST /chat` with `mcpServers`.
   - Alternative considered: Playwright E2E. It validates UI behavior but adds browser/localStorage timing noise and is slower to replay.

2. **Use 4 live-public cases for primary paper metrics.**
   - Cases: JSONPlaceholder, HTTPBin, Rick and Morty API, and TheDogAPI public GET subset.
   - Alternative considered: use the existing 8-case frozen dataset. It is better for generation robustness, but several cases use `*.example.test` or auth-required APIs that would distort live tool-call pass rate.

3. **Represent variants as a 2x2 matrix.**
   - Variants are `static-rag-off`, `static-rag-on`, `dynamic-rag-off`, and `dynamic-rag-on`.
   - The benchmark orchestration must run each variant as an isolated environment phase because the relevant flags are process/container environment values, not per-request toggles.

4. **Treat token cost as estimated usage.**
   - Reports will use existing fields such as prompt token estimates, LLM call counts, skill token totals, and skill `tokenCost`.
   - Alternative considered: provider billing usage. It is more exact but requires provider-specific usage capture and is out of scope for this benchmark iteration.

5. **Skip unsafe or auth-required tool probes explicitly.**
   - Metadata tools that require secrets, mutation that cannot be safely called, or endpoints outside the public subset will be counted as skipped with safe diagnostics.
   - Skipped tools affect coverage but do not count as failed live-callable probes.

## Risks / Trade-offs

- **Live public APIs can be flaky** -> Record network/API failures separately from generation failures and keep raw outcomes for reruns.
- **Variant env may not affect already-running containers** -> Recreate or restart affected services per variant phase and record the effective flags in every run.
- **RAG off may still route through examiner logic** -> Add an explicit runtime bypass that returns empty RAG context and logs disabled retrieval.
- **Generated tool names vary by model** -> Probe planning should match tools by safe operation intent and metadata, then fall back to conservative skips with diagnostics.
- **48 full runs can be slow and costly** -> Support `--limit`, `--variants`, and `--repeats` for smoke runs while keeping the default paper matrix fixed.
