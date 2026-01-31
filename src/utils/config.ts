// src/utils/config.ts
import dotenv from "dotenv";
dotenv.config();

export const openaiConfig = {
  baseUrl: process.env.OPENAI_BASE_URL || "https://llmapi.iec-uit.com/v1",
  apiKey: process.env.OPENAI_API_KEY || "",
  model: process.env.OPENAI_MODEL || "iec-model",
  temperature: Number(process.env.OPENAI_TEMPERATURE || 0.2),
  timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS || 300000), // 5 minutes for reasoning models
};

// Keep backward compatibility
export const ollamaConfig = openaiConfig;
