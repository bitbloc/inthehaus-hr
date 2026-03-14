import { GoogleGenerativeAI } from "@google/generative-ai";

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
