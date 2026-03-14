import { getGenAI } from './gemini.js';
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
             console.error("Cannot get Gemini Instance (check API Key)");
             return null;
        }
        
        const model = instance.getGenerativeModel({ model: "text-embedding-004" });
        
        // Optimized call based on latest documentation
        const result = await model.embedContent({
            content: { parts: [{ text }] },
            taskType: taskType,
            title: title || undefined,
            outputDimensionality: 768
        });
        
        return result.embedding.values;
    } catch (error) {
        console.error("Full Embedding Error Details:", error);
        return null;
    }
}

/**
 * Search the knowledge base for relevant chunks
 */
export async function searchKnowledge(query, limit = 3) {
    try {
        // Use RETRIEVAL_QUERY for searching
        const embedding = await getEmbedding(query, 'RETRIEVAL_QUERY');
        if (!embedding) return [];

        const client = getSupabase();
        const { data, error } = await client.rpc('match_yuzu_knowledge', {
            query_embedding: embedding,
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
        const embedding = await getEmbedding(content, 'RETRIEVAL_DOCUMENT', title);
        
        if (!embedding) throw new Error("Could not generate embedding");

        const client = getSupabase();
        const { error } = await client
            .from('yuzu_knowledge')
            .insert({
                content,
                metadata,
                embedding
            });

        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error("Add Knowledge Error:", error);
        return { success: false, error: error.message };
    }
}
