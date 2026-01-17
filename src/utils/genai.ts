import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { openaiConfig } from "./config.js";
import { estimateTokens, formatTokenCount } from "./token-counter.js";

export interface GenAIChatMessage {
  role: "user" | "model" | "assistant" | "system";
  content: string;
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
    const llm = temperature !== undefined || maxTokens !== undefined
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

    // Extract content from response
    const result = typeof response.content === "string" 
      ? response.content 
      : JSON.stringify(response.content);

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
