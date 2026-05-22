## Why

The latest MAPR paper evidence shows RAG retrieval, token, and cost tables are not trustworthy: RAG metrics are derived from backend fallback events instead of real `agent-service` examiner events, token fields are redacted into non-numeric values, and cost fields are not emitted or derived. This change makes the benchmark fail when required evidence is missing and records enough safe usage data to verify a single build before rerunning larger matrices.

## What Changes

- Require RAG-on benchmark runs to use real `langgraph-agent` examiner evidence for retrieval metrics instead of backend fallback events.
- Preserve safe numeric token metrics during research redaction while continuing to redact secrets such as API keys, bearer tokens, JWTs, cookies, and raw private inputs.
- Derive estimated cost for every benchmark LLM path from normalized usage using the effective Gemini 2.5 Flash price: `$0.30 / 1M` text input tokens and `$2.50 / 1M` text output tokens, including MetaClaw calls because the current MetaClaw backend also runs Gemini 2.5 Flash.
- Add explicit usage/evidence completeness status so missing or redacted usage is reported as unavailable, not as zero usage or zero cost.
- Add a one-build smoke verification path that proves RAG evidence, token estimates, and cost estimates are present before larger paper runs.
- Add cleanup steps for generated MCP containers and no-longer-needed images after smoke verification.
- Document an implementation workflow that commits after each completed sub-unit when the work is ready.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `research-metrics-mvp`: research event recording, redaction, RAG evidence, and usage/cost normalization requirements change.
- `backend-api-toolcall-matrix-benchmark`: benchmark validation, one-build smoke acceptance, and cleanup requirements change.

## Impact

- Affected services: `chatbot-backend`, `agent-service`, `mcp-gen`, Mongo/JSONL research event storage.
- Affected scripts: backend tool-call matrix runner, MAPR metric helpers, report exporter, and cleanup utilities.
- Affected outputs: `research-events.jsonl`, run JSONL records, `toolcall_matrix_runs.csv`, grouped usage tables, `rag_retrieval_by_variant.csv`, and Markdown summaries.
- No public product API changes are expected; changes are limited to research instrumentation, benchmark validation, and generated artifact cleanup.
