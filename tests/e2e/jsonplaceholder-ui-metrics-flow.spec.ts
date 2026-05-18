import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { MongoClient } from "mongodb";

type ResearchEvent = {
  trace_id?: string;
  experiment_id?: string;
  session_id?: string;
  build_request_id?: string;
  server_id?: string;
  service?: string;
  stage?: string;
  event_name?: string;
  status?: string;
  duration_ms?: number;
  metrics?: Record<string, unknown>;
};

const rootDir = process.cwd();
const inputFixturePath = path.join(rootDir, "INPUT_SAMPLE.txt");
const inputFixture = fs.readFileSync(inputFixturePath, "utf8");
const backendUrl = process.env.E2E_BACKEND_URL || "http://localhost:8000";
const mcpManagerUrl = process.env.E2E_MCP_MANAGER_URL || "http://localhost:8080";
const researchDbName = process.env.RESEARCH_EVENTS_DB || process.env.MONGO_DB_NAME || "docker";
const researchCollectionName = process.env.RESEARCH_EVENTS_COLLECTION || "research_events";
const expectedExperimentId =
  process.env.NEXT_PUBLIC_RESEARCH_EXPERIMENT_ID || process.env.RESEARCH_EXPERIMENT_ID || "";
const metricsContainers = (process.env.E2E_METRICS_CONTAINERS || "docker-manager,chatbot-backend,agent-service")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const requiredEventNames = [
  "chat_stream_completed",
  "langgraph_stream_completed",
  "supervisor_routed",
  "examiner_completed",
  "generator_completed",
  "mcp_create_input_normalized",
  "openapi_generation_completed",
  "docker_build_completed",
  "container_start_completed",
  "mcp_create_completed",
  "mcp_metadata_checked",
];

function expectMetricKeys(event: ResearchEvent | undefined, keys: string[]) {
  expect(event, `Missing event for metric assertion: ${keys.join(", ")}`).toBeTruthy();
  for (const key of keys) {
    expect(event?.metrics || {}, `Missing metric '${key}' on ${event?.event_name}`).toHaveProperty(key);
  }
}

function findEvent(events: ResearchEvent[], eventName: string): ResearchEvent | undefined {
  return events.find((event) => event.event_name === eventName);
}

function buildMongoUriCandidates(): string[] {
  const candidates = [
    process.env.E2E_MONGO_URI,
    process.env.MONGO_URI,
    process.env.MONGO_HOST_PORT ? `mongodb://localhost:${process.env.MONGO_HOST_PORT}` : undefined,
    "mongodb://localhost:27018",
    "mongodb://localhost:27017",
  ];
  return [...new Set(candidates.filter((value): value is string => Boolean(value)))];
}

async function connectResearchMongo(): Promise<{ client: MongoClient; uri: string }> {
  const errors: string[] = [];
  for (const uri of buildMongoUriCandidates()) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5_000 });
    try {
      await client.connect();
      return { client, uri };
    } catch (error) {
      await client.close().catch(() => undefined);
      errors.push(`${uri}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`Unable to connect to MongoDB for research events. Tried: ${errors.join(" | ")}`);
}

async function expectReachableJson(url: string, label: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  expect(response.ok, `${label} is not reachable at ${url}: ${response.status}`).toBeTruthy();
  return response.json() as Promise<Record<string, unknown>>;
}

function readContainerEnv(container: string): Record<string, string> | null {
  try {
    const output = execFileSync("docker", ["exec", container, "env"], {
      encoding: "utf8",
      timeout: 5_000,
    });
    return Object.fromEntries(
      output
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1)];
        }),
    );
  } catch {
    return null;
  }
}

function expectMetricsEnabledInRunningStack() {
  if (process.env.E2E_REQUIRE_CONTAINER_METRICS_ENV === "false") return;

  const disabled = metricsContainers.flatMap((container) => {
    const env = readContainerEnv(container);
    if (!env) return [`${container}: unable to inspect container env`];
    return env.RESEARCH_METRICS_ENABLED === "true" ? [] : [`${container}: RESEARCH_METRICS_ENABLED=${env.RESEARCH_METRICS_ENABLED || "(unset)"}`];
  });

  expect(
    disabled,
    [
      "Research metrics must be enabled in the running stack before this E2E can prove metric logging.",
      "Start the stack with RESEARCH_METRICS_ENABLED=true and a shared RESEARCH_EXPERIMENT_ID.",
    ].join(" "),
  ).toEqual([]);
}

function metricValue(event: ResearchEvent | undefined, key: string): unknown {
  return event?.metrics?.[key];
}

test("JSONPlaceholder UI build activates generated MCP server and logs essential metrics", async ({ page }) => {
  const chatRequests: Array<Record<string, unknown>> = [];
  const metadataResponses: Array<Record<string, unknown>> = [];

  expect(inputFixture.trim(), `${inputFixturePath} must not be empty`).not.toHaveLength(0);
  expect(inputFixture.toLowerCase(), `${inputFixturePath} must describe JSONPlaceholder`).toContain("jsonplaceholder");
  expectMetricsEnabledInRunningStack();

  const backendHealth = await expectReachableJson(`${backendUrl}/health`, "chatbot backend");
  expect(backendHealth.status).toBe("healthy");

  const managerStats = await expectReachableJson(`${mcpManagerUrl}/api/mcp/stats`, "mcp-gen manager");
  expect(managerStats).toHaveProperty("totalServers");

  page.on("request", (request) => {
    if (request.method() !== "POST" || !request.url().endsWith("/chat")) return;
    const body = request.postDataJSON();
    if (body && typeof body === "object") {
      chatRequests.push(body as Record<string, unknown>);
    }
  });
  page.on("response", async (response) => {
    if (!response.url().endsWith("/mcp/metadata")) return;
    try {
      metadataResponses.push((await response.json()) as Record<string, unknown>);
    } catch {
      metadataResponses.push({ status: "unreadable-response" });
    }
  });

  await page.goto("/chat");
  await page.locator("textarea").fill(inputFixture);
  await page.getByRole("button").filter({ hasText: "arrow_upward" }).click();

  await expect
    .poll(
      async () => {
        const text = (await page.locator("body").textContent()) || "";
        return text.includes("MCP Server Built Successfully") && /Server ID:?\s*[a-f0-9-]+/i.test(text);
      },
      { timeout: 600_000, intervals: [2_000, 5_000, 10_000] },
    )
    .toBe(true);

  const bodyText = (await page.locator("body").textContent()) || "";
  const serverId =
    [...bodyText.matchAll(/https?:\/\/localhost:8081\/mcp\/([a-f0-9-]+)\?token=/gi)].at(-1)?.[1] ||
    [...bodyText.matchAll(/Server ID:?\s*([a-f0-9-]+)/gi)].at(-1)?.[1] ||
    "";
  expect(serverId).toBeTruthy();

  const chatRequest = chatRequests.at(-1);
  expect(chatRequest).toBeTruthy();
  const buildRequestId = String(chatRequest?.buildRequestId || "");
  const traceId = String(chatRequest?.traceId || "");
  const sessionId = String(chatRequest?.sessionId || "");
  const experimentId = String(chatRequest?.experimentId || "");
  expect(buildRequestId).toBeTruthy();
  expect(traceId).toBe(buildRequestId);
  expect(sessionId).toBeTruthy();
  expect(experimentId).toBeTruthy();
  if (expectedExperimentId) {
    expect(experimentId).toBe(expectedExperimentId);
  }

  let managerStatus: Record<string, unknown> = {};
  await expect
    .poll(
      async () => {
        const managerStatusResponse = await fetch(`${mcpManagerUrl}/api/mcp/${serverId}/status`, {
          signal: AbortSignal.timeout(10_000),
        });
        if (!managerStatusResponse.ok) {
          managerStatus = { serverId, status: `http_${managerStatusResponse.status}` };
          return managerStatus;
        }
        managerStatus = (await managerStatusResponse.json()) as Record<string, unknown>;
        return managerStatus;
      },
      { timeout: 120_000, intervals: [1_000, 2_000, 5_000] },
    )
    .toMatchObject({
      serverId,
      status: "running",
    });
  const managerPublicUrl = String(managerStatus.publicUrl || "");
  expect(managerPublicUrl).toBe(`http://localhost:8081/mcp/${serverId}`);

  type ActiveServer = { serverId?: string; url?: string; tools?: unknown[] };
  let activeServer: ActiveServer | null = null;
  await expect
    .poll(
      async () => {
        activeServer = await page.evaluate((expectedServerId) => {
          const raw = window.localStorage.getItem("gemini-insight-link-storage");
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          const servers = parsed?.state?.settings?.mcpServers || [];
          return servers.find((server: { serverId?: string }) => server.serverId === expectedServerId) || null;
        }, serverId);
        return {
          serverId: activeServer?.serverId,
          hasManagerUrlWithToken: String(activeServer?.url || "").startsWith(`${managerPublicUrl}?token=`),
          toolCount: activeServer?.tools?.length || 0,
        };
      },
      { timeout: 120_000, intervals: [1_000, 2_000, 5_000] },
    )
    .toMatchObject({
      serverId,
      hasManagerUrlWithToken: true,
    });

  const mcpUrl = String(activeServer?.url || "");
  expect(mcpUrl).toBeTruthy();
  expect(activeServer?.tools?.length || 0).toBeGreaterThan(0);

  await expect
    .poll(
      async () => metadataResponses.find((metadata) => metadata.url === mcpUrl) || metadataResponses.at(-1) || null,
      { timeout: 30_000, intervals: [500, 1_000, 2_000] },
    )
    .toMatchObject({
      url: mcpUrl,
      status: "connected",
    });
  const metadata = metadataResponses.find((item) => item.url === mcpUrl) || metadataResponses.at(-1);
  expect((metadata?.tools as unknown[] | undefined)?.length || 0).toBeGreaterThan(0);

  const { client: mongo, uri: connectedMongoUri } = await connectResearchMongo();
  const collection = mongo.db(researchDbName).collection<ResearchEvent>(researchCollectionName);

  try {
    await expect
      .poll(
        async () => {
          const events = await collection.find({ build_request_id: buildRequestId }).toArray();
          const names = new Set(events.map((event) => event.event_name));
          return requiredEventNames.filter((name) => !names.has(name));
        },
        { timeout: 180_000, intervals: [2_000, 5_000, 10_000] },
      )
      .toEqual([]);

    const events = await collection.find({ build_request_id: buildRequestId }).toArray();
    for (const eventName of requiredEventNames) {
      const event = findEvent(events, eventName);
      expect(event, `Required event '${eventName}' should exist before correlation assertions`).toBeTruthy();
      expect(event?.trace_id).toBe(traceId);
      expect(event?.experiment_id).toBe(experimentId);
      expect(event?.build_request_id).toBe(buildRequestId);
    }

    expectMetricKeys(findEvent(events, "chat_stream_completed"), [
      "chat_total_latency_ms",
      "stream_chunk_count",
      "message_count",
    ]);
    expectMetricKeys(findEvent(events, "langgraph_stream_completed"), [
      "langgraph_stream_duration_ms",
      "server_created",
    ]);
    expectMetricKeys(findEvent(events, "examiner_completed"), [
      "api_doc_length",
      "rag_context_item_count",
      "rag_context_chars",
    ]);
    expectMetricKeys(findEvent(events, "generator_completed"), [
      "tool_call_count",
      "server_created",
    ]);
    expectMetricKeys(findEvent(events, "mcp_create_input_normalized"), [
      "input_type",
      "input_length",
      "input_hash",
    ]);
    expectMetricKeys(findEvent(events, "openapi_generation_completed"), [
      "validation_passed",
      "llm_calls",
      "retry_count",
    ]);
    expectMetricKeys(findEvent(events, "docker_build_completed"), [
      "docker_build_success",
      "build_log_count",
    ]);
    expectMetricKeys(findEvent(events, "container_start_completed"), [
      "container_start_success",
      "host_port",
      "container_port",
    ]);
    expectMetricKeys(findEvent(events, "mcp_create_completed"), [
      "build_total_latency_ms",
      "docker_status",
    ]);
    expectMetricKeys(findEvent(events, "mcp_metadata_checked"), [
      "mcp_initialize_success",
      "mcp_tool_count",
    ]);

    const summary = {
      buildRequestId,
      traceId,
      sessionId,
      experimentId,
      serverId,
      mcpUrl,
      mongoUri: connectedMongoUri,
      toolCount: (activeServer?.tools || []).length,
      eventCount: events.length,
      latency: {
        chatTotalMs: metricValue(findEvent(events, "chat_stream_completed"), "chat_total_latency_ms"),
        langgraphMs: metricValue(findEvent(events, "langgraph_stream_completed"), "langgraph_stream_duration_ms"),
        buildTotalMs: metricValue(findEvent(events, "mcp_create_completed"), "build_total_latency_ms"),
      },
      stages: requiredEventNames.map((eventName) => {
        const event = findEvent(events, eventName);
        return {
          eventName,
          status: event?.status,
          durationMs: event?.duration_ms,
        };
      }),
    };
    console.info("[jsonplaceholder-ui-metrics-summary]", JSON.stringify(summary));
  } finally {
    await mongo.close();
  }
});
