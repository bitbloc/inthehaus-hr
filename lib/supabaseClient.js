import { createClient } from '@supabase/supabase-js';

const getEnvCredentials = () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
    return { url, key };
};

// Resilient fetch wrapper with retry and backoff for network/QUIC protocol drops
const fetchWithRetry = async (url, options = {}, retries = 3, backoffMs = 300) => {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            return await fetch(url, { ...options, cache: 'no-store' });
        } catch (err) {
            const isLastAttempt = attempt === retries - 1;
            if (isLastAttempt) {
                console.error(`[Supabase Fetch Failed after ${retries} attempts]:`, err);
                throw err;
            }
            // Wait with exponential backoff before retrying
            await new Promise((resolve) => setTimeout(resolve, backoffMs * Math.pow(2, attempt)));
        }
    }
};

let clientInstance = null;

export function getSupabase() {
    if (!clientInstance) {
        const { url, key } = getEnvCredentials();
        if (!url || !key) {
            console.warn("WARNING: Supabase URL or Key is missing from environment variables.");
        }
        clientInstance = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder-key', {
            auth: { persistSession: false },
            global: {
                fetch: (url, options) => fetchWithRetry(url, options)
            }
        });
    }
    return clientInstance;
}

// Export default singleton instance for backwards-compatibility
export const supabase = getSupabase();
