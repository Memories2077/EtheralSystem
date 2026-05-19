## Why

The current headless MCP validation proves that at least one generated tool can be invoked, but it does not show coverage across the generated tool list. This makes it hard to diagnose how many generated tools succeed, fail, or were skipped in a validation run.

## What Changes

- Add per-tool validation logging for generated MCP tools discovered from metadata.
- Record aggregate tool outcome counts, including total, success, failure, and skipped counts.
- Preserve the existing single-tool invocation evidence while adding a fuller validation summary for all eligible tools.
- Avoid logging secrets, raw prompts, tokens, cookies, or full raw tool output.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `mcp-flow-validation`: Headless MCP validation must log machine-readable per-tool outcomes and aggregate success/failure counts for generated tools.

## Impact

- Backend MCP invocation metrics and research event payloads.
- Headless validation runner output and acceptance checks.
- Focused backend and validation tests for per-tool outcome accounting and redaction.
