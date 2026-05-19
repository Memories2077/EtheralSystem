import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkillRegistry } from "../skill-intelligence/registry.js";
import { SkillSelectionAgent } from "../skill-intelligence/agent.js";

describe("dynamic prompt assembly", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.DYNAMIC_SKILL_SELECTION = "true";
    process.env.SKILL_SELECTION_VARIANT = "dynamic";
    delete process.env.SKILL_FEEDBACK_ENABLED;
    SkillSelectionAgent.resetInstance();
    SkillRegistry.resetInstance();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    SkillSelectionAgent.resetInstance();
    SkillRegistry.resetInstance();
  });

  it("assembles MCP prompt with target-scoped skills and correct injection ids", async () => {
    const { buildPromptWithExamples } = await import("./prompt.js");
    const spec = `openapi: 3.0.3
info:
  title: Simple API
  version: 1.0.0
paths:
  /health:
    get:
      responses:
        '200':
          description: OK
`;

    const result = await buildPromptWithExamples(spec, "REF", "IN", "OUT");
    const selected = result.composition?.skills.map((skill) => skill.skillId) ?? [];

    expect(selected).toContain("mcp_zod_mapping");
    expect(selected).not.toContain("auth_input_format");
    expect(selected.some((id) => id.startsWith("openapi_"))).toBe(false);
    expect(result.messages[0].content).toContain("OpenAPI Schema to Zod");
    expect(result.messages[1].content).toContain("NO SECURITY SCHEMES IN SPEC");
    expect(result.messages[1].content).not.toContain("Reddit API Usage Guide");
  });

  it("assembles OpenAPI prompt from endpoint text without empty user template", async () => {
    const { buildOpenAPIPromptWithExamples } = await import("./prompt.js");
    const endpoints = "GET /v1/items returns public JSON items with limit and offset query params.";

    const result = await buildOpenAPIPromptWithExamples(endpoints, "IN", "OUT");
    const selected = result.composition?.skills.map((skill) => skill.skillId) ?? [];

    expect(result.specProfile?.source).toBe("endpoint_text");
    expect(selected).toContain("openapi_system");
    expect(selected).toContain("openapi_user_message");
    expect(selected.some((id) => id.startsWith("mcp_"))).toBe(false);
    expect(result.messages[1].content).toContain("NOW GENERATE FOR THESE API ENDPOINTS");
    expect(result.messages[1].content).toContain("NO authentication");
  });

  it("keeps static dashboard variants on the static prompt path", async () => {
    vi.resetModules();
    process.env.DYNAMIC_SKILL_SELECTION = "false";
    process.env.SKILL_SELECTION_VARIANT = "static";
    SkillSelectionAgent.resetInstance();
    SkillRegistry.resetInstance();

    const { buildPromptWithExamples } = await import("./prompt.js");
    const result = await buildPromptWithExamples(
      "openapi: 3.0.3\ninfo:\n  title: Static API\n  version: 1.0.0\npaths: {}\n",
      "REF",
      "IN",
      "OUT",
    );

    expect(result.composition).toBeUndefined();
    expect(result.messages[0].content).toContain("OpenAPI Schema to Zod");
  });
});
