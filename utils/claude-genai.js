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
import { reportAiUsage } from "./aiUsageReport";

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

// Gemini responseSchema (OpenAPI subset, upper-case types) -> the JSON Schema
// subset Claude structured outputs accept (lower-case types,
// additionalProperties:false on objects, no numeric/length constraints).
export function geminiSchemaToJsonSchema(s) {
    if (!s || typeof s !== "object") return s;
    const type = String(s.type || "").toLowerCase();
    const out = {};
    if (s.description) out.description = s.description;
    if (Array.isArray(s.enum)) out.enum = s.enum;
    if (type === "object") {
        out.type = "object";
        out.properties = Object.fromEntries(
            Object.entries(s.properties || {}).map(([k, v]) => [k, geminiSchemaToJsonSchema(v)]),
        );
        if (Array.isArray(s.required)) out.required = s.required;
        out.additionalProperties = false;
    } else if (type === "array") {
        out.type = "array";
        if (s.items) out.items = geminiSchemaToJsonSchema(s.items);
    } else if (type) {
        out.type = type;
    }
    if (s.nullable && out.type) return { anyOf: [out, { type: "null" }] };
    return out;
}

function schemaOf(generationConfig) {
    const gen = generationConfig || {};
    return gen.responseSchema || gen.response_schema || null;
}

function jsonInstruction(generationConfig) {
    const gen = generationConfig || {};
    if (!/json/i.test(String(gen.responseMimeType || gen.response_mime_type || ""))) return "";
    // With a schema, structured outputs enforce the shape; no prompt text needed.
    if (schemaOf(gen)) return "";
    return "Return only the JSON object: no markdown fences, no text before or after it.";
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

    async _call(contents, generationConfig, extraSystem, toolOpts = null) {
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

        const schema = schemaOf(gen);
        const outputConfig = schema
            ? { output_config: { format: { type: "json_schema", schema: geminiSchemaToJsonSchema(schema) } } }
            : {};

        const params = {
            model: this.model,
            max_tokens: maxTokens,
            ...(system ? { system } : {}),
            messages,
            ...fallbackParams,
        };
        if (toolOpts?.tools?.length) {
            return this._toolLoop(params, toolOpts);
        }
        let response;
        try {
            response = await this.client.beta.messages.create({ ...params, ...outputConfig });
        } catch (err) {
            // Schema rejected: retry once as plain JSON-by-instruction so the feature keeps working.
            if (!schema || !(err instanceof Anthropic.BadRequestError)) throw err;
            console.warn("[Claude] structured output rejected, retrying without schema:", err.message);
            response = await this.client.beta.messages.create({
                ...params,
                system: [params.system, "Return only the JSON object: no markdown fences, no text before or after it."]
                    .filter(Boolean).join("\n\n"),
            });
        }
        if (response.stop_reason === "refusal") {
            throw new Error(`Claude declined (${response.stop_details?.category ?? "unknown"})`);
        }
        const text = (response.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
        if (!text) throw new Error(`Claude returned no text (stop_reason: ${response.stop_reason})`);
        return geminiShapedResult(text, response.model || this.model);
    }

    // Manual tool-use loop: run every tool_use block in the reply, send all
    // results back in one user message, repeat until Claude answers in text.
    // The assistant content is appended unchanged (thinking blocks included).
    async _toolLoop(params, { tools, handlers, maxRounds = 5 }) {
        const messages = [...params.messages];
        for (let round = 0; round < maxRounds; round++) {
            const response = await this.client.beta.messages.create({ ...params, messages, tools });
            if (response.stop_reason === "refusal") {
                throw new Error(`Claude declined (${response.stop_details?.category ?? "unknown"})`);
            }
            const toolUses = (response.content || []).filter((b) => b.type === "tool_use");
            if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
                const text = (response.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
                if (!text) throw new Error(`Claude returned no text (stop_reason: ${response.stop_reason})`);
                return geminiShapedResult(text, response.model || this.model);
            }
            messages.push({ role: "assistant", content: response.content });
            const results = await Promise.all(toolUses.map(async (tu) => {
                const handler = handlers[tu.name];
                try {
                    if (!handler) throw new Error(`unknown tool ${tu.name}`);
                    const out = await handler(tu.input || {});
                    console.log(`[Yuzu tool] ${tu.name}`, JSON.stringify(tu.input));
                    return { type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out).slice(0, 20000) };
                } catch (err) {
                    console.warn(`[Yuzu tool] ${tu.name} failed:`, err?.message);
                    return { type: "tool_result", tool_use_id: tu.id, is_error: true, content: String(err?.message || err) };
                }
            }));
            messages.push({ role: "user", content: results });
        }
        throw new Error("Claude: too many tool rounds");
    }

    async generateContent(input) {
        const req = normaliseRequest(input);
        return this._call(req.contents, req.generationConfig, req.systemInstruction);
    }

    // claudeTools / claudeToolHandlers: Claude-only options (pass them only when claudeEnabled()).
    startChat({ history = [], generationConfig, claudeTools, claudeToolHandlers } = {}) {
        const turns = history.map((h) => ({ role: h.role, blocks: partsToBlocks(h.parts || []) }));
        const toolOpts = claudeTools?.length ? { tools: claudeTools, handlers: claudeToolHandlers || {} } : null;
        return {
            sendMessage: async (message) => {
                const userTurn = { role: "user", blocks: partsToBlocks(message) };
                const result = await this._call([...turns, userTurn], generationConfig, null, toolOpts);
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
        // Every answered call (each tool round included) is billed: report its tokens
        // for the estimated AI bill in Haustable's back office.
        const create = this.client.beta.messages.create.bind(this.client.beta.messages);
        const feature = fast ? "fast" : "main";
        this.client.beta.messages.create = async (params, options) => {
            const response = await create(params, options);
            await reportAiUsage({ feature, model: response?.model || params?.model, usage: response?.usage });
            return response;
        };
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
