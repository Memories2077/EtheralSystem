# Research Metrics Report

Experiment: backend-toolcall-matrix-smoke
Generated: 2026-05-19T14:12:50.887Z

## Backend Tool-Call Matrix By Variant
| variantId | count | build_success_rate | metadata_readiness_rate | tool_call_pass_rate | skipped_coverage | p50_ms | p95_ms | estimated_prompt_tokens | llm_call_count | selected_skill_tokens |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| static-rag-off | 1 | 1 | 1 | 1 | 0.6923 | 137417 | 137417 | 0 | 0 | 0 |

## Backend Tool-Call Matrix By Case
| caseId | count | build_success_rate | metadata_readiness_rate | tool_call_pass_rate | skipped_coverage | p50_ms | p95_ms | estimated_prompt_tokens | llm_call_count | selected_skill_tokens |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| jsonplaceholder-input-doc | 1 | 1 | 1 | 1 | 0.6923 | 137417 | 137417 | 0 | 0 | 0 |

## Backend Tool-Call Matrix By API Type
| apiType | count | build_success_rate | metadata_readiness_rate | tool_call_pass_rate | skipped_coverage | p50_ms | p95_ms | estimated_prompt_tokens | llm_call_count | selected_skill_tokens |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| public_crud_input_doc | 1 | 1 | 1 | 1 | 0.6923 | 137417 | 137417 | 0 | 0 | 0 |

## Backend Tool-Call Matrix By Skill Selection
| skillSelectionMode | count | build_success_rate | metadata_readiness_rate | tool_call_pass_rate | skipped_coverage | p50_ms | p95_ms | estimated_prompt_tokens | llm_call_count | selected_skill_tokens |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| static | 1 | 1 | 1 | 1 | 0.6923 | 137417 | 137417 | 0 | 0 | 0 |

## Backend Tool-Call Matrix By RAG
| ragEnabled | count | build_success_rate | metadata_readiness_rate | tool_call_pass_rate | skipped_coverage | p50_ms | p95_ms | estimated_prompt_tokens | llm_call_count | selected_skill_tokens |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rag_off | 1 | 1 | 1 | 1 | 0.6923 | 137417 | 137417 | 0 | 0 | 0 |


## Benchmark Runs
| itemId | apiType | mode | repeatIndex | ok | serverId | durationMs |
| --- | --- | --- | --- | --- | --- | --- |
| jsonplaceholder-input-doc | public_crud_input_doc | backend-api-toolcall | 1 | true | f036aa7c-e2d0-4caf-843f-197457a4f8d6 | 137417 |

## Static vs Dynamic / Mode Comparison
| mode_key | count | success_rate | runtime_success_rate | p50_ms | p95_ms | median_tool_count |
| --- | --- | --- | --- | --- | --- | --- |
| backend-api-toolcall:static:no_rag:metaclaw | 1 | 1 | 1 | 137417 | 137417 | 13 |

## RAG Comparison
| rag_key | count | success_rate | runtime_success_rate | p50_ms | p95_ms | median_tool_count |
| --- | --- | --- | --- | --- | --- | --- |
| no_rag | 1 | 1 | 1 | 137417 | 137417 | 13 |

## Runtime Reliability
| source | count | success_rate | p50_ms | p95_ms | median_tool_count |
| --- | --- | --- | --- | --- | --- |
| event:success | 1 | 1 | 128 | 128 | 13 |
| benchmark:backend-api-toolcall | 1 | 1 | 137417 | 137417 | 13 |

## Robustness By API Type
| apiType | count | success_rate | runtime_success_rate | p50_ms | p95_ms | median_tool_count |
| --- | --- | --- | --- | --- | --- | --- |
| public_crud_input_doc | 1 | 1 | 1 | 137417 | 137417 | 13 |

## Feedback
| feedback_event | count | success | failure | likes | dislikes |
| --- | --- | --- | --- | --- | --- |
| generation_feedback_recorded | 1 | 1 | 0 | 0 | 0 |

## Build Summary
| build_request_id | server_id | status | total_duration_ms | event_count |
| --- | --- | --- | --- | --- |
| backend-toolcall-matrix-smoke-static-rag-off-jsonplaceholder-input-doc-r1-a4de1fd5 |  | success | 6900 | 5 |

## Stage Summary
| event | count | success | failure | timeout | p50_ms | p95_ms |
| --- | --- | --- | --- | --- | --- | --- |
| chatbot-backend:chat:chat_stream_completed | 5 | 5 | 0 | 0 | 6900 | 102213 |
| chatbot-backend:generation:generator_completed | 1 | 1 | 0 | 0 | 89875 | 89875 |
| chatbot-backend:langgraph_stream:langgraph_stream_completed | 1 | 1 | 0 | 0 | 89853 | 89853 |
| chatbot-backend:orchestration:supervisor_routed | 1 | 1 | 0 | 0 | 89873 | 89873 |
| chatbot-backend:rag:examiner_completed | 1 | 0 | 0 | 0 | 89874 | 89874 |
| chatbot-backend:runtime:mcp_metadata_checked | 1 | 1 | 0 | 0 | 128 | 128 |
| chatbot-backend:runtime:mcp_tool_invocation_completed | 4 | 4 | 0 | 0 | 3771 | 4864 |
| chatbot-backend:runtime:mcp_tool_outcomes_completed | 1 | 1 | 0 | 0 | 33038 | 33038 |
| mcp-gen:generation:generation_feedback_recorded | 1 | 1 | 0 | 0 | 32850 | 32850 |
