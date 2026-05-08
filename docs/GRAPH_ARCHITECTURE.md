# LangGraph architecture

This repository's canonical orchestration implementation is `my_agent/agents/graph.py`.

## Runtime flow

```text
User request
  -> supervisor
  -> tools
  -> examiner or generator
  -> supervisor_final
  -> supervisor/tools/end
```

## Nodes

### supervisor

The supervisor node reads the current `AgentState`, asks the configured LLM to choose the next action, and emits tool calls for one of these graph tools:

- `delegate_to_examiner_agent`
- `delegate_to_generator_agent`
- `mark_task_complete`

It also populates `raw_api_doc` from the first human message when the state does not already contain it.

### tools

The tools node executes supervisor tool calls and repairs incomplete delegation arguments with state-backed values. This protects routing from LLM truncation or generic tool-call arguments.

### examiner

The examiner agent analyzes API documentation and enriches the generation request with related RAG context. It returns a generator delegation payload and updates `enriched_context`.

### generator

The generator agent calls `create_MCPServer`, which uses `my_agent/utils/mcp_client.py` to call mcp-gen. After server creation it fetches generated artifacts from mcp-gen and indexes them in the vector database when possible.

### supervisor_final

The final supervisor node evaluates sub-agent output. It fast-paths examiner output directly to generator and marks successful generator output as complete.

## State fields

- `messages`: LangChain messages accumulated during graph execution.
- `next_agent`: routing hint used by conditional edges.
- `final_response`: final user-facing response when available.
- `history`: append-only execution markers such as `_ran_examiner`, `_ran_generator`, and completion markers.
- `retry_count`: retry-loop guard counter.
- `is_complete`: true when the task has been confirmed complete.
- `current_plan`: compact description of the current supervisor plan or evaluation.
- `raw_api_doc`: original API documentation or user request preserved for tool argument repair.
- `enriched_context`: RAG context produced by the examiner.

## Routing decisions

- `route_supervisor` sends the graph to `tools` when the supervisor produced tool calls; otherwise it ends.
- `route_after_tools` routes tool output containing `DELEGATE_TO_EXAMINER` to examiner, `DELEGATE_TO_GENERATOR` to generator, and `TASK_COMPLETE` to end.
- `route_supervisor_final` loops back to supervisor, fast-paths to tools, or ends.

## Completion triggers

Completion is detected when generator output satisfies success criteria, including a successful server creation statement and a server ID. The graph also honors the explicit `TASK_SUCCESSFULLY_COMPLETED` history marker and `mark_task_complete` tool result.

## Retry guard

`MAX_RETRIES` in `my_agent/agents/graph.py` prevents infinite supervisor loops. When the retry count reaches the maximum, the supervisor returns the latest output and ends gracefully.

## mcp-gen integration

mcp-gen URL construction and response validation are centralized in `my_agent/utils/mcp_client.py`. `MCP_BASE_URL` is the mcp-gen API base URL and must include `/api`.
