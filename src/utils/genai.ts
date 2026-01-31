import { ChatOpenAI } from "@langchain/openai";
import {
  HumanMessage,
  SystemMessage,
  AIMessage,
} from "@langchain/core/messages";
import { openaiConfig } from "./config.js";
import { estimateTokens, formatTokenCount } from "./token-counter.js";

export interface GenAIChatMessage {
  role: "user" | "model" | "assistant" | "system";
  content: string;
}

// Extended response type to handle different API formats
interface OpenAIChoiceMessage {
  role: string;
  content: string;
  reasoning_content?: string; // For deep thinking models
}

interface OpenAIChoice {
  message: OpenAIChoiceMessage;
  finish_reason?: string;
  index?: number;
}

interface OpenAIResponse {
  choices?: OpenAIChoice[];
  [key: string]: any; // Allow other properties
}

export interface GenAICompletionParams {
  messages: GenAIChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

// Initialize LangChain OpenAI client with configuration
const client = new ChatOpenAI({
  configuration: {
    baseURL: openaiConfig.baseUrl,
  },
  apiKey: openaiConfig.apiKey,
  model: openaiConfig.model,
  temperature: openaiConfig.temperature,
  timeout: openaiConfig.timeoutMs,
  maxRetries: 2,
});

// Convert GenAIChatMessage to LangChain message format
function convertToLangChainMessages(messages: GenAIChatMessage[]) {
  return messages.map((m) => {
    if (m.role === "system") {
      return new SystemMessage(m.content);
    } else if (m.role === "assistant" || m.role === "model") {
      return new AIMessage(m.content);
    } else {
      return new HumanMessage(m.content);
    }
  });
}

// --- Original function for single API calls ---
export async function genaiCompletion({
  messages,
  temperature,
  maxTokens,
}: GenAICompletionParams): Promise<string> {
  try {
    // Log context usage
    const totalTokens = messages.reduce(
      (sum, msg) => sum + estimateTokens(msg.content),
      0,
    );
    console.log(`🤖 Sending request to LLM: ${formatTokenCount(totalTokens)}`);

    // Convert messages to LangChain format
    const langchainMessages = convertToLangChainMessages(messages);

    // Create a new client instance with custom parameters if needed
    const llm =
      temperature !== undefined || maxTokens !== undefined
        ? new ChatOpenAI({
            configuration: {
              baseURL: openaiConfig.baseUrl,
            },
            apiKey: openaiConfig.apiKey,
            model: openaiConfig.model,
            temperature: temperature ?? openaiConfig.temperature,
            maxTokens: maxTokens,
            timeout: openaiConfig.timeoutMs,
            maxRetries: 2,
          })
        : client;

    // Call LangChain OpenAI API
    const response = await llm.invoke(langchainMessages);

    // Debug: Log response structure in development mode
    if (process.env.DEBUG_GENAI === "true") {
      console.log("🔍 Raw response structure:", {
        hasContent: !!response.content,
        contentType: typeof response.content,
        hasChoices: !!(response as any).choices,
        responseKeys: Object.keys(response),
      });
    }

    // Extract content from response
    // LangChain wraps the response, but we need to handle both:
    // 1. LangChain's response.content (AIMessage format)
    // 2. Raw OpenAI format with choices[0].message.content
    let result: string;

    if (typeof response.content === "string") {
      result = response.content;
    } else if (response.content && typeof response.content === "object") {
      // Handle array or object content
      result = JSON.stringify(response.content);
    } else {
      // Try to handle raw OpenAI API format
      const rawResponse = response as unknown as OpenAIResponse;

      if (rawResponse.choices?.[0]?.message) {
        const message = rawResponse.choices[0].message;

        // Check for reasoning_content first (for models like DeepSeek-R1)
        if (message.reasoning_content && !message.content) {
          console.log("🧠 Using reasoning_content as main response");
          result = message.reasoning_content;
        } else if (message.content) {
          result = message.content;

          // Log if there's additional reasoning content
          if (message.reasoning_content) {
            console.log("🧠 Model used reasoning capabilities");
            if (process.env.DEBUG_GENAI === "true") {
              const reasoningLength = message.reasoning_content.length;
              console.log(`🧠 Reasoning length: ${reasoningLength} characters`);
            }
          }
        } else if (message.reasoning_content) {
          // Fallback if both exist but content is empty
          result = message.reasoning_content;
        } else {
          // No content or reasoning_content
          console.warn("⚠️ No content or reasoning_content in message");
          result = JSON.stringify(message);
        }
      } else {
        // Fallback: stringify entire response
        console.warn("⚠️ Unexpected response format, using fallback stringify");
        result = JSON.stringify(response);
      }
    }

    // Trim leading/trailing whitespace from result
    result = result.trim();

    console.log(
      `✅ Received response: ${formatTokenCount(estimateTokens(result))}`,
    );

    return result;
  } catch (error: any) {
    console.error("Error calling OpenAI API:", error);
    if (error.message) {
      return `Error from OpenAI service: ${error.message}`;
    } else {
      return "An unknown error occurred while contacting the OpenAI service.";
    }
  }
}
