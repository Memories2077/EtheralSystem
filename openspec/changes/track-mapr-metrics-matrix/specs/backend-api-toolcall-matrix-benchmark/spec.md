## ADDED Requirements

### Requirement: Benchmark matrix enforces paper-ready MAPR execution
The system SHALL validate the smoke and final MAPR matrix run shapes before accepting benchmark results for paper reporting.

#### Scenario: Smoke run validates the Gemini RAG path
- **WHEN** the runner is invoked for `jsonplaceholder-input-doc` with `dynamic-rag-on`, one repeat, RAG pre-seeding enabled, and strict evidence enabled
- **THEN** the plan contains exactly one build attempt
- **AND** the run is accepted only if it records a successful build, metadata readiness, generated tool validation, real `langgraph-agent` examiner evidence, RAG retrieval metrics, numeric estimated usage, estimated cost, cleanup outcome, and exported report artifacts

#### Scenario: Final MAPR matrix contains all required cells
- **WHEN** the runner is invoked for the final MAPR target with `jsonplaceholder-input-doc`, `dummyjson-input-doc`, `pokeapi-input-doc`, all four fixed variants, 3 repeats, and `--expected-build-count=36`
- **THEN** the validated plan contains every selected API-doc, variant, and repeat combination exactly once
- **AND** the runner fails before the first build if any selected case is unknown, any fixed variant is omitted, the repeat count is not 3, or the expected build count is not 36

#### Scenario: Variant runtime flags match the selected cell
- **WHEN** a matrix cell starts for any fixed variant
- **THEN** the effective Bun runner, Compose service, and LangChain application settings match the selected `RAG_ENABLED`, `DYNAMIC_SKILL_SELECTION`, and `SKILL_SELECTION_VARIANT` values
- **AND** the cell fails with a diagnostic before generation if the runtime environment does not match the selected variant

#### Scenario: Failed cells preserve repair diagnostics
- **WHEN** a smoke or matrix cell fails after creating a generated MCP server or collecting partial evidence
- **THEN** the run record preserves the primary failure diagnostic, generated server identity when known, cleanup status, evidence completeness status, and safe metric fields collected before failure
- **AND** generated containers are retained when required for inspection instead of being removed as a successful cleanup

### Requirement: Benchmark matrix records complete final-run coverage
The system SHALL persist enough plan and run evidence to prove whether the final 36-run MAPR matrix completed fully.

#### Scenario: Plan record declares expected coverage
- **WHEN** the final MAPR matrix begins
- **THEN** the plan record includes the dataset path, label path, case IDs, input fixture hashes, variant IDs, repeat count, expected build count, strict evidence setting, RAG preseed setting, and local events path

#### Scenario: Run records identify every matrix coordinate
- **WHEN** a matrix cell finishes successfully or with a recorded diagnostic
- **THEN** the raw run record includes `apiDocId` or case id, `variantId`, `repeatIndex`, `experimentId`, `traceId`, `buildRequestId`, provider, model, git commit when available, and the expected operation count for that API doc

#### Scenario: Full matrix coverage can be audited
- **WHEN** final run records are read for a MAPR experiment
- **THEN** the records are sufficient to verify that each fixed variant has 9 attempted runs and each selected API-doc has 12 attempted runs
- **AND** missing or duplicate case, variant, and repeat coordinates are reported as coverage defects rather than silently averaged
