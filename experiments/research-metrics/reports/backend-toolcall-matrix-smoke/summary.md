# Research Metrics Report

Experiment: backend-toolcall-matrix-smoke
Generated: 2026-05-19T13:49:52.447Z

## Backend Tool-Call Matrix By Variant
| variantId | count | build_success_rate | metadata_readiness_rate | tool_call_pass_rate | skipped_coverage | p50_ms | p95_ms | estimated_prompt_tokens | llm_call_count | selected_skill_tokens |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| static-rag-off | 1 | 1 | 1 | 0.3333 | 0 | 249125 | 249125 | 0 | 0 | 0 |

## Backend Tool-Call Matrix By Case
| caseId | count | build_success_rate | metadata_readiness_rate | tool_call_pass_rate | skipped_coverage | p50_ms | p95_ms | estimated_prompt_tokens | llm_call_count | selected_skill_tokens |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| jsonplaceholder-posts | 1 | 1 | 1 | 0.3333 | 0 | 249125 | 249125 | 0 | 0 | 0 |

## Backend Tool-Call Matrix By API Type
| apiType | count | build_success_rate | metadata_readiness_rate | tool_call_pass_rate | skipped_coverage | p50_ms | p95_ms | estimated_prompt_tokens | llm_call_count | selected_skill_tokens |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| simple_crud | 1 | 1 | 1 | 0.3333 | 0 | 249125 | 249125 | 0 | 0 | 0 |

## Backend Tool-Call Matrix By Skill Selection
| skillSelectionMode | count | build_success_rate | metadata_readiness_rate | tool_call_pass_rate | skipped_coverage | p50_ms | p95_ms | estimated_prompt_tokens | llm_call_count | selected_skill_tokens |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| static | 1 | 1 | 1 | 0.3333 | 0 | 249125 | 249125 | 0 | 0 | 0 |

## Backend Tool-Call Matrix By RAG
| ragEnabled | count | build_success_rate | metadata_readiness_rate | tool_call_pass_rate | skipped_coverage | p50_ms | p95_ms | estimated_prompt_tokens | llm_call_count | selected_skill_tokens |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rag_off | 1 | 1 | 1 | 0.3333 | 0 | 249125 | 249125 | 0 | 0 | 0 |


## Benchmark Runs
| itemId | apiType | mode | repeatIndex | ok | serverId | durationMs |
| --- | --- | --- | --- | --- | --- | --- |
| jsonplaceholder-posts | simple_crud | backend-api-toolcall | 1 | true | 06a8f74f-96dc-449c-b488-18608dc8839b | 249125 |

## Static vs Dynamic / Mode Comparison
| mode_key | count | success_rate | runtime_success_rate | p50_ms | p95_ms | median_tool_count |
| --- | --- | --- | --- | --- | --- | --- |
| backend-api-toolcall:static:no_rag:metaclaw | 1 | 1 | 1 | 249125 | 249125 | 6 |

## RAG Comparison
| rag_key | count | success_rate | runtime_success_rate | p50_ms | p95_ms | median_tool_count |
| --- | --- | --- | --- | --- | --- | --- |
| no_rag | 1 | 1 | 1 | 249125 | 249125 | 6 |

## Runtime Reliability
| source | count | success_rate | p50_ms | p95_ms | median_tool_count |
| --- | --- | --- | --- | --- | --- |
| event:success | 1 | 1 | 152 | 152 | 6 |
| benchmark:backend-api-toolcall | 1 | 1 | 249125 | 249125 | 6 |

## Robustness By API Type
| apiType | count | success_rate | runtime_success_rate | p50_ms | p95_ms | median_tool_count |
| --- | --- | --- | --- | --- | --- | --- |
| simple_crud | 1 | 1 | 1 | 249125 | 249125 | 6 |

## Feedback
_No data._

## Build Summary
| build_request_id | server_id | status | total_duration_ms | event_count |
| --- | --- | --- | --- | --- |
| backend-toolcall-matrix-smoke-static-rag-off-jsonplaceholder-posts-r1-77261d93 |  | success | 3965 | 7 |

## Stage Summary
| event | count | success | failure | timeout | p50_ms | p95_ms |
| --- | --- | --- | --- | --- | --- | --- |
| chatbot-backend:chat:chat_stream_completed | 7 | 7 | 0 | 0 | 4425 | 207548 |
| chatbot-backend:generation:generator_completed | 1 | 1 | 0 | 0 | 202756 | 202756 |
| chatbot-backend:langgraph_stream:langgraph_stream_completed | 1 | 1 | 0 | 0 | 202743 | 202743 |
| chatbot-backend:orchestration:supervisor_routed | 1 | 1 | 0 | 0 | 202754 | 202754 |
| chatbot-backend:rag:examiner_completed | 1 | 0 | 0 | 0 | 202755 | 202755 |
| chatbot-backend:runtime:mcp_metadata_checked | 1 | 1 | 0 | 0 | 152 | 152 |
| chatbot-backend:runtime:mcp_tool_invocation_completed | 6 | 2 | 4 | 0 | 2427 | 4152 |
| chatbot-backend:runtime:mcp_tool_outcomes_completed | 1 | 0 | 1 | 0 | 39349 | 39349 |
