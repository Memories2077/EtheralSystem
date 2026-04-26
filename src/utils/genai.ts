// --- NEW LangChain Google Generative AI imports ---
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import {
  HumanMessage,
  SystemMessage,
  AIMessage,
} from "@langchain/core/messages";
import { geminiConfig, groqConfig, metaclawConfig } from "./config.js";
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
  // 1. Auto-detect available provider to determine which model to use
  let selectedProvider: "gemini" | "groq";

  if (geminiConfig.apiKey) {
    selectedProvider = "gemini";
  } else if (groqConfig.apiKey) {
    selectedProvider = "groq";
  } else {
    throw new Error(
      "No API keys found for Gemini or Groq. Please check your .env file.",
    );
  }

  const isGroq = selectedProvider === "groq";
  const currentConfig = isGroq ? groqConfig : geminiConfig;
  const selectedModel = currentConfig.model;

  try {
    // 2. Route through MetaClaw if enabled
    let llm;
    if (metaclawConfig.enabled) {
      console.log("[GenAI] 🧠 Routing through MetaClaw proxy");
      llm = new ChatOpenAI({
        configuration: {
          baseURL: metaclawConfig.baseUrl,
        },
        apiKey: metaclawConfig.apiKey,
        model: selectedModel,
        temperature: temperature ?? currentConfig.temperature,
        topP: metaclawConfig.topP,
        maxTokens: maxTokens ?? metaclawConfig.maxTokens,
        maxRetries: 2,
      });
    } else {
      // Log context usage
      const totalTokens = messages.reduce(
        (sum, msg) => sum + estimateTokens(msg.content),
        0,
      );
      console.log(
        `🤖 Sending request to ${selectedProvider} (auto-selected) (${selectedModel}): ${formatTokenCount(totalTokens)}`,
      );

      // Convert messages to LangChain format
      const langchainMessages = convertToLangChainMessages(messages);

      // 3. Lazy initialization of the LLM client (original provider-specific logic)
      if (isGroq) {
        llm = new ChatGroq({
          apiKey: groqConfig.apiKey,
          model: selectedModel,
          temperature: temperature ?? groqConfig.temperature,
          maxTokens: maxTokens,
          maxRetries: 2,
        });
      } else {
        llm = new ChatGoogleGenerativeAI({
          apiKey: geminiConfig.apiKey,
          model: selectedModel,
          temperature: temperature ?? geminiConfig.temperature,
          maxOutputTokens: maxTokens,
          maxRetries: 2,
        });
      }

      // Call LangChain API
      const response = await llm.invoke(langchainMessages, {
        timeout: currentConfig.timeoutMs,
      });

      // Debug: Log response structure in development mode
      if (process.env.DEBUG_GENAI === "true") {
        console.log("🔍 LangChain response structure:", {
          hasContent: !!response.content,
          contentType: typeof response.content,
        });
      }

      // Extract content from LangChain response
      let result: string;

      if (typeof response.content === "string") {
        result = response.content;
      } else if (response.content && typeof response.content === "object") {
        // Handle array or object content
        result = JSON.stringify(response.content);
      } else {
        // Fallback: stringify entire response
        console.warn("⚠️ Unexpected response format, using fallback stringify");
        result = JSON.stringify(response);
      }

      // Trim leading/trailing whitespace from result
      result = result.trim();

      const outputTokens = estimateTokens(result);
      console.log(`✅ Received response: ${formatTokenCount(outputTokens)}`);
      console.log(
        `📊 Token usage - Input: ${formatTokenCount(totalTokens)} | Output: ${formatTokenCount(outputTokens)} | Total: ${formatTokenCount(totalTokens + outputTokens)}`,
      );

      return result;
    }

    // 4. Call MetaClaw (when enabled) - shared invocation logic
    const langchainMessages = convertToLangChainMessages(messages);
    const response = await llm.invoke(langchainMessages, {
      timeout: currentConfig.timeoutMs,
    });

    // Debug: Log response structure in development mode
    if (process.env.DEBUG_GENAI === "true") {
      console.log("🔍 LangChain response structure:", {
        hasContent: !!response.content,
        contentType: typeof response.content,
      });
    }

    // Extract content from LangChain response
    let result: string;

    if (typeof response.content === "string") {
      result = response.content;
    } else if (response.content && typeof response.content === "object") {
      // Handle array or object content
      result = JSON.stringify(response.content);
    } else {
      // Fallback: stringify entire response
      console.warn("⚠️ Unexpected response format, using fallback stringify");
      result = JSON.stringify(response);
    }

    // Trim leading/trailing whitespace from result
    result = result.trim();

    const totalTokens = messages.reduce(
      (sum, msg) => sum + estimateTokens(msg.content),
      0,
    );
    const outputTokens = estimateTokens(result);
    console.log(`✅ Received response: ${formatTokenCount(outputTokens)}`);
    console.log(
      `📊 Token usage - Input: ${formatTokenCount(totalTokens)} | Output: ${formatTokenCount(outputTokens)} | Total: ${formatTokenCount(totalTokens + outputTokens)}`,
    );

    return result;
  } catch (error: any) {
    console.error(`Error calling ${metaclawConfig.enabled ? "MetaClaw" : selectedProvider} API:`, error);
    throw new Error(
      `[${metaclawConfig.enabled ? "MetaClaw" : selectedProvider} API Error] ${error.message || "Unknown error occurred"}`,
    );
  }
}
