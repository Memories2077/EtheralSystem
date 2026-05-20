## Why

The current research runner can exercise the backend tool-call matrix, but the input fixtures, repeat semantics, MCP validation, and generated-container cleanup are not strict enough for long paper runs. This change makes the benchmark deterministic for repeated `bun run research` execution and prevents accumulated generated MCP server containers from consuming memory.

## What Changes

- Replace ad hoc research input content with three checked-in API-doc input files that share one parseable format.
- Require each input file to contain declared endpoint counts plus request and response examples for every endpoint.
- Ensure the initial demo path can run 12 builds from `3 repeats * 4 variants * 1 api doc`, while preserving the path to run all three API docs later.
- Add an orchestrated `bun run research` flow that builds, validates, records metrics, cleans generated containers, and exports after each completed API-doc batch.
- Track the generated MCP server container identity for every run and remove it only after successful validation, leaving failed validation containers available for inspection.
- Add backend direct MCP tool-call probes as the validation gate and evaluate `@modelcontextprotocol/inspector` CLI mode as diagnostic protocol validation when available.
- Ensure `rag-off` variants disable RAG in the LangChain application path, not only in Bun-side runner metadata.
- Keep implementation split across focused Bun scripts/modules instead of forcing all research logic into one large TypeScript file.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `backend-api-toolcall-matrix-benchmark`: tighten dataset fixture format, repeat/variant run counts, per-API-doc export behavior, and the single-command research runner contract.
- `mcp-flow-validation`: add generated container ID tracking, post-test MCP container cleanup, and Inspector CLI validation as a first-class validation path.
- `research-metrics-mvp`: add reporting fields for API-doc batch exports, Inspector validation results, and cleanup outcomes.

## Impact

- Affected scripts: `scripts/research/run-backend-toolcall-matrix.ts`, `scripts/research/export-research-report.ts`, and new helper modules under `scripts/research/` as needed.
- Affected fixtures: `experiments/research-metrics/backend_toolcall_matrix_dataset.json` and `input/*.txt` or a replacement fixture directory for the three formatted input docs.
- Affected runtime paths: Docker manager generated MCP server lifecycle, LangChain RAG environment handling, and package scripts in `package.json`.
- Dependency risk: `@modelcontextprotocol/inspector` has CLI mode, but implementation must verify exact command behavior against generated HTTP MCP servers before making it the only success-rate source.
