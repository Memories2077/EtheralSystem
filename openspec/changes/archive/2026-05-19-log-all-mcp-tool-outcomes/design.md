## Context

Headless MCP validation currently verifies the generated server metadata, selects one generated tool, asks the chatbot backend to use it, and records `mcp_tool_invocation_completed`. The event proves the MCP path works, but it does not show whether the rest of the generated tools are usable.

The validation already has the metadata tool list, shared run identifiers, and research event storage. This change extends that flow with per-tool outcome evidence rather than replacing the existing metrics.

## Goals / Non-Goals

**Goals:**

- Log every generated metadata tool with a machine-readable outcome for the validation run.
- Record aggregate counts for total tools, successful tools, failed tools, and skipped tools.
- Keep event payloads safe by storing names, counts, hashes, statuses, and compact diagnostics instead of raw prompt text, tokens, cookies, or full tool output.
- Make failures actionable by distinguishing tool invocation failure, missing tool result, backend/SSE failure, unusable tool schema, and answer validation failure.

**Non-Goals:**

- Guarantee semantic correctness for every external API operation beyond the validation assertion used for that tool.
- Add a new browser-only UI workflow.
- Introduce a new metrics storage system or external dependency.

## Decisions

- Use the existing headless validation runner as the orchestrator. It already discovers generated tools through `POST /mcp/metadata`, has correlation IDs, and can submit follow-up `POST /chat` requests with the active MCP URL.
- Represent all metadata tools in one summary event and optionally emit per-tool detail events when useful for debugging. The summary is the acceptance source because it gives the exact success/failure counts in one correlated record.
- Validate each eligible tool independently. A single follow-up prompt per tool prevents one failed tool call from hiding later tool results and makes outcome attribution simpler.
- Keep tool output redacted. Store tool name, index, status, error code, invocation/result counts, response hash/length, and short safe diagnostic text only.
- Mark a tool as `skipped` only when the runner cannot safely form a validation prompt for it from metadata. Skipped tools still appear in the logged tool list and count toward total tools.

## Risks / Trade-offs

- Validation runtime increases with tool count -> keep the runner sequential by default for deterministic logs, with a small configurable cap available for local debugging if needed.
- Some tools may require arguments that cannot be inferred from metadata -> record `skipped` with a clear reason instead of silently omitting the tool.
- LLM tool selection can be flaky -> prompt each run with the exact tool name and verify the resulting invocation evidence names the expected tool.
- Large payloads can bloat research events -> cap diagnostic strings and avoid raw tool outputs.
