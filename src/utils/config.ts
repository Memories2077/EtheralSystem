// src/utils/config.ts
import dotenv from "dotenv";
dotenv.config();

export const ollamaConfig = {
    baseUrl: process.env.OLLAMA_BASE_URL || "https://ollama.timnguyen.id.vn",
    model: process.env.OLLAMA_MODEL || "qwen2.5:7b",
    temperature: Number(process.env.OLLAMA_TEMPERATURE || 0.5),
    timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS || 60000),
};
