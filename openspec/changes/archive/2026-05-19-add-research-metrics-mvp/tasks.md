## 1. Research Event Infrastructure

- [x] 1.1 Add Python research metrics helper with feature flag, redaction, MongoDB persistence, and JSONL fallback.
- [x] 1.2 Add TypeScript research metrics helper with matching event shape, feature flag, redaction, MongoDB persistence, and JSONL fallback.
- [x] 1.3 Add environment defaults for research metrics configuration.

## 2. Context Propagation and Instrumentation

- [x] 2.1 Extend chatbot request context with optional `traceId` and `experimentId`.
- [x] 2.2 Instrument FastAPI chat, LangGraph streaming, MCP metadata, and feedback proxy stages.
- [x] 2.3 Instrument LangGraph supervisor, examiner/RAG, generator, and artifact indexing stages.
- [x] 2.4 Instrument mcp-gen skill selection, generation lifecycle, Docker lifecycle, and feedback stages.

## 3. Benchmarks and Reports

- [x] 3.1 Add a frozen paper MVP benchmark dataset.
- [x] 3.2 Add benchmark runner for static skill selection, dynamic skill selection, RAG, and optional MetaClaw modes.
- [x] 3.3 Add report exporter for CSV and Markdown paper tables.

## 4. Verification

- [x] 4.1 Add unit tests for event redaction and disabled/enabled behavior.
- [x] 4.2 Add integration or smoke tests for correlated event emission.
- [x] 4.3 Run targeted checks and update OpenSpec task status.
