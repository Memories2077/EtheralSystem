// src/utils/token-counter.ts
// Utility for estimating and managing token counts in LLM prompts

export interface ChatMessage {
  role: "user" | "model" | "assistant" | "system";
  content: string;
}

export interface TokenStats {
  totalTokens: number;
  systemTokens: number;
  userTokens: number;
  breakdown: Record<string, number>;
}

/**
 * Estimates token count for a given text
 * Rule of thumb: 1 token ≈ 4 characters for English text
 * This is a rough approximation, actual tokenization may vary
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Average: 1 token per 4 characters
  return Math.ceil(text.length / 4);
}

/**
 * Calculates total tokens from an array of messages
 */
export function calculateMessageTokens(messages: ChatMessage[]): TokenStats {
  const breakdown: Record<string, number> = {};
  let systemTokens = 0;
  let userTokens = 0;

  messages.forEach((msg, idx) => {
    const tokens = estimateTokens(msg.content);
    breakdown[`message_${idx}_${msg.role}`] = tokens;

    if (msg.role === "model") {
      systemTokens += tokens;
    } else {
      userTokens += tokens;
    }
  });

  return {
    totalTokens: systemTokens + userTokens,
    systemTokens,
    userTokens,
    breakdown,
  };
}

/**
 * Truncates text to fit within a token limit
 * Preserves beginning and end, truncates middle
 */
export function truncateToTokenLimit(
  text: string,
  maxTokens: number,
  preserveStart: number = 0.6,
): string {
  const currentTokens = estimateTokens(text);

  if (currentTokens <= maxTokens) {
    return text;
  }

  // Calculate character limits
  const maxChars = maxTokens * 4;
  const startChars = Math.floor(maxChars * preserveStart);
  const endChars = maxChars - startChars - 100; // Reserve space for truncation message

  const truncatedText =
    text.substring(0, startChars) +
    "\n\n... [TRUNCATED FOR CONTEXT SIZE] ...\n\n" +
    text.substring(text.length - endChars);

  return truncatedText;
}

/**
 * Truncates messages to fit within total token budget
 * Strategy: Prioritize system instructions, truncate examples
 */
export function truncateMessages(
  messages: ChatMessage[],
  maxTokens: number = 120000, // Reserve 8k for response
): ChatMessage[] {
  const stats = calculateMessageTokens(messages);

  if (stats.totalTokens <= maxTokens) {
    console.log(
      `✅ Context size OK: ${stats.totalTokens.toLocaleString()} / ${maxTokens.toLocaleString()} tokens`,
    );
    return messages;
  }

  console.warn(
    `⚠️ Context too large: ${stats.totalTokens.toLocaleString()} tokens (max: ${maxTokens.toLocaleString()})`,
  );
  console.warn(`   System: ${stats.systemTokens.toLocaleString()} tokens`);
  console.warn(`   User: ${stats.userTokens.toLocaleString()} tokens`);

  // Calculate how much we need to reduce
  const excessTokens = stats.totalTokens - maxTokens;

  return messages.map((msg, idx) => {
    // Always keep system instructions intact (first message)
    if (idx === 0) {
      return msg;
    }

    // Truncate user message if needed
    if (msg.role === "user") {
      // Try to intelligently truncate examples
      const truncatedContent = truncateUserMessage(
        msg.content,
        excessTokens,
        stats.userTokens,
      );
      return { ...msg, content: truncatedContent };
    }

    return msg;
  });
}

/**
 * Intelligently truncates user message by reducing example sizes
 */
function truncateUserMessage(
  content: string,
  excessTokens: number,
  totalUserTokens: number,
): string {
  // Calculate target token count
  const targetTokens = totalUserTokens - excessTokens;

  // Try to identify and truncate large sections
  const sections = {
    outputExample: extractSection(content, "OUTPUT EXAMPLE", "NOW GENERATE"),
    inputExample: extractSection(content, "INPUT EXAMPLE", "YAML OUTPUT"),
    referenceStructure: extractSection(
      content,
      "REFERENCE STRUCTURE",
      "YAML INPUT",
    ),
  };

  let newContent = content;

  // Truncate OUTPUT EXAMPLE most aggressively (usually largest)
  if (sections.outputExample) {
    const outputTokens = estimateTokens(sections.outputExample);
    if (outputTokens > 20000) {
      const truncated = truncateToTokenLimit(sections.outputExample, 15000);
      newContent = newContent.replace(sections.outputExample, truncated);
      console.log(
        `   📝 Truncated OUTPUT EXAMPLE: ${outputTokens.toLocaleString()} → 15,000 tokens`,
      );
    }
  }

  // Check if we need to truncate more
  const currentTokens = estimateTokens(newContent);
  if (currentTokens > targetTokens) {
    // Truncate INPUT EXAMPLE
    if (sections.inputExample) {
      const inputTokens = estimateTokens(sections.inputExample);
      if (inputTokens > 10000) {
        const truncated = truncateToTokenLimit(sections.inputExample, 8000);
        newContent = newContent.replace(sections.inputExample, truncated);
        console.log(
          `   📝 Truncated INPUT EXAMPLE: ${inputTokens.toLocaleString()} → 8,000 tokens`,
        );
      }
    }
  }

  // Final check - if still too large, truncate everything proportionally
  const finalTokens = estimateTokens(newContent);
  if (finalTokens > targetTokens) {
    newContent = truncateToTokenLimit(newContent, targetTokens);
    console.log(
      `   ⚠️ Applied final truncation: ${finalTokens.toLocaleString()} → ${targetTokens.toLocaleString()} tokens`,
    );
  }

  return newContent;
}

/**
 * Extracts a section between two markers
 */
function extractSection(
  text: string,
  startMarker: string,
  endMarker: string,
): string | null {
  const startIdx = text.indexOf(startMarker);
  if (startIdx === -1) return null;

  const endIdx = text.indexOf(endMarker, startIdx);
  if (endIdx === -1) return null;

  return text.substring(startIdx, endIdx);
}

/**
 * Formats token count for display
 */
export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return `${tokens} tokens`;
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}k tokens`;
  return `${(tokens / 1000000).toFixed(2)}M tokens`;
}

/**
 * Checks if context size is within safe limits
 */
export function isContextSafe(
  tokens: number,
  maxTokens: number = 128000,
  reserveForResponse: number = 8000,
): boolean {
  return tokens <= maxTokens - reserveForResponse;
}

/**
 * Gets warning level based on context usage
 */
export function getContextWarningLevel(
  tokens: number,
  maxTokens: number = 128000,
): "safe" | "warning" | "danger" | "critical" {
  const usage = tokens / maxTokens;

  if (usage < 0.7) return "safe";
  if (usage < 0.85) return "warning";
  if (usage < 0.95) return "danger";
  return "critical";
}
