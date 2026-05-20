## ADDED Requirements

### Requirement: Research metrics capture matrix batch and cleanup outcomes
The system SHALL capture per-run and per-batch research metrics needed to audit the formatted-input matrix.

#### Scenario: Run records include batch identity and expected counts
- **WHEN** a research matrix run starts
- **THEN** raw metrics include `apiDocId`, fixture path, declared endpoint count, expected build count for the active plan, `variantId`, and `repeatIndex`
- **AND** the demo plan records 12 expected build attempts

#### Scenario: Run records include direct MCP validation outcomes
- **WHEN** backend direct MCP validation runs for a generated MCP server
- **THEN** raw metrics include the validation method, safe tool-call pass count, safe tool-call fail count, skipped count, and direct tool-call pass rate
- **AND** direct validation diagnostics are recorded without storing secrets, API keys, cookies, or full private prompts

#### Scenario: Run records include Inspector diagnostic outcomes
- **WHEN** Inspector CLI diagnostic validation runs for a generated MCP server
- **THEN** raw metrics include Inspector connection status, listed tool count, safe tool-call pass count, safe tool-call fail count, skipped count, and Inspector pass rate
- **AND** Inspector diagnostics are recorded without storing secrets, API keys, cookies, or full private prompts

#### Scenario: Run records include cleanup outcomes
- **WHEN** generated container cleanup is attempted
- **THEN** raw metrics include generated `containerId`, cleanup status, cleanup duration, and cleanup error text when cleanup fails
- **AND** aggregate summaries include created, removed, skipped, and failed cleanup counts

### Requirement: Research export supports per API-doc batch reports
The system SHALL export CSV and Markdown summaries for each completed API-doc batch in addition to experiment-level summaries.

#### Scenario: API-doc batch export
- **WHEN** an API-doc batch completes for an experiment
- **THEN** the exporter writes batch-scoped CSV and Markdown summaries grouped by API doc, variant, repeat, skill-selection mode, and RAG mode
- **AND** the summaries include build success rate, metadata readiness rate, Inspector pass rate, backend tool-call pass rate when available, skipped coverage, latency percentiles, and cleanup success rate

#### Scenario: Export is safe to call repeatedly
- **WHEN** the research runner calls export after multiple API-doc batches in the same experiment
- **THEN** existing batch reports are preserved or deterministically replaced for the same batch id
- **AND** reports for different API docs remain distinguishable by path or filename
