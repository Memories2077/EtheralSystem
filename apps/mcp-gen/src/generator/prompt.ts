// src/generator/prompt.ts - Modularized version using SkillRouter + SkillSelectionAgent
import {
  calculateMessageTokens,
  truncateMessages,
  formatTokenCount,
  getContextWarningLevel,
} from "../utils/token-counter.ts";
import { SkillRouter } from "../skills/skill-router.ts";
import { createHash } from "node:crypto";
import { SkillSelectionAgent } from "../skill-intelligence/agent.js";
import type {
  SpecProfile,
  SkillComposition,
  SkillSelectionVariant,
} from "../skill-intelligence/types.js";
import { EXPERIMENT_CONFIG } from "../utils/config.ts";

export interface ChatMessage {
  role: "user" | "model" | "assistant" | "system";
  content: string;
}

/**
 * Detect if input text mentions authentication/security concepts.
 * Used to conditionally inject auth examples into prompts,
 * preventing knowledge contamination for APIs without auth.
 */
export function detectAuthInInput(input: string): boolean {
  const text = input.toLowerCase();

  // Check for negation context first — if auth is explicitly stated as NOT required, skip detection
  const negationPatterns = [
    // Auth section header stating it's public/none/not required (e.g., "Authentication: Public (No API Key)")
    /authentication\s*[:：]\s*(none|public|not\s+required|no\s+auth|no\s+key|unauthenticated|không)/i,
    // Explicit statements that the API is public or doesn't need auth
    /\b(no\s+authentication|no\s+authorization|no\s+auth\s+needed|not\s+publicly\s+accessible)\b/i,
    /is\s+(completely\s+)?public\s+(with\s+)?no\s+authentication/i,
    /không\s+(yêu\s+cầu|cần)\s*(api\s*key|auth)/i,
    /all\s+endpoints\s+are\s+public/i,
    /no\s+(authentication|authorization|api\s*key|bearer|token)\s+(required|needed)/i,
    /does\s+not\s+(require|need)\s+(any\s+)?(authentication|authorization|api\s*key)/i,
    /do(es)?n'?t\s+(require|need)\s+(any\s+)?(authentication|authorization|api\s*key)/i,
  ];
  if (negationPatterns.some((pattern) => pattern.test(text))) {
    return false;
  }

  const authKeywords = [
    /\bapi[_-]?key\b/i,
    /\bbearer\b/i,
    /\boauth2?\b/i,
    /\bauthoriz(e|ation)\b/i,
    /\bauthenticat(e|ion)\b/i,
    /\baccess[_-]?token\b/i,
    /\bclient[_-]?(id|secret)\b/i,
    /\bgrant[_-]?type\b/i,
    /\bbasic\s+auth\b/i,
    /\bsecurity\s*schemes?\b/i,
    /\b(secret|credential)s?\b/i,
    /\bsign(ed|ing|ature)\b/i,
    /\bJWT\b/,
    /\bhmac\b/i,
    /--user\s+/, // curl --user (basic auth)
    /-H\s+["']Authorization:/i, // curl -H "Authorization: ..."
  ];
  return authKeywords.some((pattern) => pattern.test(input));
}

/**
 * Detect if a YAML/OpenAPI spec contains securitySchemes.
 */
export function detectAuthInSpec(spec: string): boolean {
  return (
    /securitySchemes\s*:/i.test(spec) || /security\s*:\s*\n\s*-/.test(spec)
  );
}

/**
 * Check if dynamic skill selection is enabled via feature flag.
 */
function useDynamicSkillSelection(): boolean {
  return process.env.DYNAMIC_SKILL_SELECTION === "true";
}

function assignSkillSelectionVariant(
  requestKey: string,
): SkillSelectionVariant {
  const configured = (process.env.SKILL_SELECTION_VARIANT ||
    EXPERIMENT_CONFIG.skillSelectionVariant) as SkillSelectionVariant;
  if (["control", "dynamic", "hybrid"].includes(configured)) {
    return configured as SkillSelectionVariant;
  }

  const hash = createHash("sha256").update(requestKey).digest();
  const bucket = hash.readUInt32BE(0) / 0xffffffff;
  const { control, dynamic } = EXPERIMENT_CONFIG.trafficAllocation;
  if (bucket < control) return "control";
  if (bucket < control + dynamic) return "dynamic";
  return "hybrid";
}

/**
 * Build prompt with skill selection (static or dynamic)
 * Returns messages plus optional metadata for feedback tracking
 */
export async function buildPromptWithExamples(
  openApiSpec: string,
  referenceStructure: string,
  inputExample: string,
  outputExample: string,
  authExample?: string,
  lastError?: string,
  ragContext?: string,
): Promise<{
  messages: ChatMessage[];
  specProfile?: SpecProfile;
  composition?: SkillComposition;
  skillConfidences?: Record<string, number>;
}> {
  const variant = assignSkillSelectionVariant(openApiSpec);
  console.log(
    `[SkillSelect] variant=${useDynamicSkillSelection() ? variant : "control"}`,
  );

  // Check for dynamic skill selection
  if (useDynamicSkillSelection() && variant !== "control") {
    return buildPromptWithDynamicSelection(
      openApiSpec,
      referenceStructure,
      inputExample,
      outputExample,
      authExample,
      lastError,
      ragContext,
      variant,
    );
  }

  // 🔍 Detect if the YAML spec actually has security schemes
  const specHasAuth = detectAuthInSpec(openApiSpec);
  console.log(
    `🔐 Auth detection in spec: ${specHasAuth ? "YES - will include auth patterns" : "NO - skipping auth patterns to prevent contamination"}`,
  );

  // Load skills via router
  const skills = await SkillRouter.assembleMCPSkills({ hasAuth: specHasAuth });

  // Build examples section
  let examplesSection = `YAML INPUT EXAMPLE (OpenAPI Spec):
${inputExample}

TYPESCRIPT OUTPUT EXAMPLE (Generated MCP Server):
${outputExample}`;

  // ONLY add auth example if the spec actually has security schemes
  if (specHasAuth && authExample) {
    examplesSection += `\n\n${"=".repeat(80)}\n\nAUTHENTICATION EXAMPLE (WITH BASIC AUTH, BEARER TOKEN, API KEY):\n\nTYPESCRIPT REFERENCE WITH FULL AUTHENTICATION SUPPORT:\n${authExample}\n\n🔐 KEY AUTHENTICATION PATTERNS FROM THIS EXAMPLE:\n- Basic Auth: Adds username + password parameters to inputSchema\n- Bearer Token: Adds bearer_token parameter to inputSchema\n- API Key: Adds api_key parameter to inputSchema\n- Security schemes are extracted from components.securitySchemes\n- Auth headers are built dynamically in the handler\n- All auth parameters are USER-PROVIDED (not from .env)\n- Use base64 encoding for Basic Auth: btoa(\`\${username}:\${password}\`)\n- Use Bearer format for tokens: \`Bearer \${bearer_token}\`\n- Apply security per operation using operation.security array`;
  }

  // Interpolate System Prompt
  const systemContent = skills.system
    .replace("{{ZOD_MAPPING}}", skills.zodMapping)
    .replace("{{REQUEST_PATTERNS}}", skills.requestPatterns);

  // Interpolate User Prompt
  const userContent = skills.userMessage
    .replace(
      "{{LAST_ERROR}}",
      lastError
        ? `the mcp server has been generated successfully but there are errors and need to be generated again:\n${lastError}\n\n`
        : "",
    )
    .replace("{{REFERENCE_STRUCTURE}}", referenceStructure)
    .replace("{{EXAMPLES_SECTION}}", examplesSection)
    .replace("{{OPENAPI_SPEC}}", openApiSpec)
    .replace(
      "{{RAG_CONTEXT}}",
      ragContext
        ? `🚨 REFERENCE CONTEXT (ONLY FOR REFERENCE - DO NOT COPY DIRECTLY):\n${ragContext}\n`
        : "",
    )
    .replace("{{AUTH_SECTION}}", skills.auth);

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: systemContent.trim(),
    },
    {
      role: "user",
      content: userContent.trim(),
    },
  ];

  // Check token count and truncate if needed
  const stats = calculateMessageTokens(messages);
  const warningLevel = getContextWarningLevel(stats.totalTokens);

  console.log(
    `📊 Context size: ${formatTokenCount(stats.totalTokens)} (${warningLevel})`,
  );

  if (warningLevel === "danger" || warningLevel === "critical") {
    console.warn(
      `⚠️ Large context detected, applying truncation to fit within limits...`,
    );
    return {
      messages: truncateMessages(messages, 120000),
      specProfile: undefined,
      composition: undefined,
      skillConfidences: undefined,
    };
  }

  return {
    messages,
    specProfile: undefined,
    composition: undefined,
    skillConfidences: undefined,
  };
}

/**
 * Dynamic skill selection path using SkillSelectionAgent
 * Returns messages plus metadata for feedback tracking
 */
async function buildPromptWithDynamicSelection(
  openApiSpec: string,
  referenceStructure: string,
  inputExample: string,
  outputExample: string,
  authExample?: string,
  lastError?: string,
  ragContext?: string,
  variant: SkillSelectionVariant = "dynamic",
): Promise<{
  messages: ChatMessage[];
  specProfile: SpecProfile;
  composition: SkillComposition;
  skillConfidences: Record<string, number>;
}> {
  const agent = SkillSelectionAgent.getInstance({
    tokenBudget: 30_000,
  });

  // Ensure agent is initialized
  await agent.initialize();

  // Analyze the spec
  const profile = agent.analyzeSpec(openApiSpec);
  console.log(
    `🧠 Dynamic selection: auth=${profile.auth.hasAuth}, complexity=${profile.guidance.complexityScore}, pagination=${profile.patterns.pagination}`,
  );

  // Select skills based on profile
  const composition = agent.selectSkills(profile, { target: "mcp" });
  if (
    variant === "hybrid" &&
    (composition.averageConfidence ?? 0) <
      EXPERIMENT_CONFIG.hybridConfidenceThreshold
  ) {
    console.warn(
      `[SkillSelect] Hybrid confidence ${(composition.averageConfidence ?? 0).toFixed(2)} below ${EXPERIMENT_CONFIG.hybridConfidenceThreshold}; falling back to static prompt`,
    );
    const previousFlag = process.env.DYNAMIC_SKILL_SELECTION;
    process.env.DYNAMIC_SKILL_SELECTION = "false";
    try {
      return (await buildPromptWithExamples(
        openApiSpec,
        referenceStructure,
        inputExample,
        outputExample,
        authExample,
        lastError,
        ragContext,
      )) as any;
    } finally {
      process.env.DYNAMIC_SKILL_SELECTION = previousFlag;
    }
  }
  console.log(
    `🧠 Selected ${composition.skills.length} skills (${composition.totalTokens} tokens): ${composition.skills.map((s) => s.skillId).join(", ")}`,
  );

  // Build examples section (same as static path)
  let examplesSection = `YAML INPUT EXAMPLE (OpenAPI Spec):
${inputExample}

TYPESCRIPT OUTPUT EXAMPLE (Generated MCP Server):
${outputExample}`;

  if (profile.auth.hasAuth && authExample) {
    examplesSection += `\n\n${"=".repeat(80)}\n\nAUTHENTICATION EXAMPLE (WITH BASIC AUTH, BEARER TOKEN, API KEY):\n\nTYPESCRIPT REFERENCE WITH FULL AUTHENTICATION SUPPORT:\n${authExample}\n\n🔐 KEY AUTHENTICATION PATTERNS FROM THIS EXAMPLE:\n- Basic Auth: Adds username + password parameters to inputSchema\n- Bearer Token: Adds bearer_token parameter to inputSchema\n- API Key: Adds api_key parameter to inputSchema\n- Security schemes are extracted from components.securitySchemes\n- Auth headers are built dynamically in the handler\n- All auth parameters are USER-PROVIDED (not from .env)\n- Use base64 encoding for Basic Auth: btoa(\`\${username}:\${password}\`)\n- Use Bearer format for tokens: \`Bearer \${bearer_token}\`\n- Apply security per operation using operation.security array`;
  }

  const registry = agent.getRegistry();
  const getSkillContent = (id: string) => registry.getSkill(id)?.content || "";
  const selectedIds = new Set(composition.skills.map((s) => s.skillId));
  const zodMapping = selectedIds.has("mcp_zod_mapping")
    ? getSkillContent("mcp_zod_mapping")
    : "";
  const requestPatterns = selectedIds.has("mcp_request_patterns")
    ? getSkillContent("mcp_request_patterns")
    : "";
  const authContent = composition.skills
    .filter(
      (s) =>
        s.skillId === "mcp_requirements" ||
        s.skillId === "mcp_anti_contamination",
    )
    .map((s) => getSkillContent(s.skillId))
    .join("\n\n---\n\n");

  const systemTemplate =
    getSkillContent("mcp_system") ||
    "You are an expert MCP Server generator.\n\n{{ZOD_MAPPING}}\n\n{{REQUEST_PATTERNS}}";
  const userTemplate =
    getSkillContent("mcp_user_message") ||
    "{{REFERENCE_STRUCTURE}}\n\n{{EXAMPLES_SECTION}}\n\n{{LAST_ERROR}}\n\n{{OPENAPI_SPEC}}\n\n{{RAG_CONTEXT}}\n\n{{AUTH_SECTION}}";

  const systemContent = systemTemplate
    .replaceAll("{{ZOD_MAPPING}}", zodMapping)
    .replaceAll("{{REQUEST_PATTERNS}}", requestPatterns);

  const userContent = userTemplate
    .replace("{{REFERENCE_STRUCTURE}}", referenceStructure)
    .replace("{{EXAMPLES_SECTION}}", examplesSection)
    .replace(
      "{{LAST_ERROR}}",
      lastError
        ? `the mcp server has been generated successfully but there are errors and need to be generated again:\n${lastError}\n\n`
        : "",
    )
    .replace("{{OPENAPI_SPEC}}", openApiSpec)
    .replace(
      "{{RAG_CONTEXT}}",
      ragContext
        ? `🚨 REFERENCE CONTEXT (ONLY FOR REFERENCE - DO NOT COPY DIRECTLY):\n${ragContext}\n`
        : "",
    )
    .replace("{{AUTH_SECTION}}", authContent);

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: systemContent.trim(),
    },
    {
      role: "user",
      content: userContent.trim(),
    },
  ];

  // Check token count and truncate if needed
  const stats = calculateMessageTokens(messages);
  const warningLevel = getContextWarningLevel(stats.totalTokens);

  console.log(
    `📊 Context size: ${formatTokenCount(stats.totalTokens)} (${warningLevel})`,
  );

  if (warningLevel === "danger" || warningLevel === "critical") {
    console.warn(
      `⚠️ Large context detected, applying truncation to fit within limits...`,
    );
    return {
      messages: truncateMessages(messages, 120000),
      specProfile: profile,
      composition,
      skillConfidences: composition.skills.reduce(
        (acc, s) => ({ ...acc, [s.skillId]: s.confidence }),
        {},
      ),
    };
  }

  return {
    messages,
    specProfile: profile,
    composition,
    skillConfidences: composition.skills.reduce(
      (acc, s) => ({ ...acc, [s.skillId]: s.confidence }),
      {},
    ),
  };
}

/**
 * Enhanced system prompt for generating OpenAPI specifications from API endpoints
 */
export async function buildOpenAPIPromptWithExamples(
  apiEndpoints: string,
  inputExample: string,
  outputExample: string,
  outputExampleReddit?: string,
  outputExampleTwilio?: string,
  lastError?: string,
  ragContext?: string,
): Promise<{
  messages: ChatMessage[];
  specProfile?: SpecProfile;
  composition?: SkillComposition;
  skillConfidences?: Record<string, number>;
}> {
  const variant = assignSkillSelectionVariant(apiEndpoints);
  console.log(
    `[SkillSelect] variant=${useDynamicSkillSelection() ? variant : "control"}`,
  );

  // Check for dynamic skill selection
  if (useDynamicSkillSelection() && variant !== "control") {
    return buildOpenAPIPromptWithDynamicSelection(
      apiEndpoints,
      inputExample,
      outputExample,
      outputExampleReddit,
      outputExampleTwilio,
      lastError,
      ragContext,
      variant,
    );
  }

  // 🔍 Detect if the user's input actually mentions authentication
  const inputHasAuth = detectAuthInInput(apiEndpoints);
  console.log(
    `🔐 Auth detection in input: ${inputHasAuth ? "YES - will include auth examples" : "NO - skipping auth examples to prevent contamination"}`,
  );

  // Load skills via router
  const skills = await SkillRouter.assembleOpenAPISkills({
    hasAuth: inputHasAuth,
  });

  // Build the examples section - always include the basic HTTPBin example
  let examplesSection = `EXAMPLE 1 - HTTPBin API (Simple GET/POST, NO authentication):

INPUT EXAMPLE:
${inputExample}

YAML OUTPUT EXAMPLE:
${outputExample}`;

  // ONLY add Reddit/Twilio auth examples if the input actually has auth
  if (inputHasAuth) {
    // Add Reddit example if available
    if (outputExampleReddit) {
      const redditInputMatch = inputExample.match(
        /\/\/ Reddit API with OAuth2\s*\nconst redditInput = `([^`]+)`/s,
      );
      if (!redditInputMatch) {
        console.warn(
          "⚠️ Reddit input regex did not match — input_example.ts format may have changed. Falling back to generic label.",
        );
      }
      const redditInput = redditInputMatch
        ? redditInputMatch[1]
        : "Reddit API (see input example)";

      examplesSection += `\n\n${"=".repeat(80)}\n\nEXAMPLE 2 - Reddit API (OAuth2 Bearer Token Authentication):

INPUT EXAMPLE:
${redditInput}

YAML OUTPUT EXAMPLE:
${outputExampleReddit}`;
    }

    // Add Twilio example if available
    if (outputExampleTwilio) {
      const twilioInputMatch = inputExample.match(
        /\/\/ Twilio WhatsApp API with Basic Auth\s*\nconst twilioInput = `([^`]+)`/s,
      );
      if (!twilioInputMatch) {
        console.warn(
          "⚠️ Twilio input regex did not match — input_example.ts format may have changed. Falling back to generic label.",
        );
      }
      const twilioInput = twilioInputMatch
        ? twilioInputMatch[1]
        : "Twilio WhatsApp API (see input example)";

      examplesSection += `\n\n${"=".repeat(80)}\n\nEXAMPLE 3 - Twilio WhatsApp API (Basic Authentication):

INPUT EXAMPLE:
${twilioInput}

YAML OUTPUT EXAMPLE:
${outputExampleTwilio}`;
    }
  }

  // Build auth-specific or anti-contamination instructions
  const authSection = inputHasAuth
    ? skills.requirements.replace("{{INPUT_FORMAT}}", skills.inputFormat)
    : skills.antiContamination;

  const authOutputSection = inputHasAuth
    ? `- ⚠️ DO NOT CREATE UNNECESSARY PARAMETERS - Only include parameters that are explicitly defined in the OpenAPI spec. DO NOT invent authentication parameters like "bearer_token", "api_key", or other fields if they are NOT in the original specification
- ENSURE authentication parameters (like client_id, client_secret, tokens) are properly documented
- Include security schemes in components/securitySchemes
- Apply security requirements at operation level where needed
- Add detailed descriptions for authentication headers and parameters`
    : `- 🚫 DO NOT include any securitySchemes or security sections - the input API has NO authentication
- DO NOT add Authorization headers, bearer tokens, API keys, or OAuth2 flows
- If uncertain about auth, default to NO authentication`;

  // Build system message
  const systemContent = skills.system.trim();

  // Interpolate User message
  const userContent = skills.userMessage
    .replace(
      "{{LAST_ERROR}}",
      lastError
        ? `the yaml file has been generated successfully but there are errors and need to be generated again:\n${lastError}\n\n`
        : "",
    )
    .replace("{{EXAMPLES_SECTION}}", examplesSection)
    .replace("{{AUTH_SECTION}}", authSection)
    .replace("{{API_ENDPOINTS}}", apiEndpoints)
    .replace(
      "{{RAG_CONTEXT}}",
      ragContext
        ? `🚨 REFERENCE CONTEXT (ONLY FOR REFERENCE - DO NOT COPY DIRECTLY):\n${ragContext}\n`
        : "",
    )
    .replace("{{AUTH_OUTPUT_SECTION}}", authOutputSection);

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: systemContent,
    },
    {
      role: "user",
      content: userContent.trim(),
    },
  ];

  // Check token count and truncate if needed
  const stats = calculateMessageTokens(messages);
  const warningLevel = getContextWarningLevel(stats.totalTokens);

  console.log(
    `📊 Context size: ${formatTokenCount(stats.totalTokens)} (${warningLevel})`,
  );

  if (warningLevel === "danger" || warningLevel === "critical") {
    console.warn(
      `⚠️ Large context detected, applying truncation to fit within limits...`,
    );
    return {
      messages: truncateMessages(messages, 120000),
      specProfile: undefined,
      composition: undefined,
      skillConfidences: undefined,
    };
  }

  return {
    messages,
    specProfile: undefined,
    composition: undefined,
    skillConfidences: undefined,
  };
}

/**
 * Dynamic skill selection path for OpenAPI generation
 * Returns messages plus metadata for feedback tracking
 */
async function buildOpenAPIPromptWithDynamicSelection(
  apiEndpoints: string,
  inputExample: string,
  outputExample: string,
  outputExampleReddit?: string,
  outputExampleTwilio?: string,
  lastError?: string,
  ragContext?: string,
  variant: SkillSelectionVariant = "dynamic",
): Promise<{
  messages: ChatMessage[];
  specProfile: SpecProfile;
  composition: SkillComposition;
  skillConfidences: Record<string, number>;
}> {
  const agent = SkillSelectionAgent.getInstance({
    tokenBudget: 30_000,
  });

  await agent.initialize();

  // Analyze free-form endpoint descriptions with text-aware heuristics.
  const profile = agent.getAnalyzer().analyzeEndpointDescription(apiEndpoints);
  console.log(
    `🧠 Dynamic OpenAPI selection: auth=${profile.auth.hasAuth}, complexity=${profile.guidance.complexityScore}`,
  );

  const composition = agent.selectSkills(profile, { target: "openapi" });
  if (
    variant === "hybrid" &&
    (composition.averageConfidence ?? 0) <
      EXPERIMENT_CONFIG.hybridConfidenceThreshold
  ) {
    console.warn(
      `[SkillSelect] Hybrid confidence ${(composition.averageConfidence ?? 0).toFixed(2)} below ${EXPERIMENT_CONFIG.hybridConfidenceThreshold}; falling back to static OpenAPI prompt`,
    );
    const previousFlag = process.env.DYNAMIC_SKILL_SELECTION;
    process.env.DYNAMIC_SKILL_SELECTION = "false";
    try {
      return (await buildOpenAPIPromptWithExamples(
        apiEndpoints,
        inputExample,
        outputExample,
        outputExampleReddit,
        outputExampleTwilio,
        lastError,
        ragContext,
      )) as any;
    } finally {
      process.env.DYNAMIC_SKILL_SELECTION = previousFlag;
    }
  }
  console.log(
    `🧠 Selected ${composition.skills.length} skills (${composition.totalTokens} tokens): ${composition.skills.map((s) => s.skillId).join(", ")}`,
  );

  // Build examples section (same as static path)
  let examplesSection = `EXAMPLE 1 - HTTPBin API (Simple GET/POST, NO authentication):

INPUT EXAMPLE:
${inputExample}

YAML OUTPUT EXAMPLE:
${outputExample}`;

  if (profile.auth.hasAuth) {
    if (outputExampleReddit) {
      const redditInputMatch = inputExample.match(
        /\/\/ Reddit API with OAuth2\s*\nconst redditInput = `([^`]+)`/s,
      );
      const redditInput = redditInputMatch
        ? redditInputMatch[1]
        : "Reddit API (see input example)";

      examplesSection += `\n\n${"=".repeat(80)}\n\nEXAMPLE 2 - Reddit API (OAuth2 Bearer Token Authentication):

INPUT EXAMPLE:
${redditInput}

YAML OUTPUT EXAMPLE:
${outputExampleReddit}`;
    }

    if (outputExampleTwilio) {
      const twilioInputMatch = inputExample.match(
        /\/\/ Twilio WhatsApp API with Basic Auth\s*\nconst twilioInput = `([^`]+)`/s,
      );
      const twilioInput = twilioInputMatch
        ? twilioInputMatch[1]
        : "Twilio WhatsApp API (see input example)";

      examplesSection += `\n\n${"=".repeat(80)}\n\nEXAMPLE 3 - Twilio WhatsApp API (Basic Authentication):

INPUT EXAMPLE:
${twilioInput}

YAML OUTPUT EXAMPLE:
${outputExampleTwilio}`;
    }
  }

  // Build auth section based on selected skills
  const registry = agent.getRegistry();
  const getSkillContent = (id: string) => registry.getSkill(id)?.content || "";
  const authInputFormat = getSkillContent("auth_input_format");
  const authSkills = composition.skills.filter((s) =>
    s.skillId === "openapi_requirements" ||
    s.skillId === "openapi_anti_contamination",
  );
  const authContent =
    authSkills.length > 0
      ? authSkills
          .map((s) =>
            getSkillContent(s.skillId).replaceAll(
              "{{INPUT_FORMAT}}",
              authInputFormat,
            ),
          )
          .join("\n\n---\n\n")
      : "";

  const authOutputSection = profile.auth.hasAuth
    ? `- ⚠️ DO NOT CREATE UNNECESSARY PARAMETERS - Only include parameters that are explicitly defined in the OpenAPI spec.
- ENSURE authentication parameters are properly documented
- Include security schemes in components/securitySchemes`
    : `- 🚫 DO NOT include any securitySchemes or security sections - the input API has NO authentication`;

  // Build messages
  const systemContent =
    composition.skills
      .filter((s) => {
        const skill = registry.getSkill(s.skillId);
        return skill?.category === "openapi" && skill.id.includes("system");
      })
      .map((s) => getSkillContent(s.skillId))
      .join("\n\n---\n\n") || "";

  const userContent = (
    getSkillContent("openapi_user_message") || ""
  )
    .replace(
      "{{LAST_ERROR}}",
      lastError
        ? `the yaml file has been generated successfully but there are errors and need to be generated again:\n${lastError}\n\n`
        : "",
    )
    .replace("{{EXAMPLES_SECTION}}", examplesSection)
    .replace("{{AUTH_SECTION}}", authContent)
    .replace("{{API_ENDPOINTS}}", apiEndpoints)
    .replace(
      "{{RAG_CONTEXT}}",
      ragContext
        ? `🚨 REFERENCE CONTEXT (ONLY FOR REFERENCE - DO NOT COPY DIRECTLY):\n${ragContext}\n`
        : "",
    )
    .replace("{{AUTH_OUTPUT_SECTION}}", authOutputSection);

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: systemContent.trim(),
    },
    {
      role: "user",
      content: userContent.trim(),
    },
  ];

  const stats = calculateMessageTokens(messages);
  const warningLevel = getContextWarningLevel(stats.totalTokens);

  console.log(
    `📊 Context size: ${formatTokenCount(stats.totalTokens)} (${warningLevel})`,
  );

  if (warningLevel === "danger" || warningLevel === "critical") {
    console.warn(
      `⚠️ Large context detected, applying truncation to fit within limits...`,
    );
    return {
      messages: truncateMessages(messages, 120000),
      specProfile: profile,
      composition,
      skillConfidences: composition.skills.reduce(
        (acc, s) => ({ ...acc, [s.skillId]: s.confidence }),
        {},
      ),
    };
  }

  return {
    messages,
    specProfile: profile,
    composition,
    skillConfidences: composition.skills.reduce(
      (acc, s) => ({ ...acc, [s.skillId]: s.confidence }),
      {},
    ),
  };
}

// =============================================================================
// MODULAR PROMPT SYSTEM
// =============================================================================
// All prompts are now managed globally via src/skills/ and SkillRouter.
// This improves maintainability, prevents knowledge contamination,
// and allows for dynamic skill injection based on context.
