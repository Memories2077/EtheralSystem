// --- OLD OpenAI imports (COMMENTED OUT) ---
// import { ChatOpenAI } from "@langchain/openai";

// --- OLD Google SDK imports (COMMENTED OUT) ---
// import { GoogleGenerativeAI, Content, Part } from "@google/generative-ai";

// --- NEW LangChain Google Generative AI imports ---
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import {
  HumanMessage,
  SystemMessage,
  AIMessage,
} from "@langchain/core/messages";
import { geminiConfig } from "./config.js";
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

// --- OLD LangChain OpenAI client (COMMENTED OUT) ---
// const client = new ChatOpenAI({
//   configuration: {
//     baseURL: openaiConfig.baseUrl,
//   },
//   apiKey: openaiConfig.apiKey,
//   model: openaiConfig.model,
//   temperature: openaiConfig.temperature,
//   timeout: openaiConfig.timeoutMs,
//   maxRetries: 2,
// });

// --- OLD Google SDK client (COMMENTED OUT) ---
// const genAI = new GoogleGenerativeAI(geminiConfig.apiKey);

// --- NEW LangChain Google Generative AI client ---
const client = new ChatGoogleGenerativeAI({
  apiKey: geminiConfig.apiKey,
  model: geminiConfig.model,
  temperature: geminiConfig.temperature,
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

// --- OLD Google SDK message converter (COMMENTED OUT) ---
// function convertToGeminiMessages(messages: GenAIChatMessage[]): Content[] {
//   const contents: Content[] = [];
//   let systemInstruction = "";
//
//   for (const msg of messages) {
//     if (msg.role === "system") {
//       systemInstruction += msg.content + "\n\n";
//     } else {
//       const role =
//         msg.role === "assistant" || msg.role === "model" ? "model" : "user";
//       const parts: Part[] = [{ text: msg.content }];
//
//       if (systemInstruction && role === "user" && contents.length === 0) {
//         parts[0] = { text: systemInstruction + msg.content };
//         systemInstruction = "";
//       }
//
//       contents.push({ role, parts });
//     }
//   }
//
//   return contents;
// }

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
    console.log(
      `🤖 Sending request to Gemini (LangChain): ${formatTokenCount(totalTokens)}`,
    );

    // Convert messages to LangChain format
    const langchainMessages = convertToLangChainMessages(messages);

    // Create a new client instance with custom parameters if needed
    const llm =
      temperature !== undefined || maxTokens !== undefined
        ? new ChatGoogleGenerativeAI({
            apiKey: geminiConfig.apiKey,
            model: geminiConfig.model,
            temperature: temperature ?? geminiConfig.temperature,
            maxOutputTokens: maxTokens,
            maxRetries: 2,
          })
        : client;

    // Call LangChain Google Generative AI API
    const response = await llm.invoke(langchainMessages, {
      timeout: geminiConfig.timeoutMs,
    });

    // --- OLD Google SDK code (COMMENTED OUT) ---
    // const geminiContents = convertToGeminiMessages(messages);
    // const model = genAI.getGenerativeModel({
    //   model: geminiConfig.model,
    //   generationConfig: {
    //     temperature: temperature ?? geminiConfig.temperature,
    //     maxOutputTokens: maxTokens,
    //   },
    // });
    // const chat = model.startChat({
    //   history: geminiContents.slice(0, -1),
    // });
    // const lastMessage = geminiContents[geminiContents.length - 1];
    // const geminiResult = await chat.sendMessage(
    //   lastMessage.parts.map((p) => (p as any).text).join(""),
    // );
    // const response = await geminiResult.response;
    // const text = response.text();

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
  } catch (error: any) {
    console.error("Error calling Gemini API:", error);
    if (error.message) {
      return `Error from Gemini service: ${error.message}`;
    } else {
      return "An unknown error occurred while contacting the Gemini service.";
    }
  }
}
