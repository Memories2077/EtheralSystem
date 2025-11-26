// src/utils/config.ts
import dotenv from "dotenv";
dotenv.config();

export const genaiConfig = {
    apiKey: process.env.GOOGLE_GENAI_API_KEY,
    model: process.env.GOOGLE_GENAI_MODEL || "models/gemini-2.0-flash",
    timeoutMs: Number(process.env.GOOGLE_GENAI_TIMEOUT_MS || 60000),
};
