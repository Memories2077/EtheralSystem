## ADDED Requirements

### Requirement: Dashboard and benchmark variants use shared semantics
The backend API tool-call matrix benchmark SHALL use the same RAG and skill-selection semantics as dashboard-created manual runs so scripted and manual reports can be compared.

#### Scenario: Static dashboard run matches static benchmark variant
- **WHEN** a dashboard run selects static skill selection
- **THEN** its effective flags match the benchmark static variants by setting dynamic skill selection to disabled
- **AND** reports group the run under the same static skill-selection bucket as benchmark rows

#### Scenario: Dynamic dashboard run matches dynamic benchmark variant
- **WHEN** a dashboard run selects dynamic skill selection
- **THEN** its effective flags match the benchmark dynamic variants by setting dynamic skill selection to enabled and `skillSelectionVariant=dynamic`
- **AND** reports group the run under the same dynamic skill-selection bucket as benchmark rows

#### Scenario: Dashboard RAG mode matches benchmark RAG mode
- **WHEN** a dashboard run selects RAG on or off
- **THEN** reports group the run under the same RAG bucket as benchmark rows with the equivalent `ragEnabled` value

### Requirement: Benchmark reports preserve tool-call pass-rate meaning
The backend API tool-call matrix benchmark SHALL preserve the same tool-call pass-rate denominator rules used by dashboard-created manual runs.

#### Scenario: Tool-call outcomes are absent
- **WHEN** a run record has build and metadata evidence but no tool-call outcome evidence
- **THEN** aggregate benchmark reports mark tool-call pass rate as unknown for that run
- **AND** the run is not counted as a failed tool-call validation

#### Scenario: Only skipped tools exist
- **WHEN** a run record contains only skipped tool outcomes
- **THEN** aggregate benchmark reports show skipped coverage
- **AND** the run does not contribute attempted tools to the tool-call pass-rate denominator

#### Scenario: Attempted live-callable tools exist
- **WHEN** a run record contains successful or failed attempted tool outcomes
- **THEN** aggregate benchmark reports compute tool-call pass rate from attempted live-callable tools only
- **AND** build success rate and metadata readiness rate remain independent from tool-call pass rate

### Requirement: Benchmark run records include dashboard-compatible report fields
The backend API tool-call matrix benchmark SHALL write raw run records with the fields needed to merge or compare dashboard-created runs and scripted benchmark runs.

#### Scenario: Raw run record is written
- **WHEN** a benchmark case completes
- **THEN** its raw JSONL record includes `experimentId`, `caseId`, `variantId`, `repeatIndex`, provider, model, git commit, effective RAG and skill-selection flags, build status, metadata status, latency, estimated token fields, and tool outcome counts
- **AND** fields that also exist for dashboard-created runs use compatible names and value semantics

#### Scenario: Report export groups mixed run sources
- **WHEN** report export reads both dashboard-created run evidence and benchmark matrix run records for the same experiment id
- **THEN** exported CSV and Markdown summaries can group rows by variant, RAG mode, skill-selection mode, case or manual source, and API type where available
- **AND** missing dashboard-only or benchmark-only fields are represented as empty or unknown rather than causing export failure
