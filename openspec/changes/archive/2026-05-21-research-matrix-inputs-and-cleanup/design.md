## Context

The repository already has `scripts/research/run-backend-toolcall-matrix.ts`, `scripts/research/export-research-report.ts`, checked-in research datasets, Docker-managed generated MCP servers, and RAG toggles propagated through Compose environment variables. The current flow is close to a paper benchmark, but the requested run shape needs stricter fixture contracts, a single research command, direct MCP tool validation, Inspector diagnostics, and reliable cleanup of generated MCP server containers.

`@modelcontextprotocol/inspector` supports a scriptable CLI mode with `--cli`, `--method tools/list`, and `--method tools/call`, so the benchmark can record Inspector diagnostics without opening the UI. The success gate uses the backend's existing MCP client connection to call safe tools directly with fixture-provided arguments, avoiding an extra LLM call for tool validation.

## Goals / Non-Goals

**Goals:**

- Make the input docs deterministic: three checked-in API-doc fixtures, one shared format, declared endpoint counts, and request/response examples per endpoint.
- Make `bun run research` run the demo matrix in one command: `1 api doc * 4 variants * 3 repeats = 12` build attempts.
- Preserve a full matrix mode for all three API docs without changing the fixture format.
- Validate generated MCP servers through backend direct MCP tool probes and record success-rate data.
- Record Inspector CLI diagnostics when the CLI can connect, without making the Inspector UI part of the workflow.
- Capture generated container IDs and clean up generated MCP server containers after successful validation, while retaining failed validation containers for inspection.
- Ensure `rag-off` disables LangChain retrieval in the running application environment, not only in the Bun runner's metadata.
- Export research reports immediately after each API-doc batch completes.

**Non-Goals:**

- Do not add a new UI for this workflow.
- Do not make the benchmark depend on Playwright.
- Do not consolidate all research code into one large TypeScript file.
- Do not redesign unrelated research metrics or dashboard flows.

## Decisions

1. **Use a strict text fixture format plus dataset metadata.**
   - Decision: keep human-readable API-doc input files, but rewrite each file to the same structured format with a metadata header, endpoint count, and repeated endpoint sections containing method/path, request example, response example, and safe probe notes.
   - Rationale: the generator still receives realistic docs, while Bun can parse and validate the declared endpoint count before expensive builds start.
   - Alternative considered: store only JSON fixtures and generate prompt text at runtime. That is easier for Bun but weaker for testing the real input-document path.

2. **Make `bun run research` a thin orchestrator over focused modules.**
   - Decision: add a package script named `research` that calls a small orchestrator. Split implementation into modules such as fixture validation, matrix planning, Inspector validation, container cleanup, and batch export.
   - Rationale: the matrix runner already has useful logic; focused modules keep the change testable and avoid another large script.
   - Alternative considered: extend `run-backend-toolcall-matrix.ts` only. That would be faster initially but harder to maintain as full three-doc runs and cleanup rules expand.

3. **Define demo and full modes explicitly.**
   - Decision: default `bun run research` runs the demo matrix with one API doc, four variants, and three repeats. A full mode runs all three API docs with the same four variants and repeat count.
   - Rationale: the requested 12-run demo proves variant coverage and repeat stability without forcing the full 36-build run every time.
   - Alternative considered: keep the existing default of three docs and one repeat. That does not exercise repeat stability.

4. **Use backend direct MCP probes as the tool-call success gate and Inspector as diagnostics.**
   - Decision: after backend metadata connects to the generated MCP URL, call safe mapped tools directly through the backend MCP connection using fixture-provided `toolArgs`. Also invoke `@modelcontextprotocol/inspector --cli` when available and store its list/call diagnostics.
   - Rationale: direct backend probes test real MCP tool calls without asking an LLM to choose tools, while preserving Inspector data for protocol troubleshooting.
   - Alternative considered: keep only backend chat probes. Those are useful end-to-end diagnostics, but they mix LLM behavior with MCP protocol validation.

5. **Clean up generated containers from tracked identity after successful validation.**
   - Decision: capture `serverId`, `mcpUrl`, and generated `containerId` from manager status or research events. Cleanup uses the manager/Docker path for that exact container only after the run validates successfully; failed runs retain the generated container for inspection and record a skipped cleanup diagnostic.
   - Rationale: cleanup by exact identity prevents removing unrelated Compose services and prevents memory growth across successful repeated runs without destroying evidence from failed MCP server tests.
   - Alternative considered: periodically prune all generated containers by image/name. That is simpler but too risky in a shared dev environment.

6. **Verify RAG-off at runtime.**
   - Decision: when a variant has `ragEnabled=false`, the orchestrator restarts the relevant services with `RAG_ENABLED=false` and verifies LangChain-side env or metrics show no retrieval context.
   - Rationale: the research comparison is invalid if only the Bun runner label changes while `apps/langChain-application` still performs retrieval.
   - Alternative considered: trust the existing variant metadata. That does not catch a misconfigured Compose or LangChain process.

## Risks / Trade-offs

- Inspector CLI version changes -> keep Inspector output diagnostic-only unless the local CLI path is validated, and include a clear diagnostic when command output is not parseable.
- Cleanup could target the wrong container -> require exact generated `containerId` or an unambiguous generated-server label/name before removal.
- Full matrix runtime will be long -> keep the default demo to 12 builds and require an explicit full-mode flag for all three API docs.
- Public API write operations may be fake, unsafe, or auth-bound -> fixtures must mark safe probes separately from documented endpoints, and skipped outcomes must be reported.
- RAG-off verification can fail because an old container is still running -> restart variant services before each variant phase and inspect the active container environment before running builds.

## Migration Plan

1. Add the new fixture format and rewrite the three input docs.
2. Add fixture validation and matrix planning before any build starts.
3. Add backend direct MCP validation, record the new result fields, and keep Inspector CLI/backend chat probes available as diagnostics.
4. Add container ID capture and success-only cleanup after validation.
5. Add per-API-doc export and the `bun run research` script.
6. Run the 12-build demo, then run a narrower smoke if a full 36-build run is too expensive for the current environment.

## Open Questions

- Which API doc should be the default demo case: JSONPlaceholder, Reddit, or TheDogAPI? The implementation can default to JSONPlaceholder because it already has safe fake CRUD behavior.
- Should the full three-doc run be `bun run research -- --all-api-docs` or a separate `research:full` script? The implementation should choose the least surprising package-script pattern.
