# Research Metrics Report

Experiment: backend-toolcall-matrix-paper-21.05.2026-r1
API Doc Batch: all
Generated: 2026-05-21T09:38:55.449Z

## Backend Tool-Call Matrix By API Doc
| apiDocId | count | build_success_rate | metadata_readiness_rate | inspector_pass_rate | tool_call_pass_rate | skipped_coverage | cleanup_success_rate | cleanup_removed_count | cleanup_failed_count | p50_ms | p95_ms | estimated_prompt_tokens | llm_call_count | selected_skill_tokens | estimated_cost_usd |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| jsonplaceholder-input-doc | 4 | 1 | 1 | 0 | 1 | 0.5 | 1 | 4 | 0 | 106687 | 140080 | 0 | 16 | 0 | 0 |
| reddit-input-doc | 4 | 1 | 1 |  |  | 1 | 1 | 4 | 0 | 111061 | 171732 | 0 | 20 | 0 | 0 |
| thedogapi-input-doc | 4 | 1 | 1 | 0 | 1 | 0.875 | 1 | 4 | 0 | 155075 | 157600 | 0 | 16 | 0 | 0 |

## Backend Tool-Call Matrix By Variant
| variantId | count | build_success_rate | metadata_readiness_rate | inspector_pass_rate | tool_call_pass_rate | skipped_coverage | cleanup_success_rate | unknown_tool_validation_count | p50_ms | p95_ms | estimated_prompt_tokens | llm_call_count | selected_skill_tokens | estimated_cost_usd |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dynamic-rag-off | 3 | 1 | 1 | 0 | 1 | 0.7727 | 1 | 3 | 131617 | 155075 | 0 | 12 | 0 | 0 |
| dynamic-rag-on | 3 | 1 | 1 | 0 | 1 | 0.7727 | 1 | 3 | 156279 | 171732 | 0 | 16 | 0 | 0 |
| static-rag-off | 3 | 1 | 1 | 0 | 1 | 0.7727 | 1 | 3 | 107470 | 135950 | 0 | 12 | 0 | 0 |
| static-rag-on | 3 | 1 | 1 | 0 | 1 | 0.7727 | 1 | 3 | 156840 | 157600 | 0 | 12 | 0 | 0 |

## Backend Tool-Call Matrix By Case
| caseId | count | build_success_rate | metadata_readiness_rate | inspector_pass_rate | tool_call_pass_rate | skipped_coverage | cleanup_success_rate | unknown_tool_validation_count | p50_ms | p95_ms | estimated_prompt_tokens | llm_call_count | selected_skill_tokens | estimated_cost_usd |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| jsonplaceholder-input-doc | 4 | 1 | 1 | 0 | 1 | 0.5 | 1 | 4 | 106687 | 140080 | 0 | 16 | 0 | 0 |
| reddit-input-doc | 4 | 1 | 1 |  |  | 1 | 1 | 4 | 111061 | 171732 | 0 | 20 | 0 | 0 |
| thedogapi-input-doc | 4 | 1 | 1 | 0 | 1 | 0.875 | 1 | 4 | 155075 | 157600 | 0 | 16 | 0 | 0 |

## Backend Tool-Call Matrix By API Type
| apiType | count | build_success_rate | metadata_readiness_rate | inspector_pass_rate | tool_call_pass_rate | skipped_coverage | cleanup_success_rate | unknown_tool_validation_count | p50_ms | p95_ms | estimated_prompt_tokens | llm_call_count | selected_skill_tokens | estimated_cost_usd |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| api_key_media_input_doc | 4 | 1 | 1 | 0 | 1 | 0.875 | 1 | 4 | 155075 | 157600 | 0 | 16 | 0 | 0 |
| oauth_auth_input_doc | 4 | 1 | 1 |  |  | 1 | 1 | 4 | 111061 | 171732 | 0 | 20 | 0 | 0 |
| public_crud_input_doc | 4 | 1 | 1 | 0 | 1 | 0.5 | 1 | 4 | 106687 | 140080 | 0 | 16 | 0 | 0 |

## Backend Tool-Call Matrix By Skill Selection
| skillSelectionMode | count | build_success_rate | metadata_readiness_rate | inspector_pass_rate | tool_call_pass_rate | skipped_coverage | cleanup_success_rate | unknown_tool_validation_count | p50_ms | p95_ms | estimated_prompt_tokens | llm_call_count | selected_skill_tokens | estimated_cost_usd |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dynamic | 6 | 1 | 1 | 0 | 1 | 0.7727 | 1 | 6 | 131617 | 171732 | 0 | 28 | 0 | 0 |
| static | 6 | 1 | 1 | 0 | 1 | 0.7727 | 1 | 6 | 135950 | 157600 | 0 | 24 | 0 | 0 |

## Backend Tool-Call Matrix By RAG
| ragEnabled | count | build_success_rate | metadata_readiness_rate | inspector_pass_rate | tool_call_pass_rate | skipped_coverage | cleanup_success_rate | unknown_tool_validation_count | p50_ms | p95_ms | estimated_prompt_tokens | llm_call_count | selected_skill_tokens | estimated_cost_usd |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rag_off | 6 | 1 | 1 | 0 | 1 | 0.7727 | 1 | 6 | 111061 | 155075 | 0 | 24 | 0 | 0 |
| rag_on | 6 | 1 | 1 | 0 | 1 | 0.7727 | 1 | 6 | 156279 | 171732 | 0 | 28 | 0 | 0 |


## Benchmark Runs
| itemId | apiDocId | apiType | mode | repeatIndex | ok | inspectorPassRate | cleanupStatus | serverId | durationMs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| jsonplaceholder-input-doc | jsonplaceholder-input-doc | public_crud_input_doc | backend-api-toolcall | 1 | true | 0 | removed | ed6c8d20-414a-4e36-a36c-75fe8de04d30 | 89618 |
| reddit-input-doc | reddit-input-doc | oauth_auth_input_doc | backend-api-toolcall | 1 | true |  | removed | aeb3e29e-2882-4f41-b0a4-97b9037e1cc3 | 107470 |
| thedogapi-input-doc | thedogapi-input-doc | api_key_media_input_doc | backend-api-toolcall | 1 | true | 0 | removed | a092f216-b3b5-4ca2-a94c-d5331c089dc7 | 135950 |
| jsonplaceholder-input-doc | jsonplaceholder-input-doc | public_crud_input_doc | backend-api-toolcall | 1 | true | 0 | removed | 114a1182-12de-408f-892c-5ecd7b315efa | 140080 |
| reddit-input-doc | reddit-input-doc | oauth_auth_input_doc | backend-api-toolcall | 1 | true |  | removed | 0735bc7d-a120-48f6-ac54-d6fb5f5e0f10 | 156840 |
| thedogapi-input-doc | thedogapi-input-doc | api_key_media_input_doc | backend-api-toolcall | 1 | true | 0 | removed | a3201db8-13b8-41c4-ac05-565bb8fd2e12 | 157600 |
| jsonplaceholder-input-doc | jsonplaceholder-input-doc | public_crud_input_doc | backend-api-toolcall | 1 | true | 0 | removed | 176c9d0f-3d92-4b52-b3a1-d890e0eec6fd | 131617 |
| reddit-input-doc | reddit-input-doc | oauth_auth_input_doc | backend-api-toolcall | 1 | true |  | removed | d0e0ba76-567c-4c0f-8ef0-f63c6daf239e | 111061 |
| thedogapi-input-doc | thedogapi-input-doc | api_key_media_input_doc | backend-api-toolcall | 1 | true | 0 | removed | 340320ef-a055-44d5-b442-121bd77c08a9 | 155075 |
| jsonplaceholder-input-doc | jsonplaceholder-input-doc | public_crud_input_doc | backend-api-toolcall | 1 | true | 0 | removed | d7b22bbb-7598-45a9-b920-e58805444f64 | 106687 |
| reddit-input-doc | reddit-input-doc | oauth_auth_input_doc | backend-api-toolcall | 1 | true |  | removed | bedaf81e-526b-40f0-ba91-dc7837db16cf | 171732 |
| thedogapi-input-doc | thedogapi-input-doc | api_key_media_input_doc | backend-api-toolcall | 1 | true | 0 | removed | 3c698217-510d-46dd-bbf1-b20a252f9802 | 156279 |

## Dashboard Runs
_No data._

## Static vs Dynamic / Mode Comparison
| mode_key | count | success_rate | runtime_success_rate | p50_ms | p95_ms | median_tool_count |
| --- | --- | --- | --- | --- | --- | --- |
| backend-api-toolcall:dynamic:no_rag:metaclaw | 3 | 1 | 1 | 131617 | 155075 | 8 |
| backend-api-toolcall:dynamic:rag:metaclaw | 3 | 1 | 1 | 156279 | 171732 | 8 |
| backend-api-toolcall:static:no_rag:metaclaw | 3 | 1 | 1 | 107470 | 135950 | 8 |
| backend-api-toolcall:static:rag:metaclaw | 3 | 1 | 1 | 156840 | 157600 | 8 |

## RAG Comparison
| rag_key | count | success_rate | runtime_success_rate | p50_ms | p95_ms | median_tool_count |
| --- | --- | --- | --- | --- | --- | --- |
| no_rag | 6 | 1 | 1 | 111061 | 155075 | 8 |
| rag | 6 | 1 | 1 | 156279 | 171732 | 8 |

## Runtime Reliability
| source | count | success_rate | p50_ms | p95_ms | median_tool_count |
| --- | --- | --- | --- | --- | --- |
| event:success | 12 | 1 | 149 | 396 | 8 |
| benchmark:backend-api-toolcall | 12 | 1 | 135950 | 171732 | 8 |

## Robustness By API Type
| apiType | count | success_rate | runtime_success_rate | p50_ms | p95_ms | median_tool_count |
| --- | --- | --- | --- | --- | --- | --- |
| api_key_media_input_doc | 4 | 1 | 1 | 155075 | 157600 | 8 |
| oauth_auth_input_doc | 4 | 1 | 1 | 111061 | 171732 | 6 |
| public_crud_input_doc | 4 | 1 | 1 | 106687 | 140080 | 8 |

## Feedback
| feedback_event | count | success | failure | likes | dislikes |
| --- | --- | --- | --- | --- | --- |
| generation_feedback_recorded | 13 | 13 | 0 | 0 | 0 |

## Build Summary
| build_request_id | server_id | status | total_duration_ms | event_count |
| --- | --- | --- | --- | --- |
| backend-toolcall-matrix-paper-21.05.2026-r1-static-rag-off-jsonplaceholder-input-doc-r1-201fae68 | ed6c8d20-414a-4e36-a36c-75fe8de04d30 | success | 54226 | 3 |
| backend-toolcall-matrix-paper-21.05.2026-r1-static-rag-off-reddit-input-doc-r1-4ea6b7ba | aeb3e29e-2882-4f41-b0a4-97b9037e1cc3 | success | 60067 | 3 |
| backend-toolcall-matrix-paper-21.05.2026-r1-static-rag-off-thedogapi-input-doc-r1-9e54b441 | a092f216-b3b5-4ca2-a94c-d5331c089dc7 | success | 79050 | 3 |
| backend-toolcall-matrix-paper-21.05.2026-r1-static-rag-on-jsonplaceholder-input-doc-r1-230962b1 | 114a1182-12de-408f-892c-5ecd7b315efa | success | 70232 | 3 |
| backend-toolcall-matrix-paper-21.05.2026-r1-static-rag-on-reddit-input-doc-r1-752c68a5 | 0735bc7d-a120-48f6-ac54-d6fb5f5e0f10 | success | 73337 | 3 |
| backend-toolcall-matrix-paper-21.05.2026-r1-static-rag-on-thedogapi-input-doc-r1-03dd7dc9 | a3201db8-13b8-41c4-ac05-565bb8fd2e12 | success | 87870 | 3 |
| backend-toolcall-matrix-paper-21.05.2026-r1-dynamic-rag-off-jsonplaceholder-input-doc-r1-d8929b70 | 176c9d0f-3d92-4b52-b3a1-d890e0eec6fd | success | 86966 | 3 |
| backend-toolcall-matrix-paper-21.05.2026-r1-dynamic-rag-off-reddit-input-doc-r1-6c9239ea | d0e0ba76-567c-4c0f-8ef0-f63c6daf239e | success | 68435 | 3 |
| backend-toolcall-matrix-paper-21.05.2026-r1-dynamic-rag-off-thedogapi-input-doc-r1-7eb1e88c | 340320ef-a055-44d5-b442-121bd77c08a9 | success | 104381 | 3 |
| backend-toolcall-matrix-paper-21.05.2026-r1-dynamic-rag-on-jsonplaceholder-input-doc-r1-b2c3c46f | d7b22bbb-7598-45a9-b920-e58805444f64 | success | 59209 | 3 |
| backend-toolcall-matrix-paper-21.05.2026-r1-dynamic-rag-on-reddit-input-doc-r1-4e7ceaa9 | bedaf81e-526b-40f0-ba91-dc7837db16cf | success | 113714 | 4 |
| backend-toolcall-matrix-paper-21.05.2026-r1-dynamic-rag-on-thedogapi-input-doc-r1-227109f2 | 3c698217-510d-46dd-bbf1-b20a252f9802 | success | 72637 | 3 |

## Stage Summary
| event | count | success | failure | timeout | p50_ms | p95_ms |
| --- | --- | --- | --- | --- | --- | --- |
| chatbot-backend:chat:chat_stream_completed | 12 | 12 | 0 | 0 | 133584 | 170700 |
| chatbot-backend:generation:generator_completed | 12 | 12 | 0 | 0 | 117423 | 157559 |
| chatbot-backend:langgraph_stream:langgraph_stream_completed | 12 | 12 | 0 | 0 | 117412 | 157554 |
| chatbot-backend:orchestration:supervisor_routed | 12 | 12 | 0 | 0 | 117421 | 157558 |
| chatbot-backend:rag:examiner_completed | 12 | 6 | 0 | 0 | 117422 | 157559 |
| chatbot-backend:runtime:mcp_direct_tool_probes_completed | 8 | 8 | 0 | 0 | 642 | 1356 |
| chatbot-backend:runtime:mcp_metadata_checked | 12 | 12 | 0 | 0 | 149 | 396 |
| chatbot-backend:runtime:mcp_tool_outcomes_completed | 12 | 12 | 0 | 0 | 554 | 1375 |
| mcp-gen:build:mcp_create_completed | 12 | 12 | 0 | 0 | 72637 | 113714 |
| mcp-gen:build:mcp_status_updated | 36 | 36 | 0 | 0 |  |  |
| mcp-gen:docker:container_start_completed | 12 | 12 | 0 | 0 | 356 | 429 |
| mcp-gen:docker:docker_build_completed | 12 | 12 | 0 | 0 | 16 | 20 |
| mcp-gen:generation:generation_feedback_recorded | 13 | 13 | 0 | 0 | 26261 | 55554 |
| mcp-gen:generation:openapi_generation_completed | 13 | 13 | 0 | 0 | 26261 | 55554 |
| mcp-gen:input_normalization:mcp_create_input_normalized | 12 | 12 | 0 | 0 | 29 | 88 |
| mcp-gen:skill_selection:skill_selection_completed | 7 | 7 | 0 | 0 | 1 | 2 |
| mcp-gen:skill_selection:skill_selection_initialized | 4 | 4 | 0 | 0 | 64 | 121 |
