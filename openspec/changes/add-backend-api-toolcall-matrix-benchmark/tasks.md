## 1. Dataset And Variant Setup

- [x] 1.1 Create `experiments/research-metrics/backend_toolcall_matrix_dataset.json` with JSONPlaceholder, HTTPBin, Rick and Morty API, and TheDogAPI public GET subset cases.
- [x] 1.2 Include per-case safe probe definitions, expected API type, public base URL, and skip rules for auth-required or unsafe operations.
- [x] 1.3 Define the four benchmark variants: `static-rag-off`, `static-rag-on`, `dynamic-rag-off`, and `dynamic-rag-on`.
- [x] 1.4 Add CLI options for smoke and paper runs: dataset path, variants, case limit, repeats, provider, model, experiment ID, output path, backend URL, and mcp-gen URL.

## 2. Backend API E2E Runner

- [x] 2.1 Add `scripts/research/run-backend-toolcall-matrix.ts` by reusing build logic from `run-paper-mvp-benchmark.ts` and tool validation logic from `run-headless-mcp-tool-validation.ts`.
- [x] 2.2 Build each case through backend `POST /chat` and capture `traceId`, `sessionId`, `buildRequestId`, generated `serverId`, MCP URL, status, and latency.
- [x] 2.3 Verify generated server readiness through manager status and backend `POST /mcp/metadata` before running tool probes.
- [x] 2.4 Match metadata tools to safe case probes and submit follow-up backend `POST /chat` requests with `mcpServers: [generatedMcpUrl]`.
- [x] 2.5 Persist per-run JSONL records with build status, metadata status, tool outcome counts, skipped reasons, latency, effective flags, and estimated token fields.
- [x] 2.6 Add `research:toolcall-matrix` package script for the new runner.

## 3. Variant Runtime Behavior

- [x] 3.1 Ensure each variant phase applies its environment flags to the services that read them, including mcp-gen and LangGraph.
- [x] 3.2 Implement `RAG_ENABLED=false` in the LangGraph generation path so vector retrieval and structured RAG extraction are bypassed and empty RAG context is passed to generation.
- [x] 3.3 Preserve existing examiner/RAG behavior when `RAG_ENABLED=true`.
- [x] 3.4 Record effective variant flags in benchmark run records and research events so exported results cannot be mislabeled.

## 4. Reporting

- [x] 4.1 Extend `scripts/research/export-research-report.ts` or add a dedicated exporter to aggregate backend tool-call matrix runs.
- [x] 4.2 Export CSV and Markdown tables grouped by variant, case, API type, skill-selection mode, and RAG mode.
- [x] 4.3 Include build success rate, metadata readiness rate, tool-call pass rate, skipped coverage, latency percentiles, and estimated token usage in exported summaries.
- [x] 4.4 Keep raw diagnostics safe by redacting secrets and excluding raw private prompts, JWTs, API keys, cookies, and full raw API responses.

## 5. Verification And Documentation

- [x] 5.1 Add focused tests or dry-run assertions for dataset loading, variant expansion, safe probe matching, skip classification, and aggregate metric calculations.
- [x] 5.2 Run a smoke benchmark with 1 case, 1 variant, and 1 repeat against the local stack.
- [ ] 5.3 Run the full 4 case x 4 variant x 3 repeat matrix when credentials and time budget are available.
- [x] 5.4 Document the benchmark runbook, smoke command, full paper command, output files, and metric definitions.
