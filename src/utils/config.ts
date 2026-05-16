// src/utils/config.ts
import dotenv from "dotenv";
dotenv.config();

const llmTemperature = Number(
  process.env.LLM_TEMPERATURE || process.env.OPENAI_TEMPERATURE || 0.2,
);
const llmTimeoutMs = Number(
  process.env.LLM_TIMEOUT_MS || process.env.OPENAI_TIMEOUT_MS || 300000,
);

// Google Gemini Configuration
export const geminiConfig = {
  apiKey: process.env.GEMINI_API_KEY || "",
  model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  temperature: llmTemperature,
  timeoutMs: llmTimeoutMs,
};

// Groq Configuration
export const groqConfig = {
  apiKey: process.env.GROQ_API_KEY || "",
  model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
  temperature: llmTemperature,
  timeoutMs: llmTimeoutMs,
};

// Keep backward compatibility - point to Gemini now
export const openaiConfig = geminiConfig;
export const ollamaConfig = geminiConfig;

// MetaClaw Proxy Configuration
export const metaclawConfig = {
  baseUrl: process.env.METACLAW_BASE_URL || "http://localhost:30000/v1",
  apiKey: process.env.METACLAW_API_KEY || "metaclaw",
  temperature: llmTemperature,
  timeoutMs: llmTimeoutMs,
  enabled: process.env.METACLAW_ENABLED === "true",
  model: process.env.METACLAW_MODEL || "qwen/qwen3-next-80b-a3b-instruct",
  topP: 0.5,
  maxTokens: 100000,
};

export const FEATURE_FLAGS = {
  DYNAMIC_SKILL_SELECTION: process.env.DYNAMIC_SKILL_SELECTION === "true",
};

export const EXPERIMENT_CONFIG = {
  skillSelectionVariant: (process.env.SKILL_SELECTION_VARIANT || "dynamic") as
    | "control"
    | "dynamic"
    | "hybrid",
  trafficAllocation: {
    control: Number(process.env.SKILL_SELECTION_CONTROL_TRAFFIC || 0.1),
    dynamic: Number(process.env.SKILL_SELECTION_DYNAMIC_TRAFFIC || 0.45),
    hybrid: Number(process.env.SKILL_SELECTION_HYBRID_TRAFFIC || 0.45),
  },
  hybridConfidenceThreshold: Number(
    process.env.SKILL_SELECTION_HYBRID_CONFIDENCE_THRESHOLD || 0.7,
  ),
};
