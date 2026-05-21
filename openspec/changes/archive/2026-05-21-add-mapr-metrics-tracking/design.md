## Context

The research pipeline already runs a backend MCP generation matrix for the four paper variants: `static-rag-off`, `static-rag-on`, `dynamic-rag-off`, and `dynamic-rag-on`. The current event pipeline records correlated build, metadata, tool validation, RAG, latency, and estimated usage evidence, and the exporter already writes run-level CSVs plus grouped summary tables.

This change keeps that pipeline intact and adds a lightweight evaluation layer around the existing run records. The current API-doc cases are `input/jsonplaceholder.txt`, `input/dummyjson.txt`, and `input/pokeapi.txt`; all declared endpoints in those cases are in scope for quality scoring.

## Goals / Non-Goals

**Goals:**

- Add label data that can support endpoint coverage, hallucinated tool rate, schema validity, and RAG retrieval metrics.
- Capture safe top-3 RAG retrieval evidence and token counts for RAG-on variants.
- Normalize estimated token and cost fields so per-successful-server ratios can be computed consistently.
- Export per-variant quality, retrieval, and ablation tables for the 2x2 matrix.
- Keep implementation small enough for a one-week paper run and preserve existing JSONL/event storage.

**Non-Goals:**

- Replace the existing benchmark runner, research event recorder, or report exporter.
- Introduce provider billing claims; all cost and token values remain estimates.
- Persist raw prompts, private documents, secrets, full API responses, or full RAG chunks.
- Add a new UI or dashboard workflow.
- Change the four matrix variant IDs.

## Decisions

### Store labels beside the matrix dataset

Add label fields to `backend_toolcall_matrix_dataset.json` or a small companion fixture loaded by `run-backend-toolcall-matrix.ts`. Each expected operation will carry a stable operation id, method/path, expected tool aliases, required parameter/schema hints, auth requirement, and relevant RAG evidence labels.

Rationale: the runner already materializes cases from this dataset, so labels stay versioned with the benchmark inputs and can be read by both the runner and exporter. A companion fixture is acceptable if embedding labels makes the dataset difficult to review.

Alternative considered: infer labels from the input docs at export time. That is too brittle for paper metrics because expected aliases, schema hints, and evidence relevance need human-authored ground truth.

### Implement deterministic evaluators in `scripts/research`

Add focused helper modules for quality and metric formulas rather than extending the exporter with all matching logic inline. The evaluator should use normalized names, declared aliases, generated metadata tool names/descriptions, and available schema/argument metadata. It should emit aggregate counts and rates, plus compact per-operation diagnostics.

Rationale: metric formulas need isolated fixture tests and will be reused by the runner and exporter. Keeping them deterministic avoids LLM-as-judge variance for the one-week run.

Alternative considered: ask an LLM to judge operation coverage and schemas. That would add cost, latency, and another uncontrolled variable to the experiment.

### Emit RAG evidence as hashes and labels

When RAG is enabled, record only top-3 evidence hashes/labels, `rag_returned_count`, and `rag_context_tokens`. The retrieval metric code will compare these safe identifiers to `relevantRagEvidence` labels and compute precision@3, recall@3, and MRR@3. RAG-off runs should record retrieval metrics as not applicable instead of zero-valued failures.

Rationale: this supports retrieval quality metrics without storing raw retrieved chunks or private text in research events.

Alternative considered: persist full retrieved snippets for later manual inspection. That increases data retention risk and is not required for aggregate paper tables.

### Normalize token and cost estimates at run aggregation time

Continue collecting token/cost evidence from existing events when present, but normalize run records and exports to snake_case fields: `estimated_prompt_tokens`, `estimated_completion_tokens`, `estimated_total_tokens`, and `estimated_cost_usd`. Derived ratio fields should be computed only where the denominator is non-zero.

Rationale: events currently use mixed naming from different stages. Normalizing at aggregation keeps instrumentation changes small and makes CSV columns stable.

Alternative considered: require every event producer to emit identical fields before export. That creates a larger cross-service migration and is unnecessary for estimates.

### Add exporter tables for variant and ablation analysis

Extend run-level CSVs with the new raw columns and add:

- `quality_by_variant.csv`
- `rag_retrieval_by_variant.csv`
- `ablation_effects.csv`

Update `summary.md` with a 2x2 variant table and derived `rag_uplift` and `static_vs_dynamic_success_delta` for core metrics.

Rationale: the paper needs per-cell metrics and simple deltas. Keeping derived effects in an explicit file avoids hiding formulas in prose.

Alternative considered: export only a larger raw run table and calculate deltas manually. That is error-prone during repeated experiment runs.

## Risks / Trade-offs

- Label drift from input docs -> Validate that every expected operation corresponds to a declared input-doc endpoint before builds start.
- Alias matching overcounts weak tool names -> Require deterministic matching precedence and include per-operation match diagnostics in fixture tests.
- Generated tools may expose incomplete schemas -> Count schema validity only for mapped tools and preserve unknown/missing schema diagnostics.
- RAG evidence labels may be unavailable from the current retrieval path -> Fall back to stable content hashes and labels derived from source metadata, then mark missing labels as not relevant instead of storing raw chunks.
- Token/cost estimates may not match provider billing -> Name fields as estimates and state that cost claims are not billing records.
- Small run counts produce noisy deltas -> Export counts with every rate and keep summary language modest.

## Migration Plan

1. Add labels and evaluator helpers behind the existing research scripts.
2. Extend runner records and safe RAG event metrics without changing the event storage contract.
3. Extend exporter outputs and Markdown summary.
4. Add fixture tests before running smoke cells.
5. Run the planned smoke cells: `jsonplaceholder` with `dynamic-rag-on`, then `dynamic-rag-off`.
6. Run the final target matrix only after smoke metrics and exports are readable: 3 API cases x 4 variants x 3 repeats.

Rollback is limited to disabling the new evaluator/export columns or reverting the change; existing raw event recording and matrix execution remain compatible.

## Open Questions

- Should label data live directly inside `backend_toolcall_matrix_dataset.json` or in a separate `backend_toolcall_matrix_labels.json` fixture for easier review?
- What exact cost estimate table should be used per provider/model if event producers do not already emit `estimated_cost_usd`?
