import { createClient } from '@supabase/supabase-js';

const getEnvCredentials = () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
    return { url, key };
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
                fetch: (...args) => fetch(args[0], { ...args[1], cache: 'no-store' })
            }
        });
    }
    return clientInstance;
}

// Export default singleton instance for backwards-compatibility
export const supabase = getSupabase();