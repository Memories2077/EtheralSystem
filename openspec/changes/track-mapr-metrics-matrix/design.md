## Context

The repository already has the backend tool-call matrix runner, MAPR metric helpers, report export tables, and Gemini embedding-backed RAG support. This change turns that work into an auditable final run workflow: smoke one RAG-on cell first, fix any defects at the smallest boundary, then run the full 36-build matrix and reject incomplete data before it reaches the paper report.

The fixed variants are `static-rag-off`, `static-rag-on`, `dynamic-rag-off`, and `dynamic-rag-on`. The current full API-doc set is `jsonplaceholder-input-doc`, `dummyjson-input-doc`, and `pokeapi-input-doc`, each repeated 3 times for a total of 36 planned build attempts.

## Goals / Non-Goals

**Goals:**

- Validate the final MAPR plan before building, including case IDs, variant IDs, repeat count, expected build count, labels, and Gemini RAG seeding requirements.
- Require a smoke-first run for `jsonplaceholder-input-doc` x `dynamic-rag-on` with strict examiner RAG evidence and usage/cost evidence.
- Ensure every accepted full matrix result has enough evidence to compute build, metadata, MCP handshake, tool-call, endpoint coverage, hallucination, schema validity, latency, token, cost, and RAG retrieval metrics where applicable.
- Export paper-ready run-level and aggregate artifacts with explicit completeness statuses and denominators.
- Keep defect repair incremental: one smoke/matrix/export subunit can be fixed and committed before continuing to the next subunit.

**Non-Goals:**

- Do not replace the existing research event pipeline or report exporter architecture.
- Do not add nDCG@3 unless graded relevance labels are created separately.
- Do not treat estimated token or cost values as provider billing records.
- Do not broaden beyond the current three simple CRUD-style API-doc fixtures for this run.

## Decisions

1. Use strict validation as the acceptance gate.

   The runner should keep failing fast when `--strict-evidence=true` detects missing real `langgraph-agent` examiner evidence for RAG-on cells or missing numeric usage/cost evidence. The alternative is to let the exporter mark these as null only; that keeps the run moving but risks accepting a paper table with silent gaps.

2. Validate the full matrix plan before the first build.

   The final command should provide `--repeats=3`, the 3 current cases, all 4 variants, and `--expected-build-count=36`. Dry-run or validate-only checks should confirm the plan shape before any service restart or generated container build. The alternative is post-run counting, which wastes time when a flag typo drops a variant.

3. Keep RAG evidence tied to real examiner events.

   RAG retrieval metrics should come from correlated `service="langgraph-agent"` `examiner_completed` events. Backend fallback summaries remain diagnostics only. This preserves the Gemini embedding path as the measured retrieval source.

4. Export completeness alongside aggregate values.

   Reports should include status/count fields such as usage completeness, retrieval applicability/evaluated counts, missing real examiner counts, and denominators for uplift deltas. The alternative is aggregate-only tables, which are shorter but harder to audit.

5. Repair defects in subunits.

   If smoke, matrix planning, RAG evidence, usage normalization, cleanup, or export validation fails, patch the smallest relevant boundary and verify that subunit before continuing. Completed subunits may be committed independently to keep the long run recoverable.

## Risks / Trade-offs

- Long full matrix runtime or provider flakiness -> Run the one-cell smoke first, preserve JSONL outputs, and keep generated containers for failed validation where needed.
- RAG-on retrieval returns fewer than 3 evidence items -> Accept fewer than 3 retrieved items only when metrics can still be computed from ranked evidence and completeness status records the smaller count.
- Usage or cost evidence is partially unavailable -> Mark the run incomplete for usage metrics and exclude unavailable values from aggregate denominators rather than treating them as zero.
- Generated tool names vary across runs -> Use expected operation aliases and schema hints from labels to avoid brittle exact-name matching.
- Cleanup can hide failed-server diagnostics -> Gate cleanup on validation success and retain failed generated containers for inspection.
