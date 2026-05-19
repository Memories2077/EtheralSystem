# Backend Tool-Call Matrix Benchmark

This benchmark is the paper-facing backend API E2E runner for generated MCP tool-call metrics. It does not use Playwright. Each run builds through backend `POST /chat`, connects the generated MCP URL through `POST /mcp/metadata`, then probes safe generated tools through follow-up backend `POST /chat` calls with `mcpServers`.

## Cases And Variants

Default cases live in `experiments/research-metrics/backend_toolcall_matrix_dataset.json` and reference the three API documents in `input/`:

- `jsonplaceholder-input-doc` -> `input/jsonplaceholder.txt`
- `reddit-input-doc` -> `input/reddit.txt` plus `input/reddit_auth_information.txt`
- `thedogapi-input-doc` -> `input/thedogapi.txt` plus `input/thedogapi_auth_information.txt`

Default variants are:

- `static-rag-off`
- `static-rag-on`
- `dynamic-rag-off`
- `dynamic-rag-on`

The default paper matrix is 3 cases x 4 variants x 3 repeats = 36 runs.

## Smoke Validation

Validate dataset and variant expansion without network or Docker:

```bash
bun run research:toolcall-matrix --dry-run
```

Run one backend E2E smoke cell against an already configured stack:

```bash
RESEARCH_METRICS_ENABLED=true \
RESEARCH_EXPERIMENT_ID=backend-toolcall-matrix-smoke \
RESEARCH_EVENTS_JSONL_PATH=/repo/reports/backend-toolcall-matrix/research-events.jsonl \
RESEARCH_EVENTS_JSONL_MIRROR=true \
bun run research:toolcall-matrix \
  --experiment-id=backend-toolcall-matrix-smoke \
  --variants=static-rag-off \
  --cases=jsonplaceholder-input-doc \
  --repeats=1 \
  --no-restart-stack
```

## Full Paper Run

The runner can restart Docker Compose per variant so process-level flags are applied to mcp-gen and LangGraph containers:

```bash
bun run research:toolcall-matrix \
  --experiment-id=backend-toolcall-matrix-paper \
  --repeats=3 \
  --restart-stack
```

The runner sets these effective flags for each variant phase:

- `DYNAMIC_SKILL_SELECTION`
- `SKILL_SELECTION_VARIANT`
- `RAG_ENABLED`
- `RESEARCH_METRICS_ENABLED=true`
- `RESEARCH_EXPERIMENT_ID`
- `RESEARCH_EVENTS_JSONL_PATH=/repo/reports/backend-toolcall-matrix/research-events.jsonl`
- `RESEARCH_EVENTS_JSONL_MIRROR=true`

## Export

```bash
bun run research:export \
  --experiment-id=backend-toolcall-matrix-paper \
  --events=/repo/reports/backend-toolcall-matrix/research-events.jsonl \
  --matrix-runs=experiments/research-metrics/backend-toolcall-matrix-runs.jsonl \
  --output-dir=experiments/research-metrics/reports/backend-toolcall-matrix-paper
```

Important outputs:

- `toolcall_matrix_runs.csv`
- `toolcall_by_variant.csv`
- `toolcall_by_case.csv`
- `toolcall_by_api_type.csv`
- `toolcall_by_skill_selection.csv`
- `toolcall_by_rag.csv`
- `summary.md`

## Metrics

- `build_success_rate`: generated server build completed for the run.
- `metadata_readiness_rate`: generated MCP metadata connected and returned tools.
- `tool_call_pass_rate`: successful live-callable tool probes divided by attempted live-callable probes.
- `skipped_coverage`: skipped metadata tools divided by total metadata tools.
- `estimated_prompt_tokens`, `estimated_completion_tokens`, `llm_call_count`, `selected_skill_tokens`: estimated usage metrics, not provider billing.

For Reddit and auth-required TheDogAPI tools, the checked-in auth files document the credential format only. The benchmark includes that auth context in the generation input, but live tool probes skip tools that require unavailable user credentials so pass-rate does not penalize missing secrets.
