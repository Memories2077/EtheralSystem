## Why

The current research pipeline can run the 2x2 static/dynamic by RAG on/off matrix, but the exported paper evidence is still too coarse for MAPR-style quality, retrieval, token, and ablation analysis. Adding explicit labels, retrieval evidence, normalized token/cost estimates, and variant-level exports makes one-week paper runs auditable without replacing the existing event pipeline.

## What Changes

- Extend the benchmark dataset labels with expected operations, expected tool-name aliases, required parameter/schema hints, auth requirements, and relevant RAG evidence labels.
- Add a lightweight quality evaluator that maps generated MCP tools to expected operations and computes endpoint coverage, hallucinated tool rate, and schema validity.
- Add RAG retrieval evidence tracking for RAG-on runs, including top-3 evidence hashes/labels, context token estimates, returned counts, precision@3, recall@3, and MRR@3.
- Normalize estimated prompt, completion, total token, and cost fields in raw run records and exports, including per-successful-server token and cost ratios.
- Extend report export with richer run-level columns plus `quality_by_variant.csv`, `rag_retrieval_by_variant.csv`, `ablation_effects.csv`, and a Markdown 2x2 matrix with derived uplift deltas.
- Add focused fixture/unit coverage for metric formulas, quality mapping, schema checks, RAG retrieval metrics, and exporter output.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `research-metrics-mvp`: require labeled quality, RAG retrieval, normalized token/cost, and ablation metrics in raw research records and paper exports.
- `backend-api-toolcall-matrix-benchmark`: require the 2x2 matrix runner to preserve labels and per-variant evidence needed for MAPR metric calculation across the current three checked-in API-doc cases.

## Impact

- Affected dataset and labels: `experiments/research-metrics/backend_toolcall_matrix_dataset.json`, `input/*.txt`, and any new safe label/evidence fixture files.
- Affected scripts: `scripts/research/run-backend-toolcall-matrix.ts`, `scripts/research/export-research-report.ts`, and new focused evaluator/metric helper modules under `scripts/research/`.
- Affected events: existing research event payloads for RAG/examiner, chat/build completion, metadata checks, and tool validation will gain safe aggregate fields only.
- Affected reports: existing CSV and Markdown exports gain columns; new aggregate CSVs are added for quality, retrieval, and ablation effects.
- Affected tests: Bun unit tests for metric formulas, evaluator mapping, RAG metrics, and exporter fixtures.
