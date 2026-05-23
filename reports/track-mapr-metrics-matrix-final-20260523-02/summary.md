# Research Metrics Report

Experiment: track-mapr-metrics-matrix-final-20260523-02
API Doc Batch: all
Generated: 2026-05-23T08:49:55.200Z

## 2x2 Variant Matrix
| skill_selection | rag_off_variant | rag_off_count | rag_off_build_success_rate | rag_off_endpoint_coverage | rag_off_tool_call_pass_rate | rag_on_variant | rag_on_count | rag_on_build_success_rate | rag_on_endpoint_coverage | rag_on_tool_call_pass_rate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| static | static-rag-off | 9 | 1 | 0.9306 | 0.8333 | static-rag-on | 9 | 1 | 0.9028 | 0.8333 |
| dynamic | dynamic-rag-off | 9 | 1 | 0.9583 | 0.8333 | dynamic-rag-on | 9 | 1 | 0.9583 | 0.8333 |

## Ablation Effects
| metric | rag_on_average | rag_off_average | rag_uplift | dynamic_average | static_average | static_vs_dynamic_success_delta | rag_on_count | rag_off_count |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| build_success_rate | 1 | 1 | 0 | 1 | 1 | 0 | 2 | 2 |
| metadata_readiness_rate | 1 | 1 | 0 | 1 | 1 | 0 | 2 | 2 |
| mcp_handshake_pass_rate | 1 | 1 | 0 | 1 | 1 | 0 | 2 | 2 |
| tool_call_pass_rate | 0.8333 | 0.8333 | 0 | 0.8333 | 0.8333 | 0 | 2 | 2 |
| compile_pass_rate | 1 | 1 | 0 | 1 | 1 | 0 | 2 | 2 |
| endpoint_coverage | 0.9305 | 0.9445 | -0.014 | 0.9583 | 0.9167 | 0.0416 | 2 | 2 |
| hallucinated_tool_rate | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 2 |
| schema_validity_rate | 0.1805 | 0.1736 | 0.0069 | 0.1667 | 0.1875 | -0.0208 | 2 | 2 |

## Quality By Variant
| variantId | count | endpoint_coverage | hallucinated_tool_rate | schema_validity_rate | expected_operation_count | mapped_operation_count | generated_tool_count | hallucinated_tool_count | schema_valid_tool_count |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dynamic-rag-off | 9 | 0.9583 | 0 | 0.1667 | 72 | 69 | 72 | 0 | 12 |
| dynamic-rag-on | 9 | 0.9583 | 0 | 0.1667 | 72 | 69 | 72 | 0 | 12 |
| static-rag-off | 9 | 0.9306 | 0 | 0.1806 | 72 | 67 | 72 | 0 | 13 |
| static-rag-on | 9 | 0.9028 | 0 | 0.1944 | 72 | 65 | 72 | 0 | 14 |

## RAG Retrieval By Variant
| variantId | count | applicable_count | evaluated_count | missing_real_examiner_count | no_evidence_count | retrieval_statuses | precision_at_3 | recall_at_3 | mrr_at_3 | retrieved_evidence_count | relevant_evidence_count | retrieval_hit_count |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dynamic-rag-on | 9 | 9 | 9 | 0 | 0 | evaluated | 1 | 0.4004 | 1 | 27 | 72 | 27 |
| static-rag-on | 9 | 9 | 9 | 0 | 0 | evaluated | 1 | 0.4004 | 1 | 27 | 72 | 27 |

## Backend Tool-Call Matrix By API Doc
| apiDocId | count | build_success_rate | metadata_readiness_rate | mcp_handshake_pass_rate | compile_pass_rate | endpoint_coverage | hallucinated_tool_rate | schema_validity_rate | inspector_pass_rate | tool_call_pass_rate | skipped_coverage | cleanup_success_rate | cleanup_removed_count | cleanup_failed_count | usage_complete_count | usage_unavailable_count | usage_complete_rate | usage_statuses | p50_build_total_latency_ms | p95_build_total_latency_ms | estimated_total_tokens | tokens_per_successful_server | estimated_cost_usd | estimated_cost_per_successful_server |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dummyjson-input-doc | 12 | 1 | 1 | 1 | 1 | 0.9375 | 0 | 0.1563 | 0 | 0.75 | 0 | 1 | 12 | 0 | 12 | 0 | 1 | complete | 121403 | 144539 | 156259 | 13021.5833 | 0.0468777 | 0.0039 |
| jsonplaceholder-input-doc | 12 | 1 | 1 | 1 | 1 | 1 | 0 | 0.125 | 0 | 1 | 0 | 1 | 12 | 0 | 12 | 0 | 1 | complete | 113665 | 125312 | 139523 | 11626.9167 | 0.0418569 | 0.0035 |
| pokeapi-input-doc | 12 | 1 | 1 | 1 | 1 | 0.875 | 0 | 0.25 | 0 | 0.75 | 0 | 1 | 12 | 0 | 12 | 0 | 1 | complete | 126323 | 150218 | 164527 | 13710.5833 | 0.0493581 | 0.0041 |

## Backend Tool-Call Matrix By Variant
| variantId | count | build_success_rate | metadata_readiness_rate | mcp_handshake_pass_rate | compile_pass_rate | endpoint_coverage | hallucinated_tool_rate | schema_validity_rate | inspector_pass_rate | tool_call_pass_rate | skipped_coverage | cleanup_success_rate | unknown_tool_validation_count | usage_complete_count | usage_unavailable_count | usage_complete_rate | usage_statuses | p50_build_total_latency_ms | p95_build_total_latency_ms | estimated_total_tokens | tokens_per_successful_server | estimated_cost_usd | estimated_cost_per_successful_server |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dynamic-rag-off | 9 | 1 | 1 | 1 | 1 | 0.9583 | 0 | 0.1667 | 0 | 0.8333 | 0 | 1 | 9 | 9 | 0 | 1 | complete | 121403 | 130663 | 115385 | 12820.5556 | 0.0346155 | 0.0038 |
| dynamic-rag-on | 9 | 1 | 1 | 1 | 1 | 0.9583 | 0 | 0.1667 | 0 | 0.8333 | 0 | 1 | 9 | 9 | 0 | 1 | complete | 122610 | 141549 | 115609 | 12845.4444 | 0.0346827 | 0.0039 |
| static-rag-off | 9 | 1 | 1 | 1 | 1 | 0.9306 | 0 | 0.1806 | 0 | 0.8333 | 0 | 1 | 9 | 9 | 0 | 1 | complete | 114407 | 144539 | 112944 | 12549.3333 | 0.0338832 | 0.0038 |
| static-rag-on | 9 | 1 | 1 | 1 | 1 | 0.9028 | 0 | 0.1944 | 0 | 0.8333 | 0 | 1 | 9 | 9 | 0 | 1 | complete | 126843 | 150218 | 116371 | 12930.1111 | 0.0349113 | 0.0039 |

## Backend Tool-Call Matrix By Case
| caseId | count | build_success_rate | metadata_readiness_rate | inspector_pass_rate | tool_call_pass_rate | skipped_coverage | cleanup_success_rate | unknown_tool_validation_count | p50_ms | p95_ms | estimated_prompt_tokens | llm_call_count | selected_skill_tokens | estimated_cost_usd |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dummyjson-input-doc | 12 | 1 | 1 | 0 | 0.75 | 0 | 1 | 12 | 121403 | 144539 | 156259 | 0 | 0 | 0.0468777 |
| jsonplaceholder-input-doc | 12 | 1 | 1 | 0 | 1 | 0 | 1 | 12 | 113665 | 125312 | 139523 | 0 | 0 | 0.0418569 |
| pokeapi-input-doc | 12 | 1 | 1 | 0 | 0.75 | 0 | 1 | 12 | 126323 | 150218 | 164527 | 0 | 0 | 0.0493581 |

## Backend Tool-Call Matrix By API Type
| apiType | count | build_success_rate | metadata_readiness_rate | inspector_pass_rate | tool_call_pass_rate | skipped_coverage | cleanup_success_rate | unknown_tool_validation_count | p50_ms | p95_ms | estimated_prompt_tokens | llm_call_count | selected_skill_tokens | estimated_cost_usd |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| public_crud_input_doc | 12 | 1 | 1 | 0 | 1 | 0 | 1 | 12 | 113665 | 125312 | 139523 | 0 | 0 | 0.0418569 |
| public_fake_crud_input_doc | 12 | 1 | 1 | 0 | 0.75 | 0 | 1 | 12 | 121403 | 144539 | 156259 | 0 | 0 | 0.0468777 |
| public_readonly_input_doc | 12 | 1 | 1 | 0 | 0.75 | 0 | 1 | 12 | 126323 | 150218 | 164527 | 0 | 0 | 0.0493581 |

## Backend Tool-Call Matrix By Skill Selection
| skillSelectionMode | count | build_success_rate | metadata_readiness_rate | inspector_pass_rate | tool_call_pass_rate | skipped_coverage | cleanup_success_rate | unknown_tool_validation_count | p50_ms | p95_ms | estimated_prompt_tokens | llm_call_count | selected_skill_tokens | estimated_cost_usd |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dynamic | 18 | 1 | 1 | 0 | 0.8333 | 0 | 1 | 18 | 121403 | 141549 | 230994 | 0 | 0 | 0.0692982 |
| static | 18 | 1 | 1 | 0 | 0.8333 | 0 | 1 | 18 | 122679 | 150218 | 229315 | 0 | 0 | 0.0687945 |

## Backend Tool-Call Matrix By RAG
| ragEnabled | count | build_success_rate | metadata_readiness_rate | inspector_pass_rate | tool_call_pass_rate | skipped_coverage | cleanup_success_rate | unknown_tool_validation_count | p50_ms | p95_ms | estimated_prompt_tokens | llm_call_count | selected_skill_tokens | estimated_cost_usd |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rag_off | 18 | 1 | 1 | 0 | 0.8333 | 0 | 1 | 18 | 116587 | 144539 | 228329 | 0 | 0 | 0.06849870000000001 |
| rag_on | 18 | 1 | 1 | 0 | 0.8333 | 0 | 1 | 18 | 123818 | 150218 | 231980 | 0 | 0 | 0.069594 |


## Benchmark Runs
| itemId | apiDocId | apiType | mode | repeatIndex | ok | inspectorPassRate | cleanupStatus | serverId | durationMs | rag_retrieval_status | rag_real_examiner_event_count | estimated_prompt_tokens | estimated_completion_tokens | estimated_total_tokens | estimated_cost_usd | usage_status | usage_source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| jsonplaceholder-input-doc | jsonplaceholder-input-doc | public_crud_input_doc | backend-api-toolcall | 1 | true | 0 | removed | 50955035-864f-4261-8d8c-dc4989d7710b | 104082 | not_applicable_rag_disabled | 0 | 11574 | 0 | 11574 | 0.0034722 | complete | mixed |
| jsonplaceholder-input-doc | jsonplaceholder-input-doc | public_crud_input_doc | backend-api-toolcall | 2 | true | 0 | removed | d942d527-31b7-4478-b056-5a18a2c7ca23 | 105735 | not_applicable_rag_disabled | 0 | 11276 | 0 | 11276 | 0.0033828 | complete | mixed |
| jsonplaceholder-input-doc | jsonplaceholder-input-doc | public_crud_input_doc | backend-api-toolcall | 3 | true | 0 | removed | 511f3917-4b56-45ee-b7c9-aeb5d738a4f4 | 113665 | not_applicable_rag_disabled | 0 | 12186 | 0 | 12186 | 0.0036558 | complete | mixed |
| dummyjson-input-doc | dummyjson-input-doc | public_fake_crud_input_doc | backend-api-toolcall | 1 | true | 0 | removed | 1d6b2d73-4fbd-46fd-9cea-475445599573 | 110109 | not_applicable_rag_disabled | 0 | 12803 | 0 | 12803 | 0.0038409 | complete | mixed |
| dummyjson-input-doc | dummyjson-input-doc | public_fake_crud_input_doc | backend-api-toolcall | 2 | true | 0 | removed | fecfb28c-ef8c-4a64-8745-d7e3c7b13a3f | 114407 | not_applicable_rag_disabled | 0 | 12308 | 0 | 12308 | 0.0036924 | complete | mixed |
| dummyjson-input-doc | dummyjson-input-doc | public_fake_crud_input_doc | backend-api-toolcall | 3 | true | 0 | removed | 8ccda2bb-36ca-4969-9250-fd1353e473d4 | 144539 | not_applicable_rag_disabled | 0 | 13035 | 0 | 13035 | 0.0039105 | complete | mixed |
| pokeapi-input-doc | pokeapi-input-doc | public_readonly_input_doc | backend-api-toolcall | 1 | true | 0 | removed | 78fe7069-d5c2-46d7-80e0-bb93b8b761c2 | 115316 | not_applicable_rag_disabled | 0 | 13299 | 0 | 13299 | 0.0039897 | complete | mixed |
| pokeapi-input-doc | pokeapi-input-doc | public_readonly_input_doc | backend-api-toolcall | 2 | true | 0 | removed | aeff2af4-72ec-4ee6-b634-a33a501f07d2 | 118696 | not_applicable_rag_disabled | 0 | 13022 | 0 | 13022 | 0.0039066 | complete | mixed |
| pokeapi-input-doc | pokeapi-input-doc | public_readonly_input_doc | backend-api-toolcall | 3 | true | 0 | removed | 107e7a9d-20ca-4430-8415-458583a026c1 | 128630 | not_applicable_rag_disabled | 0 | 13441 | 0 | 13441 | 0.0040323 | complete | mixed |
| jsonplaceholder-input-doc | jsonplaceholder-input-doc | public_crud_input_doc | backend-api-toolcall | 1 | true | 0 | removed | 2767c55d-6361-4e0c-8f0f-4348bdce15d7 | 122679 | evaluated | 1 | 11602 | 0 | 11602 | 0.0034806 | complete | mixed |
| jsonplaceholder-input-doc | jsonplaceholder-input-doc | public_crud_input_doc | backend-api-toolcall | 2 | true | 0 | removed | f322a343-9d39-4f25-956b-6937097c8263 | 109112 | evaluated | 1 | 11479 | 0 | 11479 | 0.0034437 | complete | mixed |
| jsonplaceholder-input-doc | jsonplaceholder-input-doc | public_crud_input_doc | backend-api-toolcall | 3 | true | 0 | removed | 34c778ad-e56e-47d9-8019-0d1274ae945e | 124213 | evaluated | 1 | 11329 | 0 | 11329 | 0.0033987 | complete | mixed |
| dummyjson-input-doc | dummyjson-input-doc | public_fake_crud_input_doc | backend-api-toolcall | 1 | true | 0 | removed | c36ca74e-ed68-4c5a-96b1-20713bd36c18 | 130347 | evaluated | 1 | 13568 | 0 | 13568 | 0.0040704 | complete | mixed |
| dummyjson-input-doc | dummyjson-input-doc | public_fake_crud_input_doc | backend-api-toolcall | 2 | true | 0 | removed | f7382ddf-da8f-42d7-b109-c093d1946a66 | 131070 | evaluated | 1 | 12275 | 0 | 12275 | 0.0036825 | complete | mixed |
| dummyjson-input-doc | dummyjson-input-doc | public_fake_crud_input_doc | backend-api-toolcall | 3 | true | 0 | removed | 8a4a7e6e-622f-44b7-86b7-36b440445141 | 123818 | evaluated | 1 | 13520 | 0 | 13520 | 0.004056 | complete | mixed |
| pokeapi-input-doc | pokeapi-input-doc | public_readonly_input_doc | backend-api-toolcall | 1 | true | 0 | removed | 22db96cd-7062-42b1-abd0-12a54c98a874 | 150218 | evaluated | 1 | 14801 | 0 | 14801 | 0.0044403 | complete | mixed |
| pokeapi-input-doc | pokeapi-input-doc | public_readonly_input_doc | backend-api-toolcall | 2 | true | 0 | removed | 66bfbdff-e4ca-491a-b830-266defac6db5 | 126843 | evaluated | 1 | 14038 | 0 | 14038 | 0.0042114 | complete | mixed |
| pokeapi-input-doc | pokeapi-input-doc | public_readonly_input_doc | backend-api-toolcall | 3 | true | 0 | removed | 0651382c-d2c3-49fc-9a68-959111802041 | 144721 | evaluated | 1 | 13759 | 0 | 13759 | 0.0041277 | complete | mixed |
| jsonplaceholder-input-doc | jsonplaceholder-input-doc | public_crud_input_doc | backend-api-toolcall | 1 | true | 0 | removed | c64ec105-e88b-42ce-98b2-c50df5902366 | 125312 | not_applicable_rag_disabled | 0 | 11850 | 0 | 11850 | 0.003555 | complete | mixed |
| jsonplaceholder-input-doc | jsonplaceholder-input-doc | public_crud_input_doc | backend-api-toolcall | 2 | true | 0 | removed | f02cf1d8-1d74-4c4c-aae8-5e25414d8250 | 102476 | not_applicable_rag_disabled | 0 | 11951 | 0 | 11951 | 0.0035853 | complete | mixed |
| jsonplaceholder-input-doc | jsonplaceholder-input-doc | public_crud_input_doc | backend-api-toolcall | 3 | true | 0 | removed | 7e983cce-ddc8-4291-88cb-4d9108d9aac9 | 104224 | not_applicable_rag_disabled | 0 | 11657 | 0 | 11657 | 0.0034971 | complete | mixed |
| dummyjson-input-doc | dummyjson-input-doc | public_fake_crud_input_doc | backend-api-toolcall | 1 | true | 0 | removed | 3df56c02-4aa4-4982-a3c2-bf0a1500fdc7 | 118667 | not_applicable_rag_disabled | 0 | 13233 | 0 | 13233 | 0.0039699 | complete | mixed |
| dummyjson-input-doc | dummyjson-input-doc | public_fake_crud_input_doc | backend-api-toolcall | 2 | true | 0 | removed | b529a961-a49d-449d-8386-3e3fe568baf7 | 130663 | not_applicable_rag_disabled | 0 | 13338 | 0 | 13338 | 0.0040014 | complete | mixed |
| dummyjson-input-doc | dummyjson-input-doc | public_fake_crud_input_doc | backend-api-toolcall | 3 | true | 0 | removed | 97166566-a421-473f-a703-5b9e2855073e | 121403 | not_applicable_rag_disabled | 0 | 12863 | 0 | 12863 | 0.0038589 | complete | mixed |
| pokeapi-input-doc | pokeapi-input-doc | public_readonly_input_doc | backend-api-toolcall | 1 | true | 0 | removed | f614e3c7-b900-4194-9264-c34de690c758 | 126323 | not_applicable_rag_disabled | 0 | 13831 | 0 | 13831 | 0.0041493 | complete | mixed |
| pokeapi-input-doc | pokeapi-input-doc | public_readonly_input_doc | backend-api-toolcall | 2 | true | 0 | removed | d9d52fad-e9f9-4774-b652-229409873dcb | 122929 | not_applicable_rag_disabled | 0 | 12806 | 0 | 12806 | 0.0038418 | complete | mixed |
| pokeapi-input-doc | pokeapi-input-doc | public_readonly_input_doc | backend-api-toolcall | 3 | true | 0 | removed | c0b1ff5e-f1f5-4986-a30a-4edfe6a73431 | 116587 | not_applicable_rag_disabled | 0 | 13856 | 0 | 13856 | 0.0041568 | complete | mixed |
| jsonplaceholder-input-doc | jsonplaceholder-input-doc | public_crud_input_doc | backend-api-toolcall | 1 | true | 0 | removed | c3d81eef-d600-43da-8649-643515004a39 | 116808 | evaluated | 1 | 11502 | 0 | 11502 | 0.0034506 | complete | mixed |
| jsonplaceholder-input-doc | jsonplaceholder-input-doc | public_crud_input_doc | backend-api-toolcall | 2 | true | 0 | removed | 43d0319a-07d9-4ded-8e8e-829d6cb49cb1 | 122610 | evaluated | 1 | 11262 | 0 | 11262 | 0.0033786 | complete | mixed |
| jsonplaceholder-input-doc | jsonplaceholder-input-doc | public_crud_input_doc | backend-api-toolcall | 3 | true | 0 | removed | 664913c5-6ff7-4c45-affd-64d9de71e698 | 114565 | evaluated | 1 | 11855 | 0 | 11855 | 0.0035565 | complete | mixed |
| dummyjson-input-doc | dummyjson-input-doc | public_fake_crud_input_doc | backend-api-toolcall | 1 | true | 0 | removed | 7a67e34d-6544-49fa-b73e-d1061234cc57 | 120052 | evaluated | 1 | 13189 | 0 | 13189 | 0.0039567 | complete | mixed |
| dummyjson-input-doc | dummyjson-input-doc | public_fake_crud_input_doc | backend-api-toolcall | 2 | true | 0 | removed | a8fef3b3-01d2-4f7e-8aa5-5e0864cc26e3 | 120514 | evaluated | 1 | 12725 | 0 | 12725 | 0.0038175 | complete | mixed |
| dummyjson-input-doc | dummyjson-input-doc | public_fake_crud_input_doc | backend-api-toolcall | 3 | true | 0 | removed | c78c6de5-1f6d-43ce-97aa-b144083f1324 | 132647 | evaluated | 1 | 13402 | 0 | 13402 | 0.0040206 | complete | mixed |
| pokeapi-input-doc | pokeapi-input-doc | public_readonly_input_doc | backend-api-toolcall | 1 | true | 0 | removed | 6b124c44-4441-4a69-a926-679e052817ba | 141549 | evaluated | 1 | 13134 | 0 | 13134 | 0.0039402 | complete | mixed |
| pokeapi-input-doc | pokeapi-input-doc | public_readonly_input_doc | backend-api-toolcall | 2 | true | 0 | removed | 80ef1b39-f1d9-4f82-b37b-5f0938a42c70 | 133485 | evaluated | 1 | 14779 | 0 | 14779 | 0.0044337 | complete | mixed |
| pokeapi-input-doc | pokeapi-input-doc | public_readonly_input_doc | backend-api-toolcall | 3 | true | 0 | removed | 5f5c3d51-5416-44ef-837e-ebdec1066ef4 | 122979 | evaluated | 1 | 13761 | 0 | 13761 | 0.0041283 | complete | mixed |

## Dashboard Runs
_No data._

## Static vs Dynamic / Mode Comparison
| mode_key | count | success_rate | runtime_success_rate | p50_ms | p95_ms | median_tool_count |
| --- | --- | --- | --- | --- | --- | --- |
| backend-api-toolcall:dynamic:no_rag:metaclaw | 9 | 1 | 1 | 121403 | 130663 | 8 |
| backend-api-toolcall:dynamic:rag:metaclaw | 9 | 1 | 1 | 122610 | 141549 | 8 |
| backend-api-toolcall:static:no_rag:metaclaw | 9 | 1 | 1 | 114407 | 144539 | 8 |
| backend-api-toolcall:static:rag:metaclaw | 9 | 1 | 1 | 126843 | 150218 | 8 |

## RAG Comparison
| rag_key | count | success_rate | runtime_success_rate | p50_ms | p95_ms | median_tool_count |
| --- | --- | --- | --- | --- | --- | --- |
| no_rag | 18 | 1 | 1 | 116587 | 144539 | 8 |
| rag | 18 | 1 | 1 | 123818 | 150218 | 8 |

## Runtime Reliability
| source | count | success_rate | p50_ms | p95_ms | median_tool_count |
| --- | --- | --- | --- | --- | --- |
| event:success | 36 | 1 | 100 | 154 | 8 |
| benchmark:backend-api-toolcall | 36 | 1 | 122610 | 144721 | 8 |

## Robustness By API Type
| apiType | count | success_rate | runtime_success_rate | p50_ms | p95_ms | median_tool_count |
| --- | --- | --- | --- | --- | --- | --- |
| public_crud_input_doc | 12 | 1 | 1 | 113665 | 125312 | 8 |
| public_fake_crud_input_doc | 12 | 1 | 1 | 121403 | 144539 | 8 |
| public_readonly_input_doc | 12 | 1 | 1 | 126323 | 150218 | 8 |

## Feedback
| feedback_event | count | success | failure | likes | dislikes |
| --- | --- | --- | --- | --- | --- |
| generation_feedback_recorded | 35 | 35 | 0 | 0 | 0 |

## Build Summary
| build_request_id | server_id | status | total_duration_ms | event_count |
| --- | --- | --- | --- | --- |
| track-mapr-metrics-matrix-final-20260523-02-static-rag-off-jsonplaceholder-input-doc-r1-f15d4285 |  | success | 91126 | 1 |
| track-mapr-metrics-matrix-final-20260523-02-static-rag-off-jsonplaceholder-input-doc-r2-16ec3b74 | d942d527-31b7-4478-b056-5a18a2c7ca23 | success | 59428 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-static-rag-off-jsonplaceholder-input-doc-r3-87ae6623 | 511f3917-4b56-45ee-b7c9-aeb5d738a4f4 | success | 77984 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-static-rag-off-dummyjson-input-doc-r1-e5117337 | 1d6b2d73-4fbd-46fd-9cea-475445599573 | success | 71076 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-static-rag-off-dummyjson-input-doc-r2-55e087fc | fecfb28c-ef8c-4a64-8745-d7e3c7b13a3f | success | 73599 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-static-rag-off-dummyjson-input-doc-r3-f32962df | 8ccda2bb-36ca-4969-9250-fd1353e473d4 | success | 84665 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-static-rag-off-pokeapi-input-doc-r1-9ebc07ea | 78fe7069-d5c2-46d7-80e0-bb93b8b761c2 | success | 71726 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-static-rag-off-pokeapi-input-doc-r2-74cddc46 | aeff2af4-72ec-4ee6-b634-a33a501f07d2 | success | 81614 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-static-rag-off-pokeapi-input-doc-r3-0b44b067 | 107e7a9d-20ca-4430-8415-458583a026c1 | success | 73608 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-static-rag-on-jsonplaceholder-input-doc-r1-26cb9b20 | 2767c55d-6361-4e0c-8f0f-4348bdce15d7 | success | 64148 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-static-rag-on-jsonplaceholder-input-doc-r2-9900e8b4 | f322a343-9d39-4f25-956b-6937097c8263 | success | 61648 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-static-rag-on-jsonplaceholder-input-doc-r3-2e252314 | 34c778ad-e56e-47d9-8019-0d1274ae945e | success | 64462 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-static-rag-on-dummyjson-input-doc-r1-5d03b861 | c36ca74e-ed68-4c5a-96b1-20713bd36c18 | success | 72295 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-static-rag-on-dummyjson-input-doc-r2-e679e5ea | f7382ddf-da8f-42d7-b109-c093d1946a66 | success | 67927 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-static-rag-on-dummyjson-input-doc-r3-ca5eaa92 | 8a4a7e6e-622f-44b7-86b7-36b440445141 | success | 75389 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-static-rag-on-pokeapi-input-doc-r1-0291afe7 | 22db96cd-7062-42b1-abd0-12a54c98a874 | success | 85698 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-static-rag-on-pokeapi-input-doc-r2-4d00f6ca | 66bfbdff-e4ca-491a-b830-266defac6db5 | success | 73519 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-static-rag-on-pokeapi-input-doc-r3-f3548276 | 0651382c-d2c3-49fc-9a68-959111802041 | success | 79435 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-dynamic-rag-off-jsonplaceholder-input-doc-r1-b1121a6c | c64ec105-e88b-42ce-98b2-c50df5902366 | success | 76701 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-dynamic-rag-off-jsonplaceholder-input-doc-r2-b1b362ed | f02cf1d8-1d74-4c4c-aae8-5e25414d8250 | success | 68700 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-dynamic-rag-off-jsonplaceholder-input-doc-r3-0fe087b5 | 7e983cce-ddc8-4291-88cb-4d9108d9aac9 | success | 65002 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-dynamic-rag-off-dummyjson-input-doc-r1-81495f14 | 3df56c02-4aa4-4982-a3c2-bf0a1500fdc7 | success | 77311 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-dynamic-rag-off-dummyjson-input-doc-r2-d6a0f18d | b529a961-a49d-449d-8386-3e3fe568baf7 | success | 80589 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-dynamic-rag-off-dummyjson-input-doc-r3-ba0b39e3 | 97166566-a421-473f-a703-5b9e2855073e | success | 70274 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-dynamic-rag-off-pokeapi-input-doc-r1-0648c1dd | f614e3c7-b900-4194-9264-c34de690c758 | success | 78728 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-dynamic-rag-off-pokeapi-input-doc-r2-0226f2ec | d9d52fad-e9f9-4774-b652-229409873dcb | success | 66536 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-dynamic-rag-off-pokeapi-input-doc-r3-7d161e74 | c0b1ff5e-f1f5-4986-a30a-4edfe6a73431 | success | 76634 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-dynamic-rag-on-jsonplaceholder-input-doc-r1-8479a639 | c3d81eef-d600-43da-8649-643515004a39 | success | 65771 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-dynamic-rag-on-jsonplaceholder-input-doc-r2-ffe69ca7 | 43d0319a-07d9-4ded-8e8e-829d6cb49cb1 | success | 72393 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-dynamic-rag-on-jsonplaceholder-input-doc-r3-6085652d | 664913c5-6ff7-4c45-affd-64d9de71e698 | success | 61213 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-dynamic-rag-on-dummyjson-input-doc-r1-a7879bd5 | 7a67e34d-6544-49fa-b73e-d1061234cc57 | success | 68330 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-dynamic-rag-on-dummyjson-input-doc-r2-2cb02ee3 | a8fef3b3-01d2-4f7e-8aa5-5e0864cc26e3 | success | 69226 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-dynamic-rag-on-dummyjson-input-doc-r3-f1479c4b | c78c6de5-1f6d-43ce-97aa-b144083f1324 | success | 75844 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-dynamic-rag-on-pokeapi-input-doc-r1-d55bdcc2 | 6b124c44-4441-4a69-a926-679e052817ba | success | 85914 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-dynamic-rag-on-pokeapi-input-doc-r2-6da1f410 | 80ef1b39-f1d9-4f82-b37b-5f0938a42c70 | success | 74306 | 3 |
| track-mapr-metrics-matrix-final-20260523-02-dynamic-rag-on-pokeapi-input-doc-r3-55d71523 | 5f5c3d51-5416-44ef-837e-ebdec1066ef4 | success | 64115 | 3 |

## Stage Summary
| event | count | success | failure | timeout | p50_ms | p95_ms |
| --- | --- | --- | --- | --- | --- | --- |
| chatbot-backend:chat:chat_stream_completed | 36 | 36 | 0 | 0 | 105873 | 126212 |
| chatbot-backend:generation:generator_completed | 36 | 36 | 0 | 0 | 91379 | 110019 |
| chatbot-backend:langgraph_stream:langgraph_stream_completed | 36 | 36 | 0 | 0 | 91373 | 110013 |
| chatbot-backend:orchestration:supervisor_routed | 36 | 36 | 0 | 0 | 91377 | 110017 |
| chatbot-backend:rag:examiner_completed | 36 | 18 | 0 | 0 | 91378 | 110018 |
| chatbot-backend:runtime:mcp_direct_tool_probes_completed | 36 | 12 | 24 | 0 | 2301 | 4764 |
| chatbot-backend:runtime:mcp_metadata_checked | 36 | 36 | 0 | 0 | 100 | 154 |
| chatbot-backend:runtime:mcp_tool_outcomes_completed | 36 | 12 | 24 | 0 | 2345 | 5539 |
| langgraph-agent:generation:generator_completed | 36 | 36 | 0 | 0 | 91376 | 110016 |
| langgraph-agent:orchestration:supervisor_routed | 36 | 36 | 0 | 0 | 91375 | 110014 |
| langgraph-agent:rag:examiner_completed | 36 | 18 | 0 | 0 | 91375 | 110015 |
| langgraph-agent:rag:rag_retrieval_completed | 6 | 6 | 0 | 0 | 806 | 987 |
| mcp-gen:build:mcp_create_completed | 35 | 35 | 0 | 0 | 72393 | 85698 |
| mcp-gen:build:mcp_status_updated | 105 | 105 | 0 | 0 |  |  |
| mcp-gen:docker:container_start_completed | 35 | 35 | 0 | 0 | 1046 | 1146 |
| mcp-gen:docker:docker_build_completed | 35 | 35 | 0 | 0 | 3 | 10 |
| mcp-gen:generation:generation_feedback_recorded | 35 | 35 | 0 | 0 | 26629 | 42455 |
| mcp-gen:generation:openapi_generation_completed | 35 | 35 | 0 | 0 | 26629 | 42455 |
| mcp-gen:input_normalization:mcp_create_input_normalized | 35 | 35 | 0 | 0 | 7 | 13 |
| mcp-gen:skill_selection:skill_selection_completed | 18 | 18 | 0 | 0 | 0 | 2 |
| mcp-gen:skill_selection:skill_selection_initialized | 1 | 1 | 0 | 0 | 129 | 129 |
