import { getGenAI, GEMINI_MODELS } from './gemini-client.js';
import { getSupabase } from '../lib/supabaseClient.js';

let PDFParse = null;

// In-memory cache for query embeddings (Phase 3 Performance)
const queryEmbeddingCache = new Map();
const EMBED_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Generate embedding for a text string (cached for RETRIEVAL_QUERY)
 */
export async function getEmbedding(text, taskType = 'RETRIEVAL_QUERY', title = null) {
    if (!text || typeof text !== 'string') return { error: "Invalid text input" };
    const cleanText = text.trim();

    // Cache hit check for queries
    if (taskType === 'RETRIEVAL_QUERY' && !title) {
        const cacheKey = cleanText.toLowerCase();
        const cached = queryEmbeddingCache.get(cacheKey);
        if (cached && Date.now() < cached.expiry) {
            return { values: cached.values };
        }
    }

    try {
        const instance = getGenAI();
        if (!instance) {
             return { error: "GEMINI_API_KEY environment variable is missing" };
        }
        
        const modelName = GEMINI_MODELS.EMBEDDING || "gemini-embedding-2-preview";
        const model = instance.getGenerativeModel({ model: modelName });
        
        let result;
        try {
            // Priority: Optimized call based on latest documentation
            result = await model.embedContent({
                content: { parts: [{ text: cleanText }] },
                taskType: taskType,
                title: title || undefined,
                outputDimensionality: 768
            });
        } catch (optimizeError) {
            console.warn(`Embedding with ${modelName} failed, trying fallback:`, optimizeError.message);
            
            try {
                // Secondary Fallback: Try a different reliable model
                const fallbackModel = instance.getGenerativeModel({ model: GEMINI_MODELS.EMBEDDING_FALLBACK || "gemini-embedding-001" });
                result = await fallbackModel.embedContent({
                    content: { parts: [{ text: cleanText }] },
                    outputDimensionality: 768
                });
            } catch (fallbackError) {
                throw new Error(`All embedding models failed. Last error: ${fallbackError.message}`);
            }
        }

        if (!result || !result.embedding || !result.embedding.values) {
            throw new Error("Gemini returned an empty embedding response");
        }
        
        const values = result.embedding.values;
        if (taskType === 'RETRIEVAL_QUERY' && !title) {
            queryEmbeddingCache.set(cleanText.toLowerCase(), {
                values,
                expiry: Date.now() + EMBED_CACHE_TTL_MS
            });
        }
        return { values };
    } catch (error) {
        console.error("Full Embedding Error Details:", error);
        return { error: error.message || "Unknown embedding error" };
    }
}

/**
 * Search the knowledge base for relevant chunks (pgvector RPC with keyword fallback)
 */
export async function searchKnowledge(query, limit = 3) {
    if (!query || typeof query !== 'string') return [];
    const cleanQuery = query.trim();

    try {
        const client = getSupabase();
        if (!client) return [];

        // 1. Generate query embedding
        const result = await getEmbedding(cleanQuery, 'RETRIEVAL_QUERY');
        let vectorResults = [];

        if (result && result.values && !result.error) {
            const { data, error } = await client.rpc('match_yuzu_knowledge', {
                query_embedding: result.values,
                match_threshold: 0.5,
                match_count: limit
            });

            if (!error && Array.isArray(data) && data.length > 0) {
                vectorResults = data;
            } else if (error) {
                console.warn("Knowledge Vector Search RPC Error (falling back to text match):", error.message);
            }
        }

        if (vectorResults.length > 0) {
            return vectorResults;
        }

        // 2. Resilient Keyword Fallback: Search content directly if RPC not ready or no match
        const searchTerms = cleanQuery.split(/\s+/).filter(t => t.length > 1).slice(0, 3);
        if (searchTerms.length > 0) {
            let dbQuery = client
                .from('yuzu_knowledge')
                .select('id, content, metadata')
                .limit(limit);

            const filterPattern = searchTerms.map(t => `content.ilike.%${t}%`).join(',');
            const { data: textMatches } = await dbQuery.or(filterPattern);

            if (textMatches && textMatches.length > 0) {
                return textMatches;
            }
        }

        return [];
    } catch (error) {
        console.error("RAG Utility Error:", error);
        return [];
    }
}

/**
 * Add or update a knowledge entry
 */
export async function addKnowledge(content, metadata = {}) {
    try {
        // Use RETRIEVAL_DOCUMENT for storing knowledge
        // If metadata has a title, use it to improve embedding quality
        const title = metadata.title || null;
        const result = await getEmbedding(content, 'RETRIEVAL_DOCUMENT', title);
        
        if (result.error || !result.values) {
            throw new Error(result.error || "Could not generate embedding");
        }

        const client = getSupabase();
        const { data, error } = await client
            .from('yuzu_knowledge')
            .insert({
                content,
                metadata,
                embedding: result.values
            })
            .select();

        if (error) throw error;
        return { success: true, data: data[0] };
    } catch (error) {
        console.error("Add Knowledge Error:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Update a knowledge entry
 */
export async function updateKnowledge(id, content, metadata = {}) {
    try {
        const client = getSupabase();
        const updateData = { metadata };
        
        // If content is provided, regenerate embedding
        if (content) {
            updateData.content = content;
            const result = await getEmbedding(content, 'RETRIEVAL_DOCUMENT', metadata.title || null);
            if (result.error || !result.values) {
                throw new Error(result.error || "Could not generate embedding for updated content");
            }
            updateData.embedding = result.values;
        }

        const { error } = await client
            .from('yuzu_knowledge')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error("Update Knowledge Error:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Extract text from PDF buffer
 */
export async function extractTextFromPDF(buffer) {
    try {
        if (!PDFParse) {
            console.log("Attempting to load pdf-parse dynamically...");
            try {
                const pdfModule = await import('pdf-parse');
                PDFParse = pdfModule.PDFParse;
                console.log("PDFParse library loaded successfully");
            } catch (importError) {
                console.error("Failed to load pdf-parse library:", importError.message);
                throw new Error("PDF support is currently unavailable: " + importError.message);
            }
        }
        
        if (!PDFParse) {
            throw new Error("PDFParse library could not be initialized");
        }

        const parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        await parser.destroy();
        return result.text;
    } catch (error) {
        console.error("PDF Extraction Error:", error);
        throw new Error("Failed to extract text from PDF: " + error.message);
    }
}
