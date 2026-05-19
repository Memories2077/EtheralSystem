# Dashboard Run Controls Validation

Use this path when validating dashboard-created MCP runs manually.

## Preconditions

- Docker stack is running with research metrics enabled.
- `RESEARCH_EXPERIMENT_ID` and `NEXT_PUBLIC_RESEARCH_EXPERIMENT_ID` are set to the same dashboard experiment id.
- `RESEARCH_EVENTS_JSONL_PATH` points at the evidence JSONL path you want to export.

## Browser Smoke

1. Start the app stack:
   ```bash
   docker compose up -d --build
   ```
2. Open the dashboard and set a unique experiment id.
3. Toggle static/dynamic skill selection and RAG on/off.
4. Submit a build prompt from chat.
5. Capture the `POST /chat` request payload. It should include:
   - `experimentId`
   - `traceId`
   - `sessionId`
   - `buildRequestId`
   - `ragEnabled`
   - `dynamicSkillSelection`
   - `skillSelectionVariant`
   - `variantId`

## Expected Evidence

- The dashboard variant badge matches the `variantId` in the `POST /chat` payload.
- The generated MCP server appears in the dashboard server list with matching RAG and skill-selection flags.
- `mcp_create_completed` events include build latency and effective variant flags.
- `mcp_metadata_checked` events include metadata readiness, tool count, and dashboard correlation ids.
- If tool validation has not been run, exported report rows show tool validation as `unknown` rather than failed.
- If tool validation is run and every tool is skipped, pass-rate denominator remains empty and skipped coverage is reported.

## Export

```bash
bun scripts/research/export-research-report.ts \
  --experiment-id=<dashboard-experiment-id> \
  --events=<research-events-jsonl-path> \
  --output-dir=reports/dashboard-run-controls-validation
```

Expected files:

- `dashboard_runs.csv`
- `toolcall_matrix_runs.csv`
- `toolcall_by_variant.csv`
- `toolcall_by_rag.csv`
- `summary.md`
