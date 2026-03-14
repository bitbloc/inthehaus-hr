import { getGenAI } from './gemini-client.js';
import { createClient } from '@supabase/supabase-js';

let supabase = null;

function getSupabase() {
    if (!supabase) {
        supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        );
    }
    return supabase;
}

/**
 * Generate embedding for a text string
 */
export async function getEmbedding(text, taskType = 'RETRIEVAL_QUERY', title = null) {
    try {
        const instance = getGenAI();
        if (!instance) {
             return { error: "GEMINI_API_KEY environment variable is missing" };
        }
        
        const modelName = "text-embedding-004";
        const model = instance.getGenerativeModel({ model: modelName });
        
        let result;
        try {
            // Priority: Optimized call based on latest documentation
            result = await model.embedContent({
                content: { parts: [{ text }] },
                taskType: taskType,
                title: title || undefined,
                outputDimensionality: 768
            });
        } catch (optimizeError) {
            console.warn(`Embedding with ${modelName} failed, trying fallback:`, optimizeError.message);
            
            try {
                // Secondary Fallback: Try a different reliable model
                const fallbackModel = instance.getGenerativeModel({ model: "gemini-embedding-001" });
                result = await fallbackModel.embedContent({
                    content: { parts: [{ text }] },
                    outputDimensionality: 768
                });
            } catch (fallbackError) {
                throw new Error(`All embedding models failed. Last error: ${fallbackError.message}`);
            }
        }

        if (!result || !result.embedding || !result.embedding.values) {
            throw new Error("Gemini returned an empty embedding response");
        }
        
        return { values: result.embedding.values };
    } catch (error) {
        console.error("Full Embedding Error Details:", error);
        return { error: error.message || "Unknown embedding error" };
    }
}

/**
 * Search the knowledge base for relevant chunks
 */
export async function searchKnowledge(query, limit = 3) {
    try {
        // Use RETRIEVAL_QUERY for searching
        const result = await getEmbedding(query, 'RETRIEVAL_QUERY');
        if (result.error || !result.values) return [];

        const client = getSupabase();
        const { data, error } = await client.rpc('match_yuzu_knowledge', {
            query_embedding: result.values,
            match_threshold: 0.5,
            match_count: limit
        });

        if (error) {
            console.error("Knowledge Search Error:", error);
            return [];
        }

        return data;
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
        const { error } = await client
            .from('yuzu_knowledge')
            .insert({
                content,
                metadata,
                embedding: result.values
            });

        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error("Add Knowledge Error:", error);
        return { success: false, error: error.message };
    }
}
