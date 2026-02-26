// src/utils/config.ts
import dotenv from "dotenv";
dotenv.config();

// --- OLD OpenAI Configuration (COMMENTED OUT) ---
// export const openaiConfig = {
//   baseUrl: process.env.OPENAI_BASE_URL || "https://llmapi.iec-uit.com/v1",
//   apiKey: process.env.OPENAI_API_KEY || "",
//   model: process.env.OPENAI_MODEL || "iec-model",
//   temperature: Number(process.env.OPENAI_TEMPERATURE || 0.2),
//   timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS || 300000), // 5 minutes for reasoning models
// };
// // Keep backward compatibility
// export const ollamaConfig = openaiConfig;

// --- NEW Google Gemini Configuration ---
export const geminiConfig = {
  apiKey: process.env.GEMINI_API_KEY || "",
  model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  temperature: Number(process.env.OPENAI_TEMPERATURE || 0.2),
  timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS || 300000),
};

// Keep backward compatibility - point to Gemini now
export const openaiConfig = geminiConfig;
export const ollamaConfig = geminiConfig;
