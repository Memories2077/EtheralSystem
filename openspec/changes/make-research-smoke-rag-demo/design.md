## Context

`bun run research` already supports the full 2x2 static/dynamic by RAG on/off matrix, and `--smoke` narrows execution to one build. After the embedding provider migration, the valuable smoke is the one that exercises RAG with Gemini embeddings, but the current smoke default still selects `static-rag-off`.

The existing runner already supports `dynamic-rag-on`; this change only adjusts the default smoke selection and keeps explicit CLI overrides intact.

## Goals / Non-Goals

**Goals:**

- Make `bun run research -- --smoke` plan exactly one `jsonplaceholder-input-doc` build with RAG enabled.
- Use the existing `dynamic-rag-on` variant so the smoke covers dynamic skill selection plus RAG evidence.
- Preserve explicit `--variants`, `--cases`, and `--repeats` overrides.
- Preserve the default non-smoke demo matrix and full matrix counts.

**Non-Goals:**

- Do not change Gemini embedding adapter behavior.
- Do not change Docker Compose services or Dockerfile contents.
- Do not change report aggregation semantics for the 2x2 matrix.

## Decisions

- Default smoke variant becomes `dynamic-rag-on`.
  - Rationale: OpenSpec already treats the one-build smoke as RAG evidence validation, and this is the smallest change that makes the default smoke exercise the Gemini embedding path.
  - Alternative considered: add a second smoke mode flag. Rejected because the user needs one demo build with RAG, not another option.

- Keep all explicit runner overrides authoritative.
  - Rationale: Existing debugging workflows may intentionally run `--smoke --variants=static-rag-off`; changing only the default avoids breaking those commands.
  - Alternative considered: force all smoke runs to RAG-on. Rejected because it would remove useful targeted ablation checks.

- Test the behavior through dry-run planning rather than a live build in unit coverage.
  - Rationale: planning is the behavior being changed; live Gemini/RAG validation remains an acceptance smoke that depends on credentials and local services.

## Risks / Trade-offs

- RAG-on smoke requires valid Gemini credentials and Chroma availability when run live -> keep dry-run tests credential-free and document live smoke prerequisites in tasks.
- Some existing notes may assume smoke means `static-rag-off` -> update only the canonical spec and tests touched by this change, leaving explicit RAG-off smoke commands valid.
