## ADDED Requirements

### Requirement: Backend direct MCP liveness probes validate generated tools
The system SHALL validate generated MCP tool liveness by invoking mapped generated tools through the backend MCP client connection without relying on an LLM to choose or call the tools.

#### Scenario: Direct probe endpoint invokes mapped tools
- **WHEN** a generated MCP URL is connected and runtime metadata returns generated tools
- **THEN** the runner sends mapped probe requests to the backend direct MCP probe endpoint
- **AND** the backend invokes the matching LangChain MCP tool object with fixture-provided arguments
- **AND** the backend returns one normalized outcome for each requested probe

#### Scenario: Accepted API failures pass liveness validation
- **WHEN** a direct probe reaches the generated MCP tool and receives a controlled result that matches the probe's accepted API failure policy
- **THEN** the backend or runner records the outcome as a liveness pass
- **AND** the diagnostic preserves a compact safe reason for the accepted API failure
- **AND** the outcome does not use a hard failure error code

#### Scenario: Direct probe hard failures remain failures
- **WHEN** the backend cannot find the tool, cannot invoke the MCP tool object, receives a schema/input rejection, times out, loses the MCP connection, or catches an unclassified invocation exception
- **THEN** the direct probe outcome is a hard failure
- **AND** the generated container is retained for inspection unless the overall run has no hard failures

#### Scenario: Liveness validation gates cleanup
- **WHEN** backend metadata connects and all direct MCP liveness probes pass
- **THEN** the generated MCP server is eligible for cleanup
- **AND** failed hard MCP probes prevent cleanup and keep the generated container available for debugging

### Requirement: Direct probe outcomes remain safe to persist
The system SHALL record liveness probe evidence without persisting secrets, raw private prompts, or full raw API responses.

#### Scenario: Outcome diagnostics are redacted
- **WHEN** a direct probe records a normal result, accepted API failure, or hard failure
- **THEN** persisted diagnostics redact authorization values, tokens, API keys, cookies, passwords, and JWT-like strings
- **AND** persisted diagnostics are compact and do not include full raw API response bodies
