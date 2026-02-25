// --- OLD OpenAI/LangChain imports (COMMENTED OUT) ---
// import { ChatOpenAI } from "@langchain/openai";
// import {
//   HumanMessage,
//   SystemMessage,
//   AIMessage,
// } from "@langchain/core/messages";

// --- NEW Google Gemini imports ---
import { GoogleGenerativeAI, Content, Part } from "@google/generative-ai";
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

// --- NEW Google Gemini client ---
const genAI = new GoogleGenerativeAI(geminiConfig.apiKey);

// Convert GenAIChatMessage to Google Gemini format
function convertToGeminiMessages(messages: GenAIChatMessage[]): Content[] {
  const contents: Content[] = [];
  let systemInstruction = "";

  for (const msg of messages) {
    if (msg.role === "system") {
      // Gemini handles system messages differently - we'll prepend to first user message
      systemInstruction += msg.content + "\n\n";
    } else {
      const role =
        msg.role === "assistant" || msg.role === "model" ? "model" : "user";
      const parts: Part[] = [{ text: msg.content }];

      // If we have a system instruction and this is the first user message, prepend it
      if (systemInstruction && role === "user" && contents.length === 0) {
        parts[0] = { text: systemInstruction + msg.content };
        systemInstruction = "";
      }

      contents.push({ role, parts });
    }
  }

  return contents;
}

// --- OLD LangChain message converter (COMMENTED OUT) ---
// function convertToLangChainMessages(messages: GenAIChatMessage[]) {
//   return messages.map((m) => {
//     if (m.role === "system") {
//       return new SystemMessage(m.content);
//     } else if (m.role === "assistant" || m.role === "model") {
//       return new AIMessage(m.content);
//     } else {
//       return new HumanMessage(m.content);
//     }
//   });
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
      `🤖 Sending request to Gemini: ${formatTokenCount(totalTokens)}`,
    );

    // Convert messages to Google Gemini format
    const geminiContents = convertToGeminiMessages(messages);

    // Initialize Gemini model with configuration
    const model = genAI.getGenerativeModel({
      model: geminiConfig.model,
      generationConfig: {
        temperature: temperature ?? geminiConfig.temperature,
        maxOutputTokens: maxTokens,
      },
    });

    // Call Google Gemini API
    const chat = model.startChat({
      history: geminiContents.slice(0, -1), // All messages except the last
    });

    const lastMessage = geminiContents[geminiContents.length - 1];
    const geminiResult = await chat.sendMessage(
      lastMessage.parts.map((p) => (p as any).text).join(""),
    );
    const response = await geminiResult.response;

    // --- OLD LangChain OpenAI code (COMMENTED OUT) ---
    // const langchainMessages = convertToLangChainMessages(messages);
    // const llm =
    //   temperature !== undefined || maxTokens !== undefined
    //     ? new ChatOpenAI({
    //         configuration: {
    //           baseURL: openaiConfig.baseUrl,
    //         },
    //         apiKey: openaiConfig.apiKey,
    //         model: openaiConfig.model,
    //         temperature: temperature ?? openaiConfig.temperature,
    //         maxTokens: maxTokens,
    //         timeout: openaiConfig.timeoutMs,
    //         maxRetries: 2,
    //       })
    //     : client;
    // const response = await llm.invoke(langchainMessages);

    // Extract content from Gemini response
    const text = response.text();

    // Debug: Log response structure in development mode
    if (process.env.DEBUG_GENAI === "true") {
      console.log("🔍 Gemini response structure:", {
        hasText: !!text,
        textLength: text?.length,
        candidatesCount: response.candidates?.length,
      });
    }

    // --- OLD LangChain/OpenAI response handling (COMMENTED OUT) ---
    // if (process.env.DEBUG_GENAI === "true") {
    //   console.log("🔍 Raw response structure:", {
    //     hasContent: !!response.content,
    //     contentType: typeof response.content,
    //     hasChoices: !!(response as any).choices,
    //     responseKeys: Object.keys(response),
    //   });
    // }
    // let result: string;
    // if (typeof response.content === "string") {
    //   result = response.content;
    // } else if (response.content && typeof response.content === "object") {
    //   result = JSON.stringify(response.content);
    // } else {
    //   const rawResponse = response as unknown as OpenAIResponse;
    //   if (rawResponse.choices?.[0]?.message) {
    //     const message = rawResponse.choices[0].message;
    //     if (message.reasoning_content && !message.content) {
    //       console.log("🧠 Using reasoning_content as main response");
    //       result = message.reasoning_content;
    //     } else if (message.content) {
    //       result = message.content;
    //       if (message.reasoning_content) {
    //         console.log("🧠 Model used reasoning capabilities");
    //         if (process.env.DEBUG_GENAI === "true") {
    //           const reasoningLength = message.reasoning_content.length;
    //           console.log(`🧠 Reasoning length: ${reasoningLength} characters`);
    //         }
    //       }
    //     } else if (message.reasoning_content) {
    //       result = message.reasoning_content;
    //     } else {
    //       console.warn("⚠️ No content or reasoning_content in message");
    //       result = JSON.stringify(message);
    //     }
    //   } else {
    //     console.warn("⚠️ Unexpected response format, using fallback stringify");
    //     result = JSON.stringify(response);
    //   }
    // }

    // Trim leading/trailing whitespace from result
    const result = text.trim();

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
