## 1. Labels And Fixtures

- [x] 1.1 Choose whether MAPR labels live in `backend_toolcall_matrix_dataset.json` or a companion labels fixture, and document the chosen fixture shape in code comments or tests.
- [x] 1.2 Add expected operation labels for `jsonplaceholder-input-doc`, including operation ids, method/path, aliases, required params/schema hints, auth requirement, and relevant RAG evidence labels.
- [x] 1.3 Add expected operation labels for `dummyjson-input-doc` with the same required fields.
- [x] 1.4 Add expected operation labels for `pokeapi-input-doc` with the same required fields.
- [x] 1.5 Extend fixture validation so every expected operation label maps to a declared input-doc endpoint before any build starts.

## 2. Metric Formula Helpers

- [x] 2.1 Add deterministic helpers for rate calculation, percentile reuse, nullable denominator handling, and per-successful-server token/cost ratios.
- [x] 2.2 Add quality evaluator helpers that map generated metadata tools to expected operation labels using normalized tool names, aliases, and safe metadata.
- [x] 2.3 Add schema validity checks for mapped tools using required parameter and schema hints where generated tool metadata exposes arguments or input schema.
- [x] 2.4 Add RAG retrieval metric helpers for precision@3, recall@3, and MRR@3 using ranked evidence labels or hashes.
- [x] 2.5 Add unit tests for metric formulas, zero-denominator behavior, quality mapping, hallucinated tool detection, schema validity, and RAG retrieval metrics.

## 3. Runner Evidence Capture

- [x] 3.1 Extend `run-backend-toolcall-matrix.ts` types and case materialization to load expected operation and RAG evidence labels.
- [x] 3.2 Evaluate generated metadata tools after metadata validation and persist quality inputs plus `endpoint_coverage`, `hallucinated_tool_rate`, and `schema_validity_rate` in each run record.
- [x] 3.3 Capture or derive `estimated_prompt_tokens`, `estimated_completion_tokens`, `estimated_total_tokens`, and `estimated_cost_usd` in each run record.
- [x] 3.4 Capture safe top-3 RAG evidence labels/hashes, `rag_context_tokens`, and `rag_returned_count` for RAG-on runs.
- [x] 3.5 Mark RAG retrieval metrics as not applicable for RAG-off runs while preserving the disabled-retrieval diagnostic.

## 4. Exporter Updates

- [x] 4.1 Extend `export-research-report.ts` run-level CSV rows with build, metadata, handshake, tool-call, compile/start, quality, retrieval, latency, token, and estimated cost columns.
- [x] 4.2 Add `quality_by_variant.csv` grouped by the four variant IDs with counts and quality rates.
- [x] 4.3 Add `rag_retrieval_by_variant.csv` for RAG-on variants with precision@3, recall@3, MRR@3, evidence counts, and denominators.
- [x] 4.4 Add `ablation_effects.csv` computing `rag_uplift` and `static_vs_dynamic_success_delta` for core metrics.
- [x] 4.5 Update `summary.md` generation with the 2x2 variant table and uplift/delta sections.
- [x] 4.6 Add exporter fixture tests that assert the new CSV filenames, columns, and Markdown sections.

## 5. Smoke And Paper Run Verification

- [x] 5.1 Run focused Bun tests for matrix labels, evaluator helpers, RAG metrics, and exporter fixtures.
- [ ] 5.2 Run a smoke cell for `jsonplaceholder-input-doc` with `dynamic-rag-on` and verify quality, retrieval, token/cost, and report outputs.
- [ ] 5.3 Run a second smoke cell for `jsonplaceholder-input-doc` with `dynamic-rag-off` and verify RAG-off metrics are marked not applicable instead of failed.
- [x] 5.4 Confirm dry-run planning still supports the final 3 API cases x 4 variants x 3 repeats target.
- [ ] 5.5 Run the final paper matrix only after smoke exports are readable, then archive the generated reports for analysis.
