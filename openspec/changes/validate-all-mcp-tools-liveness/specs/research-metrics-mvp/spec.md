## ADDED Requirements

### Requirement: Research metrics capture MCP liveness outcomes
The system SHALL export direct MCP validation metrics that distinguish liveness passes, accepted API failures, hard MCP failures, and unattempted coverage gaps.

#### Scenario: Raw run records include liveness fields
- **WHEN** a benchmark run completes direct MCP liveness validation
- **THEN** the raw run record includes validation policy, runtime tool count, attempted tool count, liveness pass count, accepted API failure count, hard failure count, and pass rate
- **AND** the pass rate denominator includes every generated metadata tool that should be covered by the selected input-doc case

#### Scenario: Accepted API failures are visible but pass
- **WHEN** a generated tool returns an accepted upstream API failure through the MCP tool path
- **THEN** the raw outcome records a pass reason for accepted API failure
- **AND** aggregate reports count it separately from normal tool success without reducing the liveness pass rate

#### Scenario: Hard failures are visible in aggregate reports
- **WHEN** one or more generated tools fail liveness validation because of hard MCP, schema, runtime, or coverage errors
- **THEN** CSV and Markdown exports include hard failure counts and safe failure names or categories
- **AND** the aggregate liveness pass rate reflects those hard failures

#### Scenario: Legacy safe-subset metrics remain distinguishable
- **WHEN** reports include runs produced before the liveness policy was introduced
- **THEN** exports distinguish missing or legacy validation policy from invocation-liveness runs
- **AND** summaries do not merge legacy safe-subset pass rates with all-tool liveness pass rates without a visible policy field
