import { ChatOllama } from "@langchain/ollama";
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  BaseMessage,
} from "@langchain/core/messages";
import { ollamaConfig } from "./config.js";

export interface GenAIChatMessage {
  role: "user" | "model";
  content: string;
}

export interface GenAICompletionParams {
  messages: GenAIChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

// Initialize ChatOllama with configuration
const llm = new ChatOllama({
  model: ollamaConfig.model,
  temperature: ollamaConfig.temperature,
  baseUrl: ollamaConfig.baseUrl,
});

// Convert GenAIChatMessage to LangChain message format
function convertToLangChainMessages(
  messages: GenAIChatMessage[]
): BaseMessage[] {
  return messages.map((m) => {
    if (m.role === "user") {
      return new HumanMessage(m.content);
    } else {
      // "model" role maps to AIMessage
      return new AIMessage(m.content);
    }
  });
}

// --- Original function for single API calls ---
export async function genaiCompletion({
  messages,
}: GenAICompletionParams): Promise<string> {
  try {
    // Convert messages to LangChain format
    const langChainMessages = convertToLangChainMessages(messages);

    // Call Ollama via LangChain
    const result = await llm.invoke(langChainMessages);

    // Extract content from response
    return typeof result.content === "string"
      ? result.content
      : String(result.content);
  } catch (error: any) {
    console.error("Error calling Ollama API:", error);
    if (error.message) {
      return `Error from Ollama service: ${error.message}`;
    } else {
      return "An unknown error occurred while contacting the Ollama service.";
    }
  }
}
