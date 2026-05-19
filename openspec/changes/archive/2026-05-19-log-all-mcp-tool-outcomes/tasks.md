## 1. Outcome Event Model

- [x] 1.1 Define a safe per-tool outcome shape with tool name, index, status, error code, invocation count, result count, response hash/length, and compact diagnostic.
- [x] 1.2 Add helper logic to aggregate per-tool outcomes into total, attempted, success, failure, and skipped counts.
- [x] 1.3 Persist a correlated `mcp_tool_outcomes_completed` research event with the outcome list and aggregate counts.
- [x] 1.4 Add focused backend tests for count aggregation, failure/skipped classification, and redaction of secrets/raw outputs.

## 2. Headless Validation Runner

- [x] 2.1 Update the headless MCP validation runner to keep the full metadata tool list instead of selecting only `tools[0]`.
- [x] 2.2 Run an independent follow-up chatbot `POST /chat` validation for each eligible metadata tool, using the active generated MCP URL and exact tool name.
- [x] 2.3 Classify every metadata tool as `success`, `failed`, or `skipped`; skipped tools must include a safe reason and still count toward total tools.
- [x] 2.4 Print a compact machine-readable summary with total, attempted, success, failure, skipped, and failed tool names.
- [x] 2.5 Ensure the runner records the full outcome event before failing the process when any attempted tool fails.

## 3. Documentation and Verification

- [x] 3.1 Update headless validation docs with the new outcome event name, summary fields, and failure interpretation.
- [x] 3.2 Run backend unit tests covering MCP invocation/outcome metrics.
- [x] 3.3 Run the MCP generator research metrics/status tests affected by validation evidence.
- [x] 3.4 Build the headless validation runner with Bun and run `openspec validate log-all-mcp-tool-outcomes --strict`.
