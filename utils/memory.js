
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
 * Save a message to the chat history
 */
export async function saveMessage(groupId, userId, role, content, messageType = 'text') {
    try {
        const client = getSupabase();
        const { error } = await client
            .from('yuzu_chat_history')
            .insert({
                group_id: groupId,
                user_id: userId,
                role: role,
                content: content,
                message_type: messageType
            });
        
        if (error) console.error("Error saving chat history:", error);
    } catch (err) {
        console.error("Memory Utility Error (save):", err);
    }
}

/**
 * Retrieve the last N messages for a group (Standard Chat)
 */
export async function getChatHistory(groupId, limit = 100) {
    try {
        const client = getSupabase();
        const { data, error } = await client
            .from('yuzu_chat_history')
            .select('role, content')
            .eq('group_id', groupId)
            .eq('message_type', 'text') // Only get text for conversational memory
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error("Error fetching chat history:", error);
            return [];
        }

        return data.reverse().map(msg => ({
            role: msg.role === 'assistant' ? 'model' : (msg.role === 'model' ? 'model' : 'user'),
            parts: [{ text: msg.content }]
        }));
    } catch (err) {
        console.error("Memory Utility Error (fetch):", err);
        return [];
    }
}

/**
 * Get all content for a specific group for today (for Summarization)
 */
export async function getDailyContent(groupId) {
    try {
        const client = getSupabase();
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const { data, error } = await client
            .from('yuzu_chat_history')
            .select('role, content, message_type, created_at')
            .eq('group_id', groupId)
            .gte('created_at', startOfDay.toISOString())
            .order('created_at', { ascending: true });

        if (error) throw error;
        
        return data.map(item => {
            const time = new Date(item.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
            let prefix = '🤖: ';
            if (item.message_type === 'image_description') prefix = '[ภาพ]: ';
            else if (item.message_type === 'mood_booster') prefix = '💖 [คำชม]: ';
            else if (item.role === 'user') prefix = '👤: ';
            
            return `${time} ${prefix}${item.content}`;
        }).join('\n');
    } catch (err) {
        console.error("Memory Utility Error (daily content):", err);
        return "";
    }
}

/**
 * Cleanup history older than 365 days (1 year)
 * Also prevents table overflow by keeping a reasonable limit
 */
export async function cleanupOldHistory() {
    try {
        const client = getSupabase();
        
        // 1. Delete records older than 1 year
        const oneYearAgo = new Date();
        oneYearAgo.setDate(oneYearAgo.getDate() - 365);

        const { error: dateError } = await client
            .from('yuzu_chat_history')
            .delete()
            .lt('created_at', oneYearAgo.toISOString());

        if (dateError) console.error("Cleanup Date Error:", dateError);

        // 2. Safety Valve: If total rows exceed 50,000, delete oldest 1,000
        const { count, error: countError } = await client
            .from('yuzu_chat_history')
            .select('*', { count: 'exact', head: true });
        
        if (!countError && count > 50000) {
            console.log(`Memory Limit Reached (${count}). Cleaning up oldest entries.`);
            // Get the ID of the 1000th oldest record
            const { data: oldest } = await client
                .from('yuzu_chat_history')
                .select('id')
                .order('created_at', { ascending: true })
                .limit(1000);
            
            if (oldest && oldest.length > 0) {
                const lastId = oldest[oldest.length - 1].id;
                await client
                    .from('yuzu_chat_history')
                    .delete()
                    .lte('id', lastId);
            }
        }
    } catch (err) {
        console.error("Memory Utility Error (cleanup):", err);
    }
}

/**
 * Get chat history for a specific employee (for performance evaluation)
 * Returns the last 100 messages from this user within specified days
 */
export async function getEmployeeHistory(userId, days = 30) {
    try {
        const client = getSupabase();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const { data, error } = await client
            .from('yuzu_chat_history')
            .select('content, created_at')
            .eq('user_id', userId)
            .eq('role', 'user')
            .gte('created_at', startDate.toISOString())
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;
        
        return data.reverse().map(item => {
            const date = new Date(item.created_at).toLocaleDateString('th-TH');
            const time = new Date(item.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
            return `[${date} ${time}]: ${item.content}`;
        }).join('\n');
    } catch (err) {
        console.error("Memory Utility Error (employee history):", err);
        return "";
    }
}
