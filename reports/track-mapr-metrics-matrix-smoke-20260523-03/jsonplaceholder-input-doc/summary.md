# Research Metrics Report

Experiment: track-mapr-metrics-matrix-smoke-20260523-03
API Doc Batch: jsonplaceholder-input-doc
Generated: 2026-05-23T07:03:03.259Z

## 2x2 Variant Matrix
| skill_selection | rag_off_variant | rag_off_count | rag_off_build_success_rate | rag_off_endpoint_coverage | rag_off_tool_call_pass_rate | rag_on_variant | rag_on_count | rag_on_build_success_rate | rag_on_endpoint_coverage | rag_on_tool_call_pass_rate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| static | static-rag-off |  |  |  |  | static-rag-on |  |  |  |  |
| dynamic | dynamic-rag-off |  |  |  |  | dynamic-rag-on | 1 | 1 | 1 | 1 |

## Ablation Effects
| metric | rag_on_average | rag_off_average | rag_uplift | dynamic_average | static_average | static_vs_dynamic_success_delta | rag_on_count | rag_off_count |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| build_success_rate | 1 |  |  | 1 |  |  | 1 | 0 |
| metadata_readiness_rate | 1 |  |  | 1 |  |  | 1 | 0 |
| mcp_handshake_pass_rate | 1 |  |  | 1 |  |  | 1 | 0 |
| tool_call_pass_rate | 1 |  |  | 1 |  |  | 1 | 0 |
| compile_pass_rate | 1 |  |  | 1 |  |  | 1 | 0 |
| endpoint_coverage | 1 |  |  | 1 |  |  | 1 | 0 |
| hallucinated_tool_rate | 0 |  |  | 0 |  |  | 1 | 0 |
| schema_validity_rate | 0.125 |  |  | 0.125 |  |  | 1 | 0 |

## Quality By Variant
| variantId | count | endpoint_coverage | hallucinated_tool_rate | schema_validity_rate | expected_operation_count | mapped_operation_count | generated_tool_count | hallucinated_tool_count | schema_valid_tool_count |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dynamic-rag-on | 1 | 1 | 0 | 0.125 | 8 | 8 | 8 | 0 | 1 |

## RAG Retrieval By Variant
| variantId | count | applicable_count | evaluated_count | missing_real_examiner_count | no_evidence_count | retrieval_statuses | precision_at_3 | recall_at_3 | mrr_at_3 | retrieved_evidence_count | relevant_evidence_count | retrieval_hit_count |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dynamic-rag-on | 1 | 1 | 1 | 0 | 0 | evaluated | 1 | 0.4286 | 1 | 3 | 7 | 3 |

## Backend Tool-Call Matrix By API Doc
| apiDocId | count | build_success_rate | metadata_readiness_rate | mcp_handshake_pass_rate | compile_pass_rate | endpoint_coverage | hallucinated_tool_rate | schema_validity_rate | inspector_pass_rate | tool_call_pass_rate | skipped_coverage | cleanup_success_rate | cleanup_removed_count | cleanup_failed_count | usage_complete_count | usage_unavailable_count | usage_complete_rate | usage_statuses | p50_build_total_latency_ms | p95_build_total_latency_ms | estimated_total_tokens | tokens_per_successful_server | estimated_cost_usd | estimated_cost_per_successful_server |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| jsonplaceholder-input-doc | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 0.125 | 0 | 1 | 0 | 1 | 1 | 0 | 1 | 0 | 1 | complete | 155882 | 155882 | 11907 | 11907 | 0.0035721 | 0.0036 |

## Backend Tool-Call Matrix By Variant
| variantId | count | build_success_rate | metadata_readiness_rate | mcp_handshake_pass_rate | compile_pass_rate | endpoint_coverage | hallucinated_tool_rate | schema_validity_rate | inspector_pass_rate | tool_call_pass_rate | skipped_coverage | cleanup_success_rate | unknown_tool_validation_count | usage_complete_count | usage_unavailable_count | usage_complete_rate | usage_statuses | p50_build_total_latency_ms | p95_build_total_latency_ms | estimated_total_tokens | tokens_per_successful_server | estimated_cost_usd | estimated_cost_per_successful_server |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dynamic-rag-on | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 0.125 | 0 | 1 | 0 | 1 | 1 | 1 | 0 | 1 | complete | 155882 | 155882 | 11907 | 11907 | 0.0035721 | 0.0036 |

## Backend Tool-Call Matrix By Case
| caseId | count | build_success_rate | metadata_readiness_rate | inspector_pass_rate | tool_call_pass_rate | skipped_coverage | cleanup_success_rate | unknown_tool_validation_count | p50_ms | p95_ms | estimated_prompt_tokens | llm_call_count | selected_skill_tokens | estimated_cost_usd |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| jsonplaceholder-input-doc | 1 | 1 | 1 | 0 | 1 | 0 | 1 | 1 | 155882 | 155882 | 11907 | 0 | 0 | 0.0035721 |

## Backend Tool-Call Matrix By API Type
| apiType | count | build_success_rate | metadata_readiness_rate | inspector_pass_rate | tool_call_pass_rate | skipped_coverage | cleanup_success_rate | unknown_tool_validation_count | p50_ms | p95_ms | estimated_prompt_tokens | llm_call_count | selected_skill_tokens | estimated_cost_usd |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| public_crud_input_doc | 1 | 1 | 1 | 0 | 1 | 0 | 1 | 1 | 155882 | 155882 | 11907 | 0 | 0 | 0.0035721 |

## Backend Tool-Call Matrix By Skill Selection
| skillSelectionMode | count | build_success_rate | metadata_readiness_rate | inspector_pass_rate | tool_call_pass_rate | skipped_coverage | cleanup_success_rate | unknown_tool_validation_count | p50_ms | p95_ms | estimated_prompt_tokens | llm_call_count | selected_skill_tokens | estimated_cost_usd |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dynamic | 1 | 1 | 1 | 0 | 1 | 0 | 1 | 1 | 155882 | 155882 | 11907 | 0 | 0 | 0.0035721 |

## Backend Tool-Call Matrix By RAG
| ragEnabled | count | build_success_rate | metadata_readiness_rate | inspector_pass_rate | tool_call_pass_rate | skipped_coverage | cleanup_success_rate | unknown_tool_validation_count | p50_ms | p95_ms | estimated_prompt_tokens | llm_call_count | selected_skill_tokens | estimated_cost_usd |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rag_on | 1 | 1 | 1 | 0 | 1 | 0 | 1 | 1 | 155882 | 155882 | 11907 | 0 | 0 | 0.0035721 |


## Benchmark Runs
| itemId | apiDocId | apiType | mode | repeatIndex | ok | inspectorPassRate | cleanupStatus | serverId | durationMs | rag_retrieval_status | rag_real_examiner_event_count | estimated_prompt_tokens | estimated_completion_tokens | estimated_total_tokens | estimated_cost_usd | usage_status | usage_source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| jsonplaceholder-input-doc | jsonplaceholder-input-doc | public_crud_input_doc | backend-api-toolcall | 1 | true | 0 | removed | a5762210-9737-471f-bd66-8e5121a47711 | 155882 | evaluated | 1 | 11907 | 0 | 11907 | 0.0035721 | complete | mixed |

## Dashboard Runs
_No data._

## Static vs Dynamic / Mode Comparison
| mode_key | count | success_rate | runtime_success_rate | p50_ms | p95_ms | median_tool_count |
| --- | --- | --- | --- | --- | --- | --- |
| backend-api-toolcall:dynamic:rag:metaclaw | 1 | 1 | 1 | 155882 | 155882 | 8 |

## RAG Comparison
| rag_key | count | success_rate | runtime_success_rate | p50_ms | p95_ms | median_tool_count |
| --- | --- | --- | --- | --- | --- | --- |
| rag | 1 | 1 | 1 | 155882 | 155882 | 8 |

## Runtime Reliability
| source | count | success_rate | p50_ms | p95_ms | median_tool_count |
| --- | --- | --- | --- | --- | --- |
| event:success | 1 | 1 | 104 | 104 | 8 |
| benchmark:backend-api-toolcall | 1 | 1 | 155882 | 155882 | 8 |

## Robustness By API Type
| apiType | count | success_rate | runtime_success_rate | p50_ms | p95_ms | median_tool_count |
| --- | --- | --- | --- | --- | --- | --- |
| public_crud_input_doc | 1 | 1 | 1 | 155882 | 155882 | 8 |

## Feedback
| feedback_event | count | success | failure | likes | dislikes |
| --- | --- | --- | --- | --- | --- |
| generation_feedback_recorded | 1 | 1 | 0 | 0 | 0 |

## Build Summary
| build_request_id | server_id | status | total_duration_ms | event_count |
| --- | --- | --- | --- | --- |
| track-mapr-metrics-matrix-smoke-20260523-03-dynamic-rag-on-jsonplaceholder-input-doc-r1-492986b3 | a5762210-9737-471f-bd66-8e5121a47711 | success | 65711 | 3 |

## Stage Summary
| event | count | success | failure | timeout | p50_ms | p95_ms |
| --- | --- | --- | --- | --- | --- | --- |
| chatbot-backend:chat:chat_stream_completed | 1 | 1 | 0 | 0 | 141083 | 141083 |
| chatbot-backend:generation:generator_completed | 1 | 1 | 0 | 0 | 128570 | 128570 |
| chatbot-backend:langgraph_stream:langgraph_stream_completed | 1 | 1 | 0 | 0 | 128561 | 128561 |
| chatbot-backend:orchestration:supervisor_routed | 1 | 1 | 0 | 0 | 128569 | 128569 |
| chatbot-backend:rag:examiner_completed | 1 | 1 | 0 | 0 | 128570 | 128570 |
| chatbot-backend:runtime:mcp_direct_tool_probes_completed | 1 | 1 | 0 | 0 | 3015 | 3015 |
| chatbot-backend:runtime:mcp_metadata_checked | 1 | 1 | 0 | 0 | 104 | 104 |
| chatbot-backend:runtime:mcp_tool_outcomes_completed | 1 | 1 | 0 | 0 | 3022 | 3022 |
| langgraph-agent:generation:generator_completed | 1 | 1 | 0 | 0 | 128568 | 128568 |
| langgraph-agent:orchestration:supervisor_routed | 1 | 1 | 0 | 0 | 128567 | 128567 |
| langgraph-agent:rag:examiner_completed | 1 | 1 | 0 | 0 | 128568 | 128568 |
| mcp-gen:build:mcp_create_completed | 1 | 1 | 0 | 0 | 65711 | 65711 |
| mcp-gen:build:mcp_status_updated | 3 | 3 | 0 | 0 |  |  |
| mcp-gen:docker:container_start_completed | 1 | 1 | 0 | 0 | 1070 | 1070 |
| mcp-gen:docker:docker_build_completed | 1 | 1 | 0 | 0 | 14 | 14 |
| mcp-gen:generation:generation_feedback_recorded | 1 | 1 | 0 | 0 | 19958 | 19958 |
| mcp-gen:generation:openapi_generation_completed | 1 | 1 | 0 | 0 | 19958 | 19958 |
| mcp-gen:input_normalization:mcp_create_input_normalized | 1 | 1 | 0 | 0 | 21 | 21 |
