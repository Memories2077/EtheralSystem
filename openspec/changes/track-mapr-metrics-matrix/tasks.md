## 1. Matrix Plan Guards

- [x] 1.1 Run a smoke dry-run for `jsonplaceholder-input-doc` x `dynamic-rag-on` with one repeat and verify the plan reports exactly 1 expected build.
- [x] 1.2 Run a final matrix dry-run with the 3 current API-doc cases, all 4 variants, `--repeats=3`, and `--expected-build-count=36`.
- [x] 1.3 Patch matrix planning if it does not fail before build for missing variants, unknown cases, wrong repeat count, or mismatched expected build count.
- [x] 1.4 Add or update tests for matrix plan validation, required variant enforcement, expected build count checks, and selected case validation.

## 2. Smoke Evidence Validation

- [x] 2.1 Run the one-build smoke cell for `jsonplaceholder-input-doc` x `dynamic-rag-on` with RAG pre-seeding and strict evidence enabled.
- [x] 2.2 If smoke fails, patch the smallest failing boundary among Gemini RAG seeding, real examiner evidence correlation, generated tool validation, usage/cost normalization, cleanup, or export invocation.
- [x] 2.3 Verify the accepted smoke run records real `langgraph-agent` `examiner_completed` evidence, precision@3, recall@3, MRR@3, numeric estimated prompt/completion/total tokens, estimated cost, and cleanup status.
- [x] 2.4 Add or update fixture tests for strict evidence validation, RAG retrieval completeness, usage/cost completeness, and failed-cell diagnostics.
- [x] 2.5 Commit the completed smoke subunit if code changed and tests pass.

## 3. Export Completeness

- [x] 3.1 Verify report export writes run-level quality, retrieval, token, cost, evidence status, and cleanup columns for the smoke experiment.
- [x] 3.2 Verify `quality_by_variant.csv`, `rag_retrieval_by_variant.csv`, `ablation_effects.csv`, and `summary.md` contain the required MAPR columns and denominators.
- [x] 3.3 Patch exporter aggregation if incomplete RAG, usage, token, or cost evidence is averaged as zero or silently included in denominators.
- [x] 3.4 Add or update exporter fixture tests for the 2x2 matrix table, RAG uplift, static-vs-dynamic success delta, variant counts, and completeness counts.
- [x] 3.5 Commit the completed export subunit if code changed and tests pass.

## 4. Full MAPR Matrix Run

- [x] 4.1 Start from a clean enough environment for the benchmark services and confirm Gemini embedding credentials, Chroma, backend, manager, and research event paths are configured.
- [x] 4.2 Run the final MAPR matrix for `jsonplaceholder-input-doc`, `dummyjson-input-doc`, and `pokeapi-input-doc` across all 4 variants with 3 repeats and strict evidence enabled.
- [x] 4.3 If a matrix subunit fails, preserve diagnostics, repair the smallest relevant boundary, rerun the affected dry-run or smoke check, and commit that completed subunit before continuing.
- [x] 4.4 Export final reports for the matrix experiment after the full run completes.
- [x] 4.5 Verify the final run has 36 attempted build records, 9 attempted runs per variant, 12 attempted runs per API doc, no missing or duplicate matrix coordinates, and complete report files.

## 5. Final Verification

- [x] 5.1 Run focused Bun tests for MAPR metrics, exporter fixtures, and backend tool-call matrix planning.
- [x] 5.2 Run `openspec status --change track-mapr-metrics-matrix` and confirm the change remains apply-ready.
- [x] 5.3 Summarize final artifact paths, metric completeness counts, ablation deltas, and any excluded incomplete evidence for paper reporting.
