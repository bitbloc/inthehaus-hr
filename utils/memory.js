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
export async function getChatHistory(groupId, limit = 10) {
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
 * Cleanup history older than 2 days
 */
export async function cleanupOldHistory() {
    try {
        const client = getSupabase();
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

        const { error } = await client
            .from('yuzu_chat_history')
            .delete()
            .lt('created_at', twoDaysAgo.toISOString());

        if (error) console.error("Cleanup Error:", error);
    } catch (err) {
        console.error("Memory Utility Error (cleanup):", err);
    }
}

/**
 * Cleanup images older than 15 days from Supabase Storage
 */
export async function cleanupOldImages() {
    try {
        const client = getSupabase();
        const bucketName = 'yuzu-images';
        
        // 1. List files in the bucket
        const { data: files, error: listError } = await client.storage
            .from(bucketName)
            .list();

        if (listError) {
            console.error("Storage List Error:", listError);
            return;
        }

        if (!files || files.length === 0) return;

        // 2. Identify files older than 15 days
        const fifteenDaysAgo = new Date();
        fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

        const filesToDelete = files
            .filter(file => new Date(file.created_at) < fifteenDaysAgo)
            .map(file => file.name);

        if (filesToDelete.length === 0) return;

        // 3. Delete files
        console.log(`Cleanup: Deleting ${filesToDelete.length} old images from ${bucketName}`);
        const { error: deleteError } = await client.storage
            .from(bucketName)
            .remove(filesToDelete);

        if (deleteError) console.error("Storage Delete Error:", deleteError);
    } catch (err) {
        console.error("Memory Utility Error (image cleanup):", err);
    }
}
