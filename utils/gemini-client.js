import { GoogleGenerativeAI } from "@google/generative-ai";
import { ClaudeGenAI, claudeEnabled } from "./claude-genai.js";

/**
 * Centralized Gemini Model Registry
 */
export const GEMINI_MODELS = {
    FLASH: "gemini-4-argon",
    ARGON: "gemini-4-argon",
    FALLBACKS: [
        "gemini-4-argon",
        "gemini-3.7-flash",
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash"
    ],
    EMBEDDING: "gemini-embedding-2-preview",
    EMBEDDING_FALLBACK: "gemini-embedding-001"
};

let genAIInstance = null;
const claudeInstances = {};

/**
 * Robust getter for Gemini instance to ensure API Key is loaded.
 * Gemini project suspended (2026-11-26): returns the Claude adapter while
 * ANTHROPIC_API_KEY is set. { fast: true } picks the high-volume model.
 */
export function getGenAI({ fast = false } = {}) {
    if (claudeEnabled()) {
        const key = fast ? "fast" : "accurate";
        if (!claudeInstances[key]) claudeInstances[key] = new ClaudeGenAI({ fast });
        return claudeInstances[key];
    }
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

