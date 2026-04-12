// src/generator/prompt.ts - Modularized version using SkillRouter
import {
  calculateMessageTokens,
  truncateMessages,
  formatTokenCount,
  getContextWarningLevel,
} from "../utils/token-counter.ts";
import { SkillRouter } from "../skills/skill-router.ts";

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
    /--user\s+/,                          // curl --user (basic auth)
    /-H\s+["']Authorization:/i,          // curl -H "Authorization: ..."
  ];
  return authKeywords.some((pattern) => pattern.test(input));
}

/**
 * Detect if a YAML/OpenAPI spec contains securitySchemes.
 */
export function detectAuthInSpec(spec: string): boolean {
  return /securitySchemes\s*:/i.test(spec) || /security\s*:\s*\n\s*-/m.test(spec);
}

/**
 * Enhanced system prompt for generating MCP Servers that work successfully
 */
export async function buildPromptWithExamples(
  openApiSpec: string,
  referenceStructure: string,
  inputExample: string,
  outputExample: string,
  authExample?: string,
  lastError?: string,
  ragContext?: string,
): Promise<ChatMessage[]> {
  // 🔍 Detect if the YAML spec actually has security schemes
  const specHasAuth = detectAuthInSpec(openApiSpec);
  console.log(`🔐 Auth detection in spec: ${specHasAuth ? "YES - will include auth patterns" : "NO - skipping auth patterns to prevent contamination"}`);

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
    .replace('{{ZOD_MAPPING}}', skills.zodMapping)
    .replace('{{REQUEST_PATTERNS}}', skills.requestPatterns);

  // Interpolate User Prompt
  const userContent = skills.userMessage
    .replace('{{LAST_ERROR}}', lastError ? `the mcp server has been generated successfully but there are errors and need to be generated again:\n${lastError}\n\n` : "")
    .replace('{{REFERENCE_STRUCTURE}}', referenceStructure)
    .replace('{{EXAMPLES_SECTION}}', examplesSection)
    .replace('{{OPENAPI_SPEC}}', openApiSpec)
    .replace('{{RAG_CONTEXT}}', ragContext ? `🚨 REFERENCE CONTEXT (ONLY FOR REFERENCE - DO NOT COPY DIRECTLY):\n${ragContext}\n` : "")
    .replace('{{AUTH_SECTION}}', skills.auth);

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
    return truncateMessages(messages, 120000);
  }

  return messages;
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
): Promise<ChatMessage[]> {
  // 🔍 Detect if the user's input actually mentions authentication
  const inputHasAuth = detectAuthInInput(apiEndpoints);
  console.log(`🔐 Auth detection in input: ${inputHasAuth ? "YES - will include auth examples" : "NO - skipping auth examples to prevent contamination"}`);

  // Load skills via router
  const skills = await SkillRouter.assembleOpenAPISkills({ hasAuth: inputHasAuth });

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
        console.warn("⚠️ Reddit input regex did not match — input_example.ts format may have changed. Falling back to generic label.");
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
        console.warn("⚠️ Twilio input regex did not match — input_example.ts format may have changed. Falling back to generic label.");
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
    ? skills.requirements.replace('{{INPUT_FORMAT}}', skills.inputFormat)
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
    .replace('{{LAST_ERROR}}', lastError ? `the yaml file has been generated succesfully but there are errors and need to be generated again:\n${lastError}\n\n` : "")
    .replace('{{EXAMPLES_SECTION}}', examplesSection)
    .replace('{{AUTH_SECTION}}', authSection)
    .replace('{{API_ENDPOINTS}}', apiEndpoints)
    .replace('{{RAG_CONTEXT}}', ragContext ? `🚨 REFERENCE CONTEXT (ONLY FOR REFERENCE - DO NOT COPY DIRECTLY):\n${ragContext}\n` : "")
    .replace('{{AUTH_OUTPUT_SECTION}}', authOutputSection);

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
    return truncateMessages(messages, 120000);
  }

  return messages;
}

// =============================================================================
// MODULAR PROMPT SYSTEM
// =============================================================================
// All prompts are now managed globally via src/skills/ and SkillRouter.
// This improves maintainability, prevents knowledge contamination,
// and allows for dynamic skill injection based on context.
