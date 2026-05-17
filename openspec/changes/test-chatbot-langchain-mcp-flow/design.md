## Context

The target flow crosses four services: the Next.js chatbot UI, the FastAPI backend in `apps/chatbot_mcp_client/backend`, the LangGraph/LangChain agent in `apps/langChain-application`, and the Bun/TypeScript mcp-gen service in `apps/mcp-gen`. Current code already has MCP metadata connection UI and `McpServerFeedbackList`, so this change is primarily a validation and defect-repair pass rather than a new feature build.

The repo does not contain a langChain bash startup script. The root Compose file already defines the relevant services and `etheral-network`, while generated MCP containers use mcp-gen's own Docker path. MetaClaw remains an external sibling project and must be started separately with `metaclaw start`.

## Goals / Non-Goals

**Goals:**
- Prove the chatbot can submit the repo input example, receive a generated MCP server, activate it, and use at least one tool.
- Prove human feedback from the chatbot UI reaches mcp-gen and affects skill feedback effectiveness.
- Repair only confirmed breaks while preserving existing route shapes.
- Keep Docker cleanup limited to this project and generated MCP artifacts from the test run.

**Non-Goals:**
- Do not add new public API routes unless an existing route cannot satisfy the required behavior.
- Do not replace the existing feedback UI before testing it.
- Do not introduce `npx`; use Bun/package scripts for mcp-gen checks.
- Do not perform global Docker prune or cleanup unrelated projects.

## Decisions

- Use root `docker compose` as the stack startup command. Alternative considered: create a new langChain wrapper script. Root Compose is the better default because it already owns frontend, backend, agent, mcp-gen, infrastructure, and network wiring.
- Use root `INPUT_SAMPLE.txt`. The file describes JSONPlaceholder and is preferred because it is the repo-level sample requested for this flow.
- Treat existing UI feedback as the primary path. Alternative considered: add a new feedback composer before testing. The current `McpServerFeedbackList` already has like/dislike and comments, so adding UI first would risk duplicating behavior.
- Verify feedback effectiveness at mcp-gen's learning layer. The decisive signal is not just a successful POST; it must show stored feedback and imported human feedback affecting `humanFeedbackScore`/Bayesian success rate.
- Patch defects at the smallest broken boundary. Likely boundaries are UI API client/state, FastAPI mcp proxy routes, LangGraph create tool payload/context, or mcp-gen feedback import linkage.

## Risks / Trade-offs

- MetaClaw may not be installed or configured locally -> Record the failure clearly, then validate fallback/provider requirements only if the requested MetaClaw path cannot run.
- LLM-backed generation may be slow or nondeterministic -> Use the provided example input, preserve logs, and retry only enough to distinguish transient model failure from integration breakage.
- Generated MCP containers can leave stale resources -> Track server IDs/container names from the run and remove only matching project/generated resources.
- Feedback import is asynchronous -> Verify both API response and eventual mcp-gen logs/database state before concluding the loop is broken.
- Existing UI may connect by URL while feedback lists by generated server ID -> If mismatch appears, patch mapping without changing public route contracts.

## Migration Plan

No schema migration is planned. Implementation should rebuild the stack after any code fix, retest the flow, and roll back by stopping the Compose stack and removing only resources created for the test run.

## Open Questions

None. The execution defaults are root Compose startup, scoped Docker cleanup, and root `INPUT_SAMPLE.txt` as the test input source.
