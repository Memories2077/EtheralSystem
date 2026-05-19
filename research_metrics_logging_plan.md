# Research Metrics Logging Plan

Ngay tao: 2026-05-17

Tai lieu nay ghi lai cac metrics nen log de phuc vu bai bao ve he sinh thai MCP agent hien tai. Pham vi duoc quan sat gom 4 repo chinh:

- `chatbot_mcp_client`: Next.js UI va FastAPI bridge cho chat, SSE, MCP metadata, feedback va proxy sang mcp-gen.
- `langChain-application`: LangGraph agent engine, supervisor/examiner/generator, hierarchical RAG va MCP build handoff.
- `mcp-gen`: API-to-MCP generator, dynamic skill selection, artifact lifecycle, Docker manager va feedback tracking.
- `MetaClaw`: proxy/meta-learning layer, skill injection, long-term memory, PRM/RL va benchmark.

`conductor` hien chu yeu la tai lieu tich hop, nen co the dung lam noi dat runbook/experiment orchestration sau nay.

## Muc Tieu Logging

Muc tieu la bien pipeline hien tai thanh mot he thong co so lieu nghien cuu duoc:

- Chung minh do chuyen nghiep: co traceability, latency, reliability, cost, quality, security va feedback loop.
- Ho tro ablation study: so sanh co/khong RAG, static prompt/dynamic skill selection, MetaClaw/direct provider.
- Tao bang ket qua cho bai bao: success rate, p95 latency, generated MCP quality, RAG uplift, skill/memory contribution.
- Co kha nang reproduce: moi experiment can log commit hash, model, provider, dataset version, config va random seed neu co.

## Chuan Event Nen Dung

Nen log theo JSONL hoac MongoDB collection thong nhat, vi cac repo hien da co MongoDB/logs/records rieng le nhung chua co schema xuyen suot.

De xuat event schema toi thieu:

```json
{
  "timestamp": "2026-05-17T00:00:00.000Z",
  "trace_id": "uuid",
  "session_id": "chat-session-id",
  "build_request_id": "optional-idempotency-key",
  "server_id": "optional-generated-server-id",
  "repo": "mcp-gen",
  "service": "docker-manager",
  "stage": "generation|rag|skill_selection|build|runtime|feedback",
  "event_name": "mcp_generation_completed",
  "status": "success|failure|timeout|skipped",
  "duration_ms": 1234,
  "error_code": null,
  "model": "provider/model",
  "metrics": {},
  "tags": {}
}
```

Correlation IDs nen duoc tao o `chatbot_mcp_client` backend khi nhan `/chat`, roi propagate sang MetaClaw, LangGraph va mcp-gen qua headers hoac request body:

- `trace_id`: mot lan user request end-to-end.
- `session_id`: chat session hoac MetaClaw session.
- `build_request_id`: idempotency key/build id cho MCP generation.
- `server_id`: generated MCP server id.
- `experiment_id`: dung khi chay benchmark/ablation.

Can tranh log secret, raw token, JWT, API key, full user PII. Neu can log input, dung hash, length, loai input va feature flags thay vi noi dung day du.

## Metrics Theo Nhom

### 1. End-to-End Performance

Ap dung cho `chatbot_mcp_client` va toan pipeline.

| Metric | Cach do | Y nghia cho bai bao |
| --- | --- | --- |
| `time_to_first_sse_ms` | Tu luc UI/Backend nhan request den chunk SSE dau tien | Do phan hoi thuc te cua he thong |
| `chat_total_latency_ms` | Tu request `/chat` den event done/error | P50/P95/P99 latency |
| `build_total_latency_ms` | Tu build intent den MCP ready | So sanh pipeline generation |
| `stream_chunk_count` | So chunk SSE tra ve | Do min cua progress streaming |
| `timeout_rate` | Timeout / total requests | Reliability |
| `fallback_rate` | So lan fallback provider/tool path / total | Do robust cua orchestration |
| `concurrent_requests` | Active sessions/builds | Nang luc van hanh |
| `tokens_per_success` | Tong token / successful build | Cost efficiency |

Nen bao cao: mean, median, p95, p99, standard deviation, confidence interval neu chay nhieu seed.

### 2. Chatbot Bridge va SSE

Ap dung cho `chatbot_mcp_client/backend`.

| Metric | Event goi y |
| --- | --- |
| Provider duoc chon: Gemini/Groq/MetaClaw | `chat_provider_selected` |
| MetaClaw enabled/disabled | `metaclaw_route_decision` |
| MCP metadata success/failure by error code | `mcp_metadata_checked` |
| Active MCP URLs count | `mcp_tools_attached` |
| SSE typed event counts: status/content/error/done | `sse_stream_completed` |
| Frontend perceived latency | `ui_chat_completed` neu them frontend telemetry |
| Feedback submit latency va error | `mcp_feedback_submitted` |

Day la nhom de the hien UI/backend khong chi la demo ma co production observability.

### 3. LangGraph Orchestration

Ap dung cho `langChain-application`.

| Metric | Cach do |
| --- | --- |
| `supervisor_route` | examiner/generator/complete/end |
| `route_change_count` | So lan supervisor loop |
| `retry_count` | Gia tri state hien co |
| `max_retry_hit` | Co cham `MAX_RETRIES` hay khong |
| `examiner_invoked` | Co/khong chay RAG |
| `generator_invoked` | Co/khong goi generation |
| `fallback_direct_tool_invocation` | LLM khong call tool, code fallback goi truc tiep |
| `task_completion_status` | success, terminal_failure, in_progress, forced_completion |
| `langgraph_stream_duration_ms` | Thoi gian stream build |
| `tool_call_parse_failure_rate` | So lan can repair incomplete tool args |

Metric quan trong cho paper: orchestration success rate, average route length, retry count, failure taxonomy.

### 4. RAG va Artifact Indexing

Ap dung cho `langChain-application/my_agent/utils/vector_db.py` va `examiner_agent.py`.

| Metric | Cach do |
| --- | --- |
| `rag_query_latency_ms` | Thoi gian retrieve |
| `rag_top_k` | So candidates lay ra |
| `rag_returned_count` | So chunk sau filtering |
| `rag_similarity_mean/max/min` | Diem similarity cua retrieved chunks |
| `rag_low_score_discard_count` | So chunk bi loai vi score thap |
| `auto_merging_fallback_rate` | AutoMergingRetriever loi va fallback simple retrieval |
| `rag_context_tokens` | Token/word cua enriched context |
| `rag_context_item_count` | So item dua vao generator |
| `artifact_index_success_rate` | Ty le index artifact thanh cong |
| `duplicate_artifact_rate` | Similar content existed / total indexing attempts |

Neu tao benchmark co ground truth, them:

- `recall@k`
- `precision@k`
- `MRR`
- `nDCG@k`
- RAG-on vs RAG-off uplift tren generated MCP success.

### 5. Dynamic Skill Selection

Ap dung cho `mcp-gen/src/skill-intelligence`.

Repo hien da co mot phan metrics: initialization duration, analysis count, cache hits/misses, selection duration, selected skill count, selection confidence, token budget, feedback effectiveness. Nen chuan hoa cac log nay vao event schema.

| Metric | Hien trang/gap |
| --- | --- |
| `skill_selection_initialization_ms` | Da co console log, nen dua vao structured event |
| `spec_analysis_duration_ms` | Da co |
| `analysis_cache_hit_rate` | Da co |
| `selected_skill_count` | Da co |
| `selected_skill_ids` | Da co trong log text |
| `selection_confidence` | Da co |
| `skill_total_tokens` | Co trong composition, can log structured |
| `fallback_reason` | Co trong composition, can log |
| `static_vs_dynamic_token_saving` | Can tinh them |
| `skill_success_rate` | Da co FeedbackTracker, can export aggregate |
| `bayesian_skill_success_rate` | Da co |
| `skill_gap_frequency` | Da co detect gap, can dua vao report |

Metric nay rat manh cho bai bao vi co the chung minh dynamic prompt assembly tot hon static prompt.

### 6. MCP Generation Lifecycle

Ap dung cho `mcp-gen`.

| Stage | Metrics nen log |
| --- | --- |
| Input normalization | input length, input type: OpenAPI JSON/YAML/raw docs, detected auth, endpoint count |
| OpenAPI synthesis | duration, validation pass/fail, number of validation errors |
| Prompt build | total prompt tokens, system/user token split, warning level |
| LLM generation | provider/model, prompt tokens, completion tokens, duration, retry count |
| Code validation | TypeScript parse pass, typecheck pass, Zod schema checks, auth implementation checks |
| Docker build | image build duration, build logs length, failure code/category |
| Container start | start duration, host port allocation, ready callback latency |
| Artifact lifecycle | input/openapi/typescript exists, artifact fetch status, partial/complete |

Generated quality metrics:

- `endpoint_coverage`: generated tools / OpenAPI operations.
- `schema_coverage`: operations with Zod schemas / operations.
- `auth_correctness`: expected auth implemented and no auth hallucination.
- `pagination_support`: expected pagination implemented.
- `file_upload_support`: expected multipart/file upload implemented.
- `webhook_streaming_support`: expected advanced transport features implemented.
- `hallucinated_endpoint_rate`: generated endpoints not present in spec.
- `compile_pass_rate`.
- `mcp_handshake_pass_rate`.
- `tool_call_pass_rate`.

### 7. Runtime MCP Reliability

Ap dung cho generated MCP servers va `dynamic-proxy`.

| Metric | Muc dich |
| --- | --- |
| `mcp_initialize_success_rate` | Server co initialize duoc khong |
| `mcp_list_tools_latency_ms` | MCP discovery performance |
| `mcp_tool_count` | Do phong phu cua generated server |
| `tool_call_success_rate` | Chat agent goi tool thanh cong |
| `tool_call_latency_ms` | Runtime latency |
| `server_uptime_ms` | Stability |
| `container_restart_count` | Reliability |
| `container_cpu_percent` / `memory_mb` | Resource profile |
| `proxy_auth_failure_rate` | Token/JWT issues |
| `proxy_route_miss_rate` | Server id khong map duoc backend |

### 8. MetaClaw Memory va Skill Evolution

Ap dung cho `MetaClaw`.

| Metric | Cach do |
| --- | --- |
| `memory_injected_count` | So memory units inject moi turn |
| `memory_injected_tokens` | Token budget thuc te |
| `memory_retrieval_latency_ms` | Retrieval performance |
| `memory_hit_rate` | Co memory lien quan hay khong |
| `memory_type_distribution` | episodic/semantic/preference/project_state |
| `memory_health_score` | Da co trong memory store |
| `memory_duplicate_rate` | Near-duplicate pairs |
| `memory_freshness_score` | Da co trong health components |
| `skill_injected_count` | So skills inject |
| `skill_evolution_count` | So skills moi sinh ra |
| `prm_score` | Reward/quality signal |
| `rl_batch_size` va `training_step_count` | Learning process |
| `hot_swap_duration_ms` | Downtime/impact cua update |

Cho bai bao, nen so sanh:

- No memory vs memory.
- Skill-only vs memory-only vs memory+skill synergy.
- MetaClaw direct vs no MetaClaw.
- PRM/RL disabled vs enabled neu du dieu kien.

### 9. Security va Safety

Can co nhom nay de bai bao trong chuyen nghiep hon, dac biet vi MCP/tool ecosystem co attack surface lon.

| Metric | Muc dich |
| --- | --- |
| `secret_leak_detected` | Quet output/generated code/logs |
| `jwt_validation_failure_rate` | Proxy/server auth safety |
| `unauthorized_tool_call_rate` | Goi tool khong hop le |
| `prompt_injection_detected_rate` | Neu them detector/static scanner |
| `auth_contamination_rate` | API khong auth nhung generator them auth sai |
| `missing_auth_rate` | API co auth nhung generator khong implement |
| `unsafe_command_detected` | Generated code co command/path nguy hiem |
| `dependency_risk_count` | Dependency unknown/outdated |
| `audit_log_coverage` | % request co trace_id va security event |

### 10. Human Feedback va Continuous Improvement

Ap dung cho feedback UI, FastAPI proxy va mcp-gen FeedbackTracker.

| Metric | Cach do |
| --- | --- |
| `like_count`, `dislike_count` | Da co trong mcp-gen logs |
| `feedback_ratio` | Like / total |
| `comment_issue_tags` | auth/schema/pagination/runtime/deployment |
| `manual_fix_required_rate` | Dislike co comment / total |
| `time_to_fix_hours` | Tu dislike den build thanh cong tiep theo |
| `feedback_import_match_rate` | Feedback logs matched outcomes / scanned logs |
| `skill_attributed_feedback_score` | Da co trong FeedbackTracker |
| `post_feedback_success_delta` | Success rate truoc/sau feedback |

Day la co so de noi he thong co feedback loop thay vi chi generation mot lan.

### 11. Cost va Resource Efficiency

| Metric | Muc dich |
| --- | --- |
| `prompt_tokens`, `completion_tokens`, `total_tokens` | Cost/core comparison |
| `estimated_llm_cost_usd` | Neu biet bang gia provider |
| `tokens_per_successful_server` | Cost effectiveness |
| `docker_build_cpu_time_ms` | Resource usage |
| `generated_artifact_size_bytes` | Complexity |
| `cache_saved_latency_ms` | Loi ich cache |
| `cache_saved_tokens` | Loi ich dynamic/cache |

## Experiment De Dua Vao Bai Bao

### Experiment 1: Static Prompt vs Dynamic Skill Selection

Muc tieu: chung minh skill selection giam token va tang chat luong generation.

Bien the:

- Control: static prompt path.
- Dynamic: SkillSelectionAgent.
- Hybrid: dynamic neu confidence cao, fallback static neu thap.

Metrics:

- Compile pass rate.
- MCP handshake pass rate.
- Endpoint coverage.
- Prompt token count.
- Generation latency.
- Selection confidence.
- Human/LLM judge quality.

### Experiment 2: RAG Ablation

Muc tieu: do loi ich cua hierarchical RAG trong generation.

Bien the:

- No RAG.
- Simple vector retrieval.
- Hierarchical RAG with AutoMergingRetriever.
- RAG + artifact re-indexing loop.

Metrics:

- Success rate.
- Artifact indexing success.
- Similarity distribution.
- Duplicate artifact rate.
- Generated code quality.
- Failure taxonomy.

### Experiment 3: MetaClaw va Memory Ablation

Muc tieu: do loi ich cua memory/skill injection va continual adaptation.

Bien the:

- Direct provider.
- MetaClaw skills_only.
- MetaClaw memory only.
- MetaClaw memory + skill.
- MetaClaw PRM/RL neu chay duoc.

Metrics:

- Task success rate.
- PRM score.
- Memory injected tokens.
- Skill count.
- Latency overhead.
- User feedback ratio.

### Experiment 4: Robustness Theo Loai API

Dataset nen gom nhieu loai API:

- Simple CRUD.
- API co bearer/API key/OAuth.
- Pagination cursor/page/offset.
- Multipart file upload.
- Webhook.
- Streaming.
- Rate limiting.
- Noisy natural language docs.
- Partial or invalid OpenAPI.

Metrics:

- Pass rate theo feature.
- Auth correctness.
- Hallucination rate.
- Retry/fallback rate.
- Error category distribution.

### Experiment 5: Runtime Reliability

Muc tieu: chung minh generated MCP servers dung duoc sau generation.

Metrics:

- Container startup success.
- Ready callback latency.
- MCP initialize success.
- list_tools latency.
- Tool call pass rate.
- Uptime/restart count.
- Resource usage.

## Acceptance Criteria Cho Logging

MVP logging du de viet bai:

- Tat ca request co `trace_id`, `session_id`; build co `build_request_id` va `server_id` khi sinh ra.
- Co event bat dau/ket thuc cho cac stage: chat, MetaClaw route, LangGraph stream, RAG retrieve, skill selection, mcp-gen create, Docker build, ready callback, artifact indexing, feedback.
- Moi event co `duration_ms`, `status`, `error_code` neu loi.
- Co script export aggregate sang CSV/Markdown bang ket qua.
- Co experiment config file ghi model/provider/commit/dataset.
- Co it nhat 3 ablation tables: skill selection, RAG, MetaClaw memory.

## Paper arXiv Nen Tham Khao

### MCP va Agent Protocols

- [MetaClaw: Just Talk - An Agent That Meta-Learns and Evolves in the Wild](https://arxiv.org/abs/2603.17187): lien quan truc tiep den MetaClaw, skill evolution, PRM/RL va continual learning.
- [A survey of agent interoperability protocols: MCP, ACP, A2A, ANP](https://arxiv.org/abs/2505.02279): boi canh protocol va interoperability.
- [A Measurement Study of Model Context Protocol](https://arxiv.org/abs/2509.25292): can tham khao ve measurement methodology cho MCP ecosystem.
- [MCP-Guard: A Defense Framework for Model Context Protocol Integrity](https://arxiv.org/abs/2508.10991): can tham khao cho security metrics, prompt injection va tool integrity.
- [SMCP: Secure Model Context Protocol](https://arxiv.org/abs/2602.01129): can tham khao cho identity, mutual auth, policy enforcement va audit logging.

### Tool Use va API Agents

- [RestGPT: Connecting Large Language Models with Real-World RESTful APIs](https://arxiv.org/abs/2306.06624): lien quan API planning/execution va RestBench.
- [ToolLLM: Facilitating Large Language Models to Master 16000+ Real-world APIs](https://arxiv.org/abs/2307.16789): lien quan ToolBench, API retrieval, tool-use evaluation.
- [StableToolBench](https://arxiv.org/abs/2403.07714): quan trong cho stable benchmark, virtual API server, caching va evaluation stability.
- [Gorilla: Large Language Model Connected with Massive APIs](https://arxiv.org/abs/2305.15334): lien quan APIBench, API hallucination va retrieval-aware API calling.
- [API-Bank: A Comprehensive Benchmark for Tool-Augmented LLMs](https://arxiv.org/abs/2304.08244): benchmark cho planning, retrieving va calling APIs.
- [AgentBench: Evaluating LLMs as Agents](https://arxiv.org/abs/2308.03688): multi-environment agent benchmark va failure analysis.
- [Toolformer: Language Models Can Teach Themselves to Use Tools](https://arxiv.org/abs/2302.04761): nen tham khao cho tool-use decision, argument selection va self-supervision.

### Reasoning, Acting va Feedback

- [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629): nen dung de dat pipeline supervisor/tool/action vao boi canh reasoning + acting.
- [Reflexion: Language Agents with Verbal Reinforcement Learning](https://arxiv.org/abs/2303.11366): nen tham khao cho feedback loop, episodic memory va improvement without weight updates.

### RAG va Memory

- [Retrieval-Augmented Generation for Large Language Models: A Survey](https://arxiv.org/abs/2312.10997): tong quan RAG va evaluation framework.
- [Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection](https://arxiv.org/abs/2310.11511): adaptive retrieval va self-critique.
- [A Survey on the Memory Mechanism of LLM-based Agents](https://arxiv.org/abs/2404.13501): tong quan memory design/evaluation cho LLM agents.
- [MemoryBank: Enhancing Large Language Models with Long-Term Memory](https://arxiv.org/abs/2305.10250): long-term memory, memory update va forgetting curve.
- [MemGPT: Towards LLMs as Operating Systems](https://arxiv.org/abs/2310.08560): memory tiering va virtual context management.

## De Xuat Thu Tu Uu Tien Trien Khai

1. Them correlation IDs va structured event logger dung chung.
2. Log end-to-end chat/build lifecycle trong `chatbot_mcp_client` va `mcp-gen`.
3. Chuan hoa skill selection metrics tu console log sang structured events.
4. Them RAG retrieval metrics trong `langChain-application`.
5. Export aggregate report cho benchmark/ablation.
6. Them security/runtime metrics cho generated MCP servers.
7. Hop nhat feedback/memory/skill effectiveness de tao continuous-improvement charts.

## Bang Ket Qua Mong Doi Cho Paper

Bang toi thieu nen co:

- Table 1: System components va telemetry coverage.
- Table 2: Static vs dynamic vs hybrid skill selection.
- Table 3: RAG ablation.
- Table 4: MetaClaw/memory/skill ablation.
- Table 5: Robustness by API feature.
- Table 6: Runtime reliability va resource usage.
- Figure 1: End-to-end pipeline with trace IDs.
- Figure 2: Latency breakdown by stage.
- Figure 3: Feedback-driven skill success over time.
- Figure 4: Token/cost per successful server.
