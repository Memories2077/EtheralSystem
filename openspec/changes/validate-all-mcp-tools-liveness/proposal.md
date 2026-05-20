## Why

The current research validation counts only a small safe-probe subset, so a generated MCP server can expose valid tools that are never tested. For the paper benchmark, the primary runtime question is whether every generated MCP tool is invokable through the backend MCP path, even when the upstream API returns an expected business-level failure such as not found or invalid credentials.

## What Changes

- Change generated-tool validation from safe-subset business-success checks to all-tool invocation liveness checks.
- Add benchmark probes for every generated JSONPlaceholder CRUD tool, including update and delete operations that were previously skipped as `unsafe_mutation`.
- Add dummy-credential probes for auth-required input docs so generated Reddit and TheDogAPI tools can be tested for MCP liveness without needing real credentials.
- Treat normal tool returns and accepted upstream API failures as validation passes when they prove the MCP tool invoked and returned a controlled result.
- Treat MCP/protocol/runtime failures as hard failures, including missing tools, unmatched probes, schema rejection, transport failure, timeout, container crash, and unclassified invocation exceptions.
- Preserve Inspector as diagnostic-only while keeping backend direct MCP probes as the cleanup gate.
- Fix outcome/report semantics so successful direct probes do not retain fallback error codes and all-tool coverage is visible in exported metrics.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `backend-api-toolcall-matrix-benchmark`: change probe coverage requirements from safe live-callable subsets to all generated tools with liveness-oriented probe definitions.
- `mcp-flow-validation`: change backend direct MCP probe success semantics so accepted API-level failures can pass and hard MCP failures still fail cleanup eligibility.
- `research-metrics-mvp`: add reporting requirements for attempted tool coverage, liveness pass counts, accepted API failure counts, and hard failure counts.

## Impact

- Affected dataset and fixtures: `experiments/research-metrics/backend_toolcall_matrix_dataset.json` and the formatted input docs under `input/`.
- Affected validation path: backend `POST /mcp/tool-probes`, direct MCP outcome normalization, and benchmark outcome counting in `scripts/research/run-backend-toolcall-matrix.ts`.
- Affected exports: research JSONL records, CSV/Markdown aggregate summaries, and tests around tool-call pass rate.
- Runtime behavior remains on the chatbot -> LangChain/MetaClaw -> mcp-gen build path; the benchmark still does not call the manager create API directly.
