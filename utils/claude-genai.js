// Claude behind the @google/generative-ai surface Yuzu already uses
// (getGenerativeModel -> generateContent / startChat().sendMessage, result.response.text()).
//
// Why (2026-11-26): Google suspended the Cloud project that owns GEMINI_API_KEY.
// While ANTHROPIC_API_KEY is set, getGenAI() returns this adapter instead of
// Gemini. Set AI_PROVIDER=gemini (or remove ANTHROPIC_API_KEY) to switch back.
//
// Models per job (owner decision 2026-11-26): Claude Opus 5.5 by default
// (chat, briefs, espresso, analysis); Claude Haiku 5.5 for high-volume image
// reading (slips) via getGenAI({ fast: true }).
//
// Not available on Claude: embeddings (RAG falls back to keyword search),
// image generation, audio transcription. Those calls throw a clear error.

import Anthropic from "@anthropic-ai/sdk";

export const CLAUDE_ACCURATE_MODEL = "claude-opus-5-5";
export const CLAUDE_FAST_MODEL = "claude-haiku-5-5";
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export function claudeEnabled() {
    if ((process.env.AI_PROVIDER || "").toLowerCase() === "gemini") return false;
    return Boolean(process.env.ANTHROPIC_API_KEY);
}

function partToBlock(part) {
    if (typeof part === "string") return part ? { type: "text", text: part } : null;
    if (typeof part?.text === "string") return part.text ? { type: "text", text: part.text } : null;
    const inline = part?.inlineData || part?.inline_data;
    if (inline?.data) {
        const mime = String(inline.mimeType || inline.mime_type || "image/jpeg").toLowerCase();
        if (mime === "application/pdf") {
            return { type: "document", source: { type: "base64", media_type: "application/pdf", data: inline.data } };
        }
        if (IMAGE_TYPES.has(mime)) {
            return { type: "image", source: { type: "base64", media_type: mime, data: inline.data } };
        }
        throw new Error(`Claude cannot read ${mime} (audio/video/HEIC are not supported)`);
    }
    return null;
}

function partsToBlocks(parts) {
    const list = Array.isArray(parts) ? parts : [parts];
    return list.map(partToBlock).filter(Boolean);
}

// Gemini input forms: string | Part[] | { contents, generationConfig, systemInstruction }
function normaliseRequest(input) {
    if (input && typeof input === "object" && !Array.isArray(input) && Array.isArray(input.contents)) {
        return {
            contents: input.contents.map((c) => ({ role: c.role, blocks: partsToBlocks(c.parts || []) })),
            generationConfig: input.generationConfig,
            systemInstruction: input.systemInstruction,
        };
    }
    return { contents: [{ role: "user", blocks: partsToBlocks(input) }] };
}

function systemText(systemInstruction) {
    if (!systemInstruction) return "";
    if (typeof systemInstruction === "string") return systemInstruction;
    const parts = systemInstruction.parts || [];
    return parts.map((p) => (typeof p === "string" ? p : p?.text || "")).filter(Boolean).join("\n\n");
}

function jsonInstruction(generationConfig) {
    const gen = generationConfig || {};
    if (!/json/i.test(String(gen.responseMimeType || gen.response_mime_type || ""))) return "";
    const schema = gen.responseSchema || gen.response_schema;
    return "Return only the JSON object: no markdown fences, no text before or after it." +
        (schema ? `\nThe JSON must follow this schema:\n${JSON.stringify(schema)}` : "");
}

function geminiShapedResult(text, model) {
    const response = {
        text: () => text,
        candidates: [{ content: { role: "model", parts: [{ text }] } }],
        modelVersion: model,
    };
    return { response };
}

class ClaudeModel {
    constructor(client, model, params = {}) {
        this.client = client;
        this.model = model;
        this.systemInstruction = params.systemInstruction;
        this.generationConfig = params.generationConfig;
    }

    async _call(contents, generationConfig, extraSystem) {
        const system = [systemText(this.systemInstruction), systemText(extraSystem), jsonInstruction(generationConfig || this.generationConfig)]
            .filter(Boolean)
            .join("\n\n");
        const messages = contents
            .map((c) => ({ role: c.role === "model" ? "assistant" : "user", content: c.blocks }))
            .filter((m) => m.content.length > 0);
        if (messages.length === 0) throw new Error("Claude: empty request");

        const gen = generationConfig || this.generationConfig || {};
        const maxTokens = Math.min(Math.max(Number(gen.maxOutputTokens) || 16000, 1024), 32000);
        // Server-side refusal fallback exists for Opus/Sonnet, not Haiku.
        const fallbackParams = this.model.startsWith("claude-haiku")
            ? {}
            : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };

        const response = await this.client.beta.messages.create({
            model: this.model,
            max_tokens: maxTokens,
            ...(system ? { system } : {}),
            messages,
            ...fallbackParams,
        });
        if (response.stop_reason === "refusal") {
            throw new Error(`Claude declined (${response.stop_details?.category ?? "unknown"})`);
        }
        const text = (response.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
        if (!text) throw new Error(`Claude returned no text (stop_reason: ${response.stop_reason})`);
        return geminiShapedResult(text, response.model || this.model);
    }

    async generateContent(input) {
        const req = normaliseRequest(input);
        return this._call(req.contents, req.generationConfig, req.systemInstruction);
    }

    startChat({ history = [], generationConfig } = {}) {
        const turns = history.map((h) => ({ role: h.role, blocks: partsToBlocks(h.parts || []) }));
        return {
            sendMessage: async (message) => {
                const userTurn = { role: "user", blocks: partsToBlocks(message) };
                const result = await this._call([...turns, userTurn], generationConfig);
                turns.push(userTurn, { role: "model", blocks: [{ type: "text", text: result.response.text() }] });
                return result;
            },
        };
    }

    async embedContent() {
        throw new Error("EMBEDDING_UNAVAILABLE: Claude has no embeddings API (Gemini project suspended)");
    }
}

export class ClaudeGenAI {
    constructor({ fast = false } = {}) {
        this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 90_000, maxRetries: 1 });
        this.model = fast
            ? process.env.CLAUDE_FAST_MODEL || CLAUDE_FAST_MODEL
            : process.env.CLAUDE_MODEL || CLAUDE_ACCURATE_MODEL;
    }

    // The Gemini model name is ignored: the job picks the Claude model (see top).
    getGenerativeModel(params = {}) {
        if (/image|banana/i.test(String(params.model || ""))) {
            return {
                generateContent: async () => {
                    throw new Error("IMAGE_GENERATION_UNAVAILABLE while the Gemini project is suspended");
                },
            };
        }
        return new ClaudeModel(this.client, this.model, params);
    }
}
