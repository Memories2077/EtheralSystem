import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from "@google/genai";
import { genaiConfig } from "./config.js"; // Assuming this file exports { apiKey: string, model: string }

export interface GenAIChatMessage {
  role: "user" | "model";
  content: string;
}

export interface GenAICompletionParams {
  messages: GenAIChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

const genAI = new GoogleGenAI({ apiKey: genaiConfig.apiKey });

// --- Original function for single API calls ---
export async function genaiCompletion({
  messages,
}: GenAICompletionParams): Promise<string> {
  try {
    // Now call generateContent on the 'model' instance
    const result = await genAI.models.generateContent({
      model: genaiConfig.model,
      contents: messages.map((m) => ({
        role: m.role,
        parts: [{ text: m.content }],
      })),
    });

    return result.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } catch (error: any) {
    console.error("Error calling GenAI API:", error);
    if (error.message) {
      return `Error from GenAI service: ${error.message}`;
    } else {
      return "An unknown error occurred while contacting the GenAI service.";
    }
  }
}
