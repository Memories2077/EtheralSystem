## 1. Dataset And Probe Coverage

- [ ] 1.1 Extend benchmark probe definitions to support invocation-liveness policy, accepted API failure patterns, and pass reasons.
- [ ] 1.2 Add JSONPlaceholder probes for all 8 generated CRUD/list tools: list posts, get post, create post, replace post, patch post, delete post, list comments, and get user.
- [ ] 1.3 Remove JSONPlaceholder `unsafe_mutation` skipping from the liveness benchmark path while keeping fake/test request bodies from the formatted input doc.
- [ ] 1.4 Add Reddit dummy-credential probes for generated auth tools with accepted auth failure patterns.
- [ ] 1.5 Add TheDogAPI probes for public and auth-required generated tools with dummy API key arguments and accepted auth/not-found failure patterns.
- [ ] 1.6 Add fixture/dataset tests that fail when selected generated-tool probes are missing required `toolArgs` or accepted failure policy metadata.

## 2. Direct MCP Liveness Validation

- [ ] 2.1 Update backend direct probe outcomes to classify normal tool returns, accepted API failures, and hard MCP failures.
- [ ] 2.2 Ensure accepted upstream API failures are counted as liveness passes only when they match explicit probe policy.
- [ ] 2.3 Treat missing tools, unmatched probes, schema/input rejection, transport errors, timeouts, container/runtime failures, and unclassified exceptions as hard failures.
- [ ] 2.4 Fix direct outcome normalization so successful backend probe responses do not retain fallback error codes.
- [ ] 2.5 Change runner validation so every metadata tool must be attempted or recorded as a hard coverage failure.
- [ ] 2.6 Keep Inspector CLI results diagnostic-only and separate from the backend direct liveness cleanup gate.

## 3. Metrics, Export, And Cleanup Semantics

- [ ] 3.1 Record validation policy, attempted coverage, liveness pass count, accepted API failure count, hard failure count, and pass reasons in raw run records.
- [ ] 3.2 Update `mcp_tool_outcomes_completed` event metrics to include liveness and hard-failure fields while preserving existing count fields.
- [ ] 3.3 Update CSV and Markdown exports to show liveness pass rate, accepted API failure counts, hard failure counts, and legacy policy visibility.
- [ ] 3.4 Gate generated-container cleanup on metadata success plus zero hard liveness failures.
- [ ] 3.5 Preserve failed generated containers when any hard liveness failure occurs and record cleanup skipped diagnostics.

## 4. Verification

- [ ] 4.1 Add focused unit tests for accepted API failure classification, hard failure classification, all-tool coverage, and fallback error-code cleanup.
- [ ] 4.2 Add focused export tests for liveness policy fields and aggregate pass-rate calculations.
- [ ] 4.3 Run the research helper/unit test suite covering fixture parsing, matrix planning, direct liveness validation, cleanup, and export reporting.
- [ ] 4.4 Run `bun run research -- --dry-run`, `bun run research -- --dry-run --all-api-docs`, and `bun run research -- --dry-run --smoke` to preserve matrix counts.
- [ ] 4.5 Run one real `bun run research -- --smoke` demo and verify 8/8 JSONPlaceholder runtime tools are attempted, `toolCallPassRate=1`, export completes, and the generated container is removed.
- [ ] 4.6 Run `openspec validate validate-all-mcp-tools-liveness --strict` and ensure the change is apply-ready.

## 5. Commit Boundaries

- [ ] 5.1 Commit dataset/probe coverage changes after tests for that subunit pass.
- [ ] 5.2 Commit direct MCP liveness validation changes after focused backend/runner tests pass.
- [ ] 5.3 Commit metrics/export/cleanup changes after report and cleanup tests pass.
- [ ] 5.4 Commit final smoke verification evidence or leave generated report artifacts uncommitted if they are not intended as source artifacts.
