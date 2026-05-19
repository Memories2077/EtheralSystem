## 1. Frontend Dashboard And Payload

- [x] 1.1 Verify `RunControls` keeps `experimentId`, `ragEnabled`, and `skillSelectionMode` synchronized with persisted chat settings.
- [x] 1.2 Normalize the frontend static variant payload so static mode uses a dashboard/report-compatible `skillSelectionVariant`.
- [x] 1.3 Ensure the dashboard variant badge and RAG label update immediately after toggles change.
- [x] 1.4 Ensure chat submissions include `experimentId`, `traceId`, `sessionId`, `buildRequestId`, `ragEnabled`, `dynamicSkillSelection`, and `skillSelectionVariant`.
- [x] 1.5 Extend generated server/client types and dashboard server list display to include effective RAG and skill-selection flags when the backend provides them.
- [x] 1.6 Add focused frontend tests or assertions for settings persistence and chat payload mapping.

## 2. Backend Flag Propagation

- [x] 2.1 Add or update FastAPI request schema normalization for dashboard run flags and derived variant id.
- [x] 2.2 Ensure FastAPI passes the normalized run context into LangGraph without falling back to stale process-level defaults.
- [x] 2.3 Ensure LangGraph forwards `ragEnabled`, `dynamicSkillSelection`, and `skillSelectionVariant` to the mcp-gen create request.
- [x] 2.4 Ensure `POST /mcp/metadata` receives and records dashboard correlation context when the generated MCP URL is verified.
- [x] 2.5 Add backend tests for request normalization, context propagation, and metadata correlation fields.

## 3. Runtime Variant Behavior

- [x] 3.1 Verify `ragEnabled=false` bypasses vector retrieval and structured RAG extraction for that run.
- [x] 3.2 Verify `ragEnabled=true` preserves existing retrieval behavior and emits retrieval/context metrics.
- [x] 3.3 Verify static skill selection disables dynamic skill selection in mcp-gen prompt/skill selection.
- [x] 3.4 Verify dynamic skill selection enables dynamic skill selection and records selected skill metrics when available.
- [x] 3.5 Add LangGraph and mcp-gen tests for per-run RAG and static/dynamic behavior.

## 4. Generated Server Records And Metrics

- [x] 4.1 Persist `experimentId`, `traceId`, `sessionId`, `buildRequestId`, `ragEnabled`, `dynamicSkillSelection`, and `skillSelectionVariant` on generated server records.
- [x] 4.2 Ensure manager status/list responses expose the persisted run flags needed by the dashboard.
- [x] 4.3 Ensure successful dashboard builds emit build success, metadata readiness, latency, provider/model, and effective variant flags.
- [x] 4.4 Ensure token estimate fields, selected skill token fields, LLM call count, and estimated cost fields are exported when available.
- [x] 4.5 Ensure failed dashboard builds emit safe failure stage/error evidence without secrets or raw private content.

## 5. Report And Tool-Call Semantics

- [x] 5.1 Update report export to include dashboard-created runs in build success, metadata readiness, latency, and cost summaries.
- [x] 5.2 Represent missing tool validation as unknown/not-run instead of a tool-call failure.
- [x] 5.3 Exclude skipped tools and unknown tool validation from the live-callable tool-call pass-rate denominator.
- [x] 5.4 Keep benchmark matrix run records and dashboard-created run rows compatible for variant, RAG, skill-selection, and token/cost fields.
- [x] 5.5 Add exporter tests covering successful dashboard runs, failed dashboard runs, unknown tool validation, skipped-only validation, and attempted tool validation.

## 6. End-To-End Verification

- [x] 6.1 Run typecheck/build checks for the chatbot client and mcp-gen packages.
- [x] 6.2 Run backend Python tests covering research metrics, MCP metadata, and tool outcome helpers.
- [ ] 6.3 Run a local dashboard smoke flow that toggles static/dynamic and RAG on/off, submits a build, and captures the `POST /chat` payload.
- [ ] 6.4 Verify a successful generated MCP server appears active in the dashboard with a non-empty tool list and matching variant flags.
- [ ] 6.5 Export a report for the dashboard experiment id and verify build success, metadata readiness, estimated token/cost fields, and unknown/skipped tool-call coverage are present.
- [x] 6.6 Document the manual commands and expected evidence files for the user-run dashboard validation path.
