## ADDED Requirements

### Requirement: Generated MCP containers are tracked and removed
The system SHALL track the generated MCP server container for each run and remove it after validation finishes.

#### Scenario: Container identity is captured for a generated server
- **WHEN** a benchmark run receives generated server status from mcp-gen manager
- **THEN** the run record includes the generated `serverId`, MCP URL, and Docker `containerId` when a container was created
- **AND** the runner records a diagnostic if manager status cannot provide an unambiguous generated container identity

#### Scenario: Successful validation cleans up the generated container
- **WHEN** a generated MCP server finishes successful metadata and tool validation
- **THEN** the runner removes the Docker container identified by that run's generated `containerId`
- **AND** the run record includes cleanup status, cleanup latency, and any cleanup error message
- **AND** Compose baseline services such as MongoDB, RabbitMQ, Chroma, Ollama, manager, proxy, agent, and chatbot backend remain running

#### Scenario: Failed validation retains the generated container
- **WHEN** a run fails after creating a generated MCP server container
- **THEN** the runner keeps that exact generated container available for inspection
- **AND** the run record marks cleanup as skipped with a diagnostic that validation failed
- **AND** the original build or validation failure remains the primary diagnostic

#### Scenario: Repeated demo does not accumulate generated containers
- **WHEN** the 12-build demo matrix finishes
- **THEN** no generated MCP server containers from those 12 runs remain running
- **AND** the final summary reports the number of containers created, removed, skipped, and failed to remove

### Requirement: Backend direct MCP probes validate generated MCP servers
The system SHALL validate generated MCP server tool behavior by calling safe mapped tools through the backend MCP client connection without relying on an LLM to invoke the tools.

#### Scenario: Backend direct probes call safe tools
- **WHEN** a generated MCP URL is connected and selected benchmark probes map to generated tools with safe arguments
- **THEN** the runner sends those probes to the backend direct MCP validation endpoint
- **AND** the backend invokes the matching MCP tools with fixture-provided `toolArgs`
- **AND** the run records pass, fail, and skipped outcomes plus a direct tool-call pass rate from non-skipped safe probe calls

#### Scenario: Backend direct probes are the cleanup gate
- **WHEN** backend metadata connects and all attempted direct MCP tool probes pass
- **THEN** the run is eligible for generated-container cleanup
- **AND** failed direct MCP tool probes retain the generated container for inspection

### Requirement: Inspector CLI diagnostics are captured for generated MCP servers
The system SHALL record generated MCP server protocol diagnostics with `@modelcontextprotocol/inspector` CLI mode when available.

#### Scenario: Inspector lists generated tools
- **WHEN** a generated MCP URL is available for a run
- **THEN** the runner invokes Inspector CLI in non-UI mode to call `tools/list`
- **AND** the run records whether Inspector connected, how many tools were listed, and any protocol error

#### Scenario: Inspector calls safe probe tools
- **WHEN** a selected benchmark probe maps to a generated tool and has safe arguments
- **THEN** the runner invokes Inspector CLI `tools/call` for that tool
- **AND** the run records pass, fail, and skipped outcomes from Inspector CLI results
- **AND** Inspector-based pass rate is computed from non-skipped safe probe calls as diagnostic data

#### Scenario: Inspector validation is machine-readable
- **WHEN** Inspector CLI validation completes
- **THEN** the runner stores parseable JSON or normalized JSON-derived results in the raw run record
- **AND** the benchmark does not require opening the Inspector UI for diagnostic collection
