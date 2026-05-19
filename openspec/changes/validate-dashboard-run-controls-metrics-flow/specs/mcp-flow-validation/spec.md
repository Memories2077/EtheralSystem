## ADDED Requirements

### Requirement: Dashboard browser validation covers run controls
The browser validation flow SHALL verify that dashboard-selected run controls affect the next MCP build request and the generated MCP server state visible to the user.

#### Scenario: Browser validation captures dashboard payload
- **WHEN** validation opens the dashboard, sets an experiment id, selects static or dynamic skill selection, toggles RAG, and starts a build through chat
- **THEN** the observed `POST /chat` payload includes the selected `experimentId`, `ragEnabled`, `dynamicSkillSelection`, and `skillSelectionVariant`
- **AND** the visible dashboard variant id matches the request payload

#### Scenario: Browser validation verifies generated server state
- **WHEN** the dashboard-driven browser build creates and activates a generated MCP server
- **THEN** the UI shows the generated server as active with a non-empty tool list
- **AND** the generated server state includes the same run correlation identifiers and effective variant flags returned by the backend or mcp-gen manager

#### Scenario: Browser validation verifies RAG-disabled evidence
- **WHEN** the dashboard-driven browser build runs with RAG disabled
- **THEN** persisted research events for that build include `rag_enabled=false`
- **AND** examiner/RAG metrics indicate retrieval was bypassed or produced zero RAG context for that run

#### Scenario: Browser validation verifies dynamic evidence
- **WHEN** the dashboard-driven browser build runs with dynamic skill selection enabled
- **THEN** persisted research events or mcp-gen run records include `dynamic_skill_selection=true`
- **AND** selected skill metrics are available when mcp-gen performs dynamic selection
