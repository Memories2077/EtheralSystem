## Context

The current research runner builds generated MCP servers through the chatbot backend and validates runtime metadata plus a small set of safe direct MCP probes. The smoke run proved the backend direct MCP path works, but JSONPlaceholder generated eight tools while only four were attempted. The skipped tools made sense for conservative API-safety validation, but they do not answer the benchmark question of whether each generated MCP tool is alive and callable.

The desired metric is MCP liveness: a tool passes when the backend can invoke it and receive a controlled result. A controlled upstream API failure such as 404, unauthorized, invalid credentials, or an empty fake-delete response can still prove the MCP server generated a working tool. Hard failures are reserved for MCP, schema, transport, timeout, runtime, or unclassified exception failures.

## Goals / Non-Goals

**Goals:**

- Attempt every generated tool that appears in runtime metadata for selected benchmark cases.
- Add full JSONPlaceholder coverage for all eight CRUD/list endpoints.
- Allow dummy credential probes for auth-required docs so tools can be tested without real secrets.
- Count accepted API-level failures as liveness passes, while preserving hard failure diagnostics.
- Keep backend direct MCP probes as the success and cleanup gate.
- Keep Inspector CLI diagnostic-only.
- Export coverage and pass/fail metrics that distinguish liveness success from business API success.

**Non-Goals:**

- Do not require real Reddit or TheDogAPI credentials.
- Do not make API business correctness the primary pass condition.
- Do not call the mcp-gen manager create API directly from Bun.
- Do not change the user-facing chatbot UI.
- Do not make Inspector required for benchmark success.

## Decisions

1. **Use invocation liveness as the primary success policy.**
   - Decision: a direct MCP probe passes when the backend tool invocation returns normally, even if the returned payload describes an accepted upstream API failure.
   - Rationale: the benchmark is measuring generated MCP server operability, not whether dummy credentials or fake IDs represent valid upstream resources.
   - Alternative considered: require HTTP/API business success. That would keep mutation/auth probes skipped or failed for reasons unrelated to MCP generation quality.

2. **Make unmatched generated tools fail coverage.**
   - Decision: every runtime metadata tool must either match a probe or be recorded as a hard validation failure. Silent skipped coverage is removed for this liveness mode.
   - Rationale: a generated tool without a probe is untested and should reduce benchmark confidence.
   - Alternative considered: keep skipped tools out of the denominator. That recreates the current undercounting problem.

3. **Store accepted API failure policy in dataset probes.**
   - Decision: each probe may declare accepted failure patterns such as status-like text, `not found`, `unauthorized`, `invalid_grant`, or empty delete results. These patterns classify normal tool results and selected invocation exceptions as liveness passes.
   - Rationale: accepted failures differ by API and endpoint, so they belong beside fixture-specific probe arguments.
   - Alternative considered: hard-code global 4xx handling in the runner. That risks hiding real tool failures for APIs whose generated clients surface errors differently.

4. **Keep cleanup gated by liveness pass rate.**
   - Decision: generated containers are cleaned only when metadata connects and all attempted direct MCP probes pass under liveness policy.
   - Rationale: successful liveness validation proves the generated server no longer needs to be retained for debugging.
   - Alternative considered: cleanup after metadata only. That could delete evidence for broken generated tools.

5. **Separate liveness metrics from business API metrics.**
   - Decision: `toolCallPassRate` remains the cleanup-relevant liveness metric; reports also expose accepted API failure and hard failure counts so readers can see why a tool passed or failed.
   - Rationale: paper metrics need a stable pass rate while still making dummy-credential or not-found results transparent.
   - Alternative considered: overload `successToolCount` with both business success and accepted failure without explanation. That would make reports misleading.

## Risks / Trade-offs

- Broadly accepting API failures can hide malformed endpoint behavior -> keep accepted failure patterns explicit per probe and record `passReason`.
- Generated tool names may vary -> use match terms from dataset but treat unmatched runtime tools as failures so naming drift is visible.
- Dummy credential probes may trigger rate limits or provider-side monitoring -> use clearly fake values and avoid real secrets.
- Some tools may reject input before reaching upstream -> classify schema/input rejection as hard failure unless the probe explicitly documents it as accepted.
- Reports may mix old and new experiments -> include policy/version fields so exports can distinguish safe-subset runs from liveness runs.

## Migration Plan

1. Extend dataset probe definitions with all-tool probe args and accepted failure patterns.
2. Update backend direct probe outcome classification and runner normalization.
3. Update outcome counting and export summaries for liveness, accepted API failures, and hard failures.
4. Add focused tests for coverage, accepted failures, hard failures, and report metrics.
5. Run one smoke build through `bun run research -- --smoke` and verify 8/8 JSONPlaceholder tools are attempted, pass rate is 1, export completes, and the generated container is removed.
