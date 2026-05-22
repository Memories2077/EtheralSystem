## MODIFIED Requirements

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
- **AND** Compose baseline services such as MongoDB, RabbitMQ, Chroma, manager, proxy, agent, and chatbot backend remain running

#### Scenario: Failed validation retains the generated container
- **WHEN** a run fails after creating a generated MCP server container
- **THEN** the runner keeps that exact generated container available for inspection
- **AND** the run record marks cleanup as skipped with a diagnostic that validation failed
- **AND** the original build or validation failure remains the primary diagnostic

#### Scenario: Repeated demo does not accumulate generated containers
- **WHEN** the 12-build demo matrix finishes
- **THEN** no generated MCP server containers from those 12 runs remain running
- **AND** the final summary reports the number of containers created, removed, skipped, and failed to remove
