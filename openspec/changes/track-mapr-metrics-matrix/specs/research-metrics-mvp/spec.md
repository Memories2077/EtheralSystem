## ADDED Requirements

### Requirement: MAPR reports expose metric evidence completeness
The system SHALL expose completeness status for final MAPR run-level and aggregate metrics so incomplete evidence cannot be mistaken for valid zero-valued results.

#### Scenario: Run-level export includes completeness fields
- **WHEN** report export processes a MAPR matrix experiment
- **THEN** run-level CSV outputs include build, metadata, MCP handshake, generated tool validation, compile/start validation, cleanup, RAG retrieval, usage, token, and cost evidence status fields where data exists
- **AND** unavailable RAG, token, or cost evidence is represented as not applicable, missing, redacted, or incomplete instead of numeric zero

#### Scenario: Aggregate exports preserve denominators
- **WHEN** report export groups MAPR results by variant, API doc, skill-selection mode, or RAG mode
- **THEN** each aggregate metric that can exclude incomplete evidence includes the evaluated count or completeness count used as its denominator
- **AND** unavailable RAG retrieval, usage, token, or cost values are excluded from the corresponding aggregate denominator

#### Scenario: RAG retrieval aggregates use only applicable RAG-on runs
- **WHEN** report export writes `rag_retrieval_by_variant.csv`
- **THEN** precision@3, recall@3, and MRR@3 are computed only for RAG-on runs with real examiner retrieval evidence
- **AND** RAG-off runs and RAG-on runs missing real examiner evidence are counted separately from evaluated retrieval rows

### Requirement: MAPR final report includes fixed 2x2 ablation evidence
The system SHALL export the final MAPR comparison tables for the fixed static/dynamic by RAG on/off matrix.

#### Scenario: Variant-level paper CSVs are written
- **WHEN** report export runs for a MAPR matrix experiment
- **THEN** it writes `quality_by_variant.csv`, `rag_retrieval_by_variant.csv`, and `ablation_effects.csv`
- **AND** those files include rows for `static-rag-off`, `static-rag-on`, `dynamic-rag-off`, and `dynamic-rag-on` when those variants are present in the experiment

#### Scenario: Markdown summary includes complete 2x2 matrix
- **WHEN** report export writes `summary.md` for the final 36-run MAPR experiment
- **THEN** the summary includes a 2x2 table with both static and dynamic skill-selection rows and both RAG-off and RAG-on columns
- **AND** each variant cell shows the variant id, run count, build success rate, endpoint coverage, and tool-call pass rate

#### Scenario: Ablation deltas use fixed variants only
- **WHEN** report export computes `rag_uplift` and `static_vs_dynamic_success_delta`
- **THEN** `rag_uplift` equals the average RAG-on metric value minus the average RAG-off metric value using only the four fixed variants with non-empty metric values
- **AND** `static_vs_dynamic_success_delta` equals the average dynamic metric value minus the average static metric value using only the four fixed variants with non-empty metric values
- **AND** the output includes the RAG-on and RAG-off counts used for the delta calculation
