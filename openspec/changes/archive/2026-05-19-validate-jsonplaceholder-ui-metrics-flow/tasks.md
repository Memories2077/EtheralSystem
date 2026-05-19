## 1. OpenSpec Contract

- [x] 1.1 Create proposal, design, and spec delta for JSONPlaceholder browser metrics validation.
- [x] 1.2 Validate the new OpenSpec change status is apply-ready.

## 2. Correlation and Configuration

- [x] 2.1 Propagate chat build correlation context into generated MCP auto-activation metadata calls.
- [x] 2.2 Add unified `RESEARCH_EVENTS_DB` defaults to environment examples and Docker Compose service environments.
- [x] 2.3 Add focused tests for frontend metadata payload correlation.

## 3. Browser E2E Metrics Validation

- [x] 3.1 Add Playwright E2E dependency, config, and script without making it part of normal unit tests.
- [x] 3.2 Add JSONPlaceholder UI flow E2E that submits `INPUT_SAMPLE.txt`, waits for generated server activation, and asserts essential MongoDB research events.
- [x] 3.3 Document the exact E2E command and required environment variables.

## 4. Verification

- [x] 4.1 Run targeted backend and mcp-gen research metric tests.
- [x] 4.2 Run frontend typecheck or targeted test for new UI code.
- [x] 4.3 Run OpenSpec status/validation for the change and mark tasks complete.
