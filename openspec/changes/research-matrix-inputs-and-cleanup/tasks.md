## 1. Fixture Format And Dataset

- [x] 1.1 Define the shared input-doc fixture format with metadata, declared endpoint count, endpoint sections, request examples, response examples, and safe probe notes.
- [x] 1.2 Rewrite the three checked-in API-doc input files to the shared format with basic CRUD-style endpoint coverage where safe.
- [x] 1.3 Update `experiments/research-metrics/backend_toolcall_matrix_dataset.json` to reference the three formatted fixtures and safe probe mappings.
- [x] 1.4 Add fixture parsing and validation helpers that fail before building when endpoint counts, request examples, or response examples are missing.
- [x] 1.5 Add unit coverage for valid fixtures, endpoint-count mismatch, and missing request/response examples.

## 2. Matrix Planning And Research Command

- [x] 2.1 Add a `bun run research` package script that runs the demo matrix in one command.
- [x] 2.2 Implement a matrix planner that computes selected API docs, the 4 required variants, repeat count, and expected build count.
- [x] 2.3 Make default demo planning execute `1 api doc * 4 variants * 3 repeats = 12` build attempts.
- [x] 2.4 Add an explicit full-mode option for all 3 API docs with the same 4 variants and 3 repeats.
- [x] 2.5 Fail before the first build if the selected variant set omits any required variant or expected build count is inconsistent.

## 3. RAG Variant Enforcement

- [x] 3.1 Ensure variant restarts propagate `RAG_ENABLED=false` to the LangChain application for `static-rag-off` and `dynamic-rag-off`.
- [x] 3.2 Add runtime verification that the active LangChain container/process has the expected `RAG_ENABLED` value before a variant phase starts.
- [x] 3.3 Record a diagnostic and fail the variant phase if RAG-off is requested but LangChain retrieval remains enabled.
- [x] 3.4 Add regression coverage for RAG-on and RAG-off environment construction.

## 4. MCP Tool Validation

- [x] 4.1 Add `@modelcontextprotocol/inspector` or its CLI package to the project dependency path used by Bun.
- [x] 4.2 Implement an Inspector CLI wrapper for `tools/list` against a generated MCP URL.
- [x] 4.3 Implement Inspector `tools/call` probes for safe mapped tools and normalize pass, fail, and skipped outcomes.
- [x] 4.4 Persist Inspector connection status, tool count, safe probe counts, pass rate, and parseable diagnostics in each raw run record.
- [x] 4.5 Add backend direct MCP tool probes as the primary validation gate, without relying on LLM-selected tool calls.

## 5. Generated Container Tracking And Cleanup

- [x] 5.1 Capture generated `serverId`, MCP URL, and Docker `containerId` from manager status, events, or unambiguous Docker metadata.
- [x] 5.2 Add cleanup logic that removes only the generated MCP server container for the current run.
- [x] 5.3 Run cleanup only after successful validation and retain failed generated containers for inspection without masking the original build or validation error.
- [x] 5.4 Persist cleanup status, cleanup latency, removed/skipped/failed counts, and cleanup error text when present.
- [x] 5.5 Add tests for successful cleanup, missing container identity, cleanup failure, and preserving baseline Compose services.

## 6. Export And Metrics

- [x] 6.1 Extend raw run records with `apiDocId`, fixture path, declared endpoint count, expected build count, variant, repeat, Inspector metrics, and cleanup metrics.
- [x] 6.2 Extend `scripts/research/export-research-report.ts` to emit batch-scoped CSV and Markdown reports per completed API doc.
- [x] 6.3 Ensure repeated export calls preserve or deterministically replace the same batch report without overwriting other API-doc batches.
- [x] 6.4 Include build success rate, metadata readiness rate, Inspector pass rate, backend tool-call pass rate when available, skipped coverage, latency percentiles, and cleanup success rate in exports.

## 7. Demo Verification

- [x] 7.1 Run focused unit/type tests for fixture parsing, planner counts, Inspector wrapper normalization, RAG env construction, cleanup, and export formatting.
- [x] 7.2 Run `bun run research -- --smoke` for one A-Z build and confirm dry-runs still plan the 12-build demo and 36-build full matrix.
- [x] 7.3 Confirm the smoke exports reports immediately after the API-doc batch completes.
- [x] 7.4 Confirm no generated MCP server containers from the successful smoke remain running after completion.
- [x] 7.5 Document the demo command, full three-doc command, required environment variables, and cleanup troubleshooting notes.
