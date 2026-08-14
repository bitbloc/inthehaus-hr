import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Centralized Gemini Model Registry
 */
export const GEMINI_MODELS = {
    FLASH: "gemini-3.7-flash",
    FALLBACKS: [
        "gemini-3.7-flash",
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash"
    ],
    EMBEDDING: "gemini-embedding-2-preview",
    EMBEDDING_FALLBACK: "gemini-embedding-001"
};

let genAIInstance = null;

/**
 * Robust getter for Gemini instance to ensure API Key is loaded
 */
export function getGenAI() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("CRITICAL: GEMINI_API_KEY environment variable is missing.");
        return null;
    }
    if (!genAIInstance) {
        genAIInstance = new GoogleGenerativeAI(apiKey);
    }
    return genAIInstance;
}

/**
 * Direct instance (legacy compatibility)
 */
export const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "dummy-key");

