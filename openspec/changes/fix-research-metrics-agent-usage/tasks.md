## 1. Redaction And Usage Foundations

- [ ] 1.1 Add tests proving safe numeric usage keys are not redacted while secret token/API key/JWT/cookie fields remain redacted.
- [ ] 1.2 Update Python research metric redaction used by `chatbot-backend` and `agent-service` to preserve numeric usage fields only.
- [ ] 1.3 Update TypeScript research metric redaction used by `mcp-gen` to preserve numeric usage fields only.
- [ ] 1.4 Add usage normalization tests for prompt, completion, total tokens, missing/redacted status, and effective Gemini 2.5 Flash cost at `$0.30/$2.50` per 1M input/output tokens across direct Gemini and MetaClaw-backed usage.
- [ ] 1.5 Commit the redaction and usage-foundation unit after tests pass.

## 2. Real LangGraph Examiner Evidence

- [ ] 2.1 Make benchmark API-doc MCP creation requests route through `delegate_to_examiner_agent` before generator.
- [ ] 2.2 Ensure `agent-service` persists correlated `langgraph-agent` `examiner_completed` and `generator_completed` events to the configured Mongo/JSONL evidence store.
- [ ] 2.3 Ensure examiner emits safe top-3 RAG evidence labels or hashes, `rag_returned_count`, `rag_context_tokens`, and `rag_context_item_count`.
- [ ] 2.4 Ensure generator receives an enriched task containing `ORIGINAL_PROMPT`, `API_DOCUMENTATION`, and `ENRICHED_CONTEXT (RAG)` before calling `mcp-gen`.
- [ ] 2.5 Commit the real-examiner-evidence unit after tests pass.

## 3. Usage And Cost Producers

- [ ] 3.1 Emit or derive `estimated_prompt_tokens`, `estimated_completion_tokens`, and `estimated_total_tokens` from provider usage when available, otherwise from safe deterministic estimates.
- [ ] 3.2 Derive `estimated_cost_usd` for every benchmark LLM path from text input/output token estimates using the effective Gemini 2.5 Flash price table, including MetaClaw-backed calls.
- [ ] 3.3 Add `usage_status` and `usage_source` to run-level records and exports.
- [ ] 3.4 Treat missing or redacted token evidence as unavailable instead of valid zero usage.
- [ ] 3.5 Commit the usage-and-cost producer unit after tests pass.

## 4. Runner And Export Validation

- [ ] 4.1 Update MAPR retrieval aggregation to ignore `backend_langgraph_fallback` examiner/generator events.
- [ ] 4.2 Add strict validation that RAG-on smoke runs fail when no real `langgraph-agent` `examiner_completed` event is present.
- [ ] 4.3 Add strict validation that smoke runs fail when numeric token/cost evidence is missing or redacted.
- [ ] 4.4 Update CSV/Markdown exports to show evidence completeness statuses and to avoid treating unavailable usage or retrieval as zero-valued success.
- [ ] 4.5 Commit the runner/export validation unit after tests pass.

## 5. One-Build Smoke And Cleanup

- [ ] 5.1 Run focused unit tests for redaction, usage normalization, RAG retrieval event selection, and exporter behavior.
- [ ] 5.2 Run exactly one build smoke using `jsonplaceholder-input-doc` with `dynamic-rag-on` and Gemini 2.5 Flash.
- [ ] 5.3 Verify the smoke evidence contains `service="langgraph-agent"` examiner/generator events and no MAPR retrieval metrics sourced from backend fallback.
- [ ] 5.4 Verify run/report outputs include numeric prompt tokens, completion tokens, total tokens, `estimated_cost_usd`, `usage_status`, and non-empty RAG evidence when retrieval returns evidence.
- [ ] 5.5 Remove the generated MCP container through the manager or Docker and record cleanup status.
- [ ] 5.6 Remove only no-longer-needed generated/dangling images, preserving active Compose service images.
- [ ] 5.7 Commit the smoke verification and cleanup unit after the one-build evidence passes.
