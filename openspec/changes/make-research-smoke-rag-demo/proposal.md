## Why

The research smoke command currently plans a one-build demo with `static-rag-off`, which does not exercise the RAG/Gemini embedding path that now matters after the provider migration. We need the default smoke to prove one RAG-enabled demo build before larger matrix runs.

## What Changes

- Change `bun run research -- --smoke` to default to one `jsonplaceholder-input-doc` build using `dynamic-rag-on`.
- Preseed the selected RAG-on input document into the Gemini Chroma collection before smoke build execution so a clean collection can produce retrieval evidence on the first run.
- Treat missing RAG retrieval evidence or missing precision/recall/MRR metrics as a strict smoke failure for RAG-on runs.
- Keep explicit CLI overrides for cases, variants, repeats, provider, model, outputs, and stack behavior unchanged.
- Preserve the default non-smoke demo matrix and full paper matrix behavior.
- Add focused dry-run/unit coverage that proves smoke now plans one RAG-enabled demo build.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `backend-api-toolcall-matrix-benchmark`: The default research smoke shape changes from one RAG-off build to one RAG-on demo build.

## Impact

- Affected code: `scripts/research/run-research.ts`, `scripts/research/run-backend-toolcall-matrix.ts`, `apps/langChain-application/my_agent/scripts/seed_research_rag.py`, and focused research runner tests.
- Affected commands: `bun run research -- --smoke` and `bun run research -- --dry-run --smoke`.
- No public API, database schema, Docker service, or embedding adapter changes.
