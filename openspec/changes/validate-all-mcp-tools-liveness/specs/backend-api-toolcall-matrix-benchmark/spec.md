## MODIFIED Requirements

### Requirement: Benchmark validates generated tools through backend APIs
The system SHALL validate generated MCP servers without Playwright by using backend metadata and direct MCP probe APIs, and SHALL measure generated tool liveness rather than upstream API business success.

#### Scenario: Benchmark builds and activates a generated server
- **WHEN** a case run starts
- **THEN** the runner submits the case input to backend `POST /chat`
- **AND** it captures the generated server identity, MCP URL, trace identifiers, and build status
- **AND** it calls backend `POST /mcp/metadata` for the generated MCP URL
- **AND** metadata returns a connected status and the generated tool list before tool probes begin

#### Scenario: Benchmark probes every generated metadata tool
- **WHEN** metadata returns generated tools for a case run
- **THEN** the runner attempts a direct backend MCP probe for every metadata tool that matches a benchmark probe definition
- **AND** every metadata tool is represented in the outcome list
- **AND** an unmatched metadata tool is recorded as a hard validation failure rather than a skipped outcome
- **AND** the run records liveness pass, hard failure, accepted API failure, and attempted counts for all metadata tools

#### Scenario: API-level failures can prove liveness
- **WHEN** a direct MCP probe invokes a generated tool and the tool returns a controlled upstream API failure matching the probe's accepted failure policy
- **THEN** the benchmark counts the tool as a liveness pass
- **AND** the outcome records an accepted API failure reason without counting it as a hard MCP failure

#### Scenario: Hard MCP failures fail validation
- **WHEN** a metadata tool is missing, unmatched, rejects required input, times out, fails transport, crashes the generated server, or raises an unclassified invocation exception
- **THEN** the benchmark counts that tool as a hard failure
- **AND** hard failures are included in the direct tool-call pass-rate denominator

## ADDED Requirements

### Requirement: Benchmark probes define all-tool liveness coverage
The system SHALL define probe arguments and accepted failure policies for generated tools so the benchmark can attempt all generated tools for selected input API docs.

#### Scenario: JSONPlaceholder probes cover all documented CRUD endpoints
- **WHEN** the benchmark loads the JSONPlaceholder input-doc case
- **THEN** the case definitions include liveness probes for list posts, get post by id, create post, replace post, patch post, delete post, list comments for a post, and get user by id
- **AND** update and delete probes use fake JSONPlaceholder request examples and are not skipped as `unsafe_mutation`

#### Scenario: Auth-required probes use dummy credentials
- **WHEN** the benchmark loads Reddit or auth-required TheDogAPI tools without real credentials
- **THEN** the case definitions provide dummy credential or token arguments sufficient to invoke generated tool schemas
- **AND** expected upstream auth failures such as unauthorized, forbidden, invalid credentials, or invalid grant are classified as accepted API failures when returned as controlled tool results

#### Scenario: Liveness policy is explicit in raw records
- **WHEN** a run records tool outcomes
- **THEN** the raw run record identifies that the validation policy is invocation liveness
- **AND** each attempted outcome distinguishes normal tool success, accepted API failure, and hard MCP failure
