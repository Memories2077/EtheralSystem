## 1. Runner Defaults

- [x] 1.1 Change the `--smoke` default variant in `scripts/research/run-research.ts` from `static-rag-off` to `dynamic-rag-on`.
- [x] 1.2 Confirm explicit `--variants`, `--cases`, and `--repeats` overrides still take precedence over smoke defaults.
- [x] 1.3 Preseed selected RAG-on smoke cases into the Gemini Chroma collection before the build starts.
- [x] 1.4 Fail strict RAG-on smoke validation when retrieval evidence or precision/recall/MRR metrics are missing.

## 2. Test Coverage

- [x] 2.1 Add focused coverage that `bun run research -- --dry-run --smoke` plans one `jsonplaceholder-input-doc` build with `dynamic-rag-on`.
- [x] 2.2 Preserve coverage that default non-smoke research still plans the 12-build demo matrix.
- [x] 2.3 Preserve coverage that explicit smoke variants, including `static-rag-off`, remain valid targeted checks.
- [x] 2.4 Add a repeatable RAG seed helper for the Gemini Chroma collection.

## 3. Validation

- [x] 3.1 Run `openspec validate make-research-smoke-rag-demo --strict`.
- [x] 3.2 Run `bun run research -- --dry-run --smoke` and verify it reports one `dynamic-rag-on` build.
- [x] 3.3 Run `bun run research -- --dry-run` and verify it still reports the 12-build demo matrix.
- [x] 3.4 Run focused research tests covering matrix planning and RAG variant environment behavior.
- [x] 3.5 Run `bun run research -- --smoke` and verify `rag_retrieval_status=evaluated` with populated precision, recall, and MRR.
