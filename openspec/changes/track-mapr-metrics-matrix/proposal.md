## Why

Gemini embedding support is now integrated, so the MAPR evaluation needs a paper-ready rerun that proves the full 3 API-doc x 4 variant x 3 repeat matrix is complete and exportable. The current pipeline can produce many of the required metrics, but the final run must fail fast on missing variants, missing RAG evidence, or incomplete report columns instead of producing partial paper data.

## What Changes

- Add a strict matrix completion gate for the final MAPR run target: 3 checked-in API-doc cases, 4 fixed variants, and 3 repeats for 36 planned build attempts.
- Require a smoke-first workflow using `jsonplaceholder-input-doc` x `dynamic-rag-on` before the full matrix, with Gemini-backed RAG evidence and usage/cost evidence validation.
- Ensure the runner and exporter reject or mark incomplete results when any of the 4 variants is missing, any selected API-doc batch is incomplete, or RAG-on runs lack real examiner retrieval evidence.
- Preserve the existing event pipeline while allowing focused fixes when smoke or matrix validation exposes defects.
- Require final reports to include run-level metric completeness, variant-level quality and retrieval CSVs, ablation deltas, and a Markdown 2x2 summary table for the fixed variants.
- Add or update tests around matrix plan validation, metric completeness checks, RAG evidence completeness, and exporter output shape.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `backend-api-toolcall-matrix-benchmark`: require a strict smoke-first and full 36-run MAPR execution shape with all 4 variants, all selected API docs, repeat counts, Gemini RAG evidence, and export completeness validation.
- `research-metrics-mvp`: require final MAPR exports to surface metric/evidence completeness and to exclude incomplete RAG, token, or cost values from aggregate denominators.

## Impact

- Affected runner: `scripts/research/run-backend-toolcall-matrix.ts` and related matrix planning, smoke, validation, cleanup, and export invocation logic.
- Affected reports: existing research report exporters and generated files under `experiments/research-metrics/reports/` or `reports/`.
- Affected labels/fixtures: current API-doc fixtures for `jsonplaceholder`, `dummyjson`, and `pokeapi`, plus their expected operation and relevant RAG evidence labels.
- Affected tests: Bun tests for matrix plan validation, metric formulas, RAG evidence completeness, usage/cost normalization, and exporter fixture outputs.
- Affected workflow: if a smoke or matrix subunit fails, the implementation may patch the smallest relevant defect and commit each completed subunit before continuing.
