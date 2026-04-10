
let supabase = null;

function getSupabase() {
    if (!supabase) {
        const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        
        if (!url || !key) {
            console.error("CRITICAL: Supabase credentials missing (URL or KEY)");
            return null;
        }

        supabase = createClient(url, key, {
            auth: { persistSession: false },
            global: {
                fetch: (...args) => fetch(args[0], { ...args[1], cache: 'no-store' })
            }
        });
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
 * Save AI Learned Fact (Pending Review)
 */
export async function saveLearnedFact(groupId, factData) {
    try {
        const client = getSupabase();
        if (!client) return null;

        const { fact, keywords, category, isProblem } = factData;
        
        const { data, error } = await client
            .from('yuzu_knowledge')
            .insert({
                content: fact,
                metadata: {
                    status: 'pending',
                    source: 'chat_learning',
                    group_id: groupId,
                    keywords: keywords || [],
                    category: category || 'GENERAL',
                    is_problem: isProblem || false,
                    learned_at: new Date().toISOString()
                }
            })
            .select()
            .single();

        if (error) {
            console.error("Error saving learned fact:", error);
            return null;
        }
        return data;
    } catch (err) {
        console.error("Memory Utility Error (save learned fact):", err);
        return null;
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
 * Now resolves LINE UIDs to real names for HR accuracy
 */
export async function getDailyContent(groupId) {
    try {
        const client = getSupabase();
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        // Fetch logs
        const { data: logs, error: logsError } = await client
            .from('yuzu_chat_history')
            .select('user_id, role, content, message_type, created_at')
            .eq('group_id', groupId)
            .gte('created_at', startOfDay.toISOString())
            .order('created_at', { ascending: true });

        if (logsError) throw logsError;
        if (!logs || logs.length === 0) return "";

        // Fetch all employees for mapping (including owners/inactive for history tracking)
        const { data: employees } = await client
            .from('employees')
            .select('line_user_id, line_bot_id, name, nickname');
        
        const nameMap = {};
        if (employees) {
            employees.forEach(emp => {
                if (emp.line_bot_id) nameMap[emp.line_bot_id.toLowerCase()] = emp.nickname || emp.name;
                if (emp.line_user_id) nameMap[emp.line_user_id.toLowerCase()] = emp.nickname || emp.name;
            });
        }
        
        return logs.map(item => {
            const time = new Date(item.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
            let prefix = '🤖: ';
            if (item.message_type === 'image_description') prefix = '[ภาพ]: ';
            else if (item.message_type === 'mood_booster') prefix = '💖 [คำชม]: ';
            else if (item.role === 'user') {
                const name = (item.user_id && nameMap[item.user_id.toLowerCase()]) || '(บุคคลนิรนาม/UID ผิด)';
                prefix = `👤 ${name}: `;
            }
            
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
/**
 * Get employee details by LINE Bot ID (Sync with HR data)
 */
export async function getEmployeeByLineId(lineUserId) {
    if (!lineUserId) return null;
    try {
        const client = getSupabase();
        
        // Match by line_bot_id (Yuzu's UID) or line_user_id as fallback (Case-insensitive)
        const { data, error } = await client
            .from('employees')
            .select('name, nickname, position, employment_status, line_bot_id, line_user_id')
            .or(`line_bot_id.ilike.${lineUserId},line_user_id.ilike.${lineUserId}`)
            .eq('is_active', true)
            .maybeSingle();

        if (error) {
            console.error("Error fetching employee by LINE ID:", error);
            return null;
        }

        return data;
    } catch (err) {
        console.error("Memory Utility Error (fetch employee):", err);
        return null;
    }
}

/**
 * Get all active employees (for mapping UIDs in chat context)
 */
export async function getAllEmployeesData() {
    try {
        const client = getSupabase();
        if (!client) return [];
        const { data, error } = await client
            .from('employees')
            .select('line_user_id, line_bot_id, name, nickname, position, is_active')
            .eq('is_active', true);

        if (error) {
            console.error("Error fetching all employees:", error);
            return [];
        }
        return data || [];
    } catch (err) {
        console.error("Memory Utility Error (fetch all employees):", err);
        return [];
    }
}
/**
 * Get Yuzu System Configuration (Father/Mother UIDs)
 */
export async function getYuzuConfigs() {
    try {
        const client = getSupabase();
        if (!client) throw new Error("No client");

        const { data, error } = await client
            .from('yuzu_config')
            .select('key, value');
        
        const config = {
            father_uid: 'U77e56cb573085ba79d37b496c6abdb63',
            mother_uid: 'U8c53c87647799f798f208250be71ae1b'
        };

        if (error) {
            console.error("Error fetching yuzu_config:", error);
            // Return defaults if error
            return config;
        }

        if (data) {
            data.forEach(item => config[item.key] = item.value);
        }

        // Fetch staff roster to inject into system prompt
        const { data: employees } = await client
            .from('employees')
            .select('name, nickname, position')
            .eq('is_active', true);
        
        if (employees) {
            let rosterStr = "\n[OFFICIAL_STAFF_ROSTER]:\n";
            employees.forEach(emp => {
                const displayName = emp.nickname || emp.name;
                const altName = (emp.nickname && emp.name && emp.nickname !== emp.name) ? ` (${emp.name})` : '';
                rosterStr += `- ${displayName}${altName} | ตำแหน่ง: ${emp.position || 'ทีมงาน'}\n`;
            });
            config.staff_roster = rosterStr;
        }
        
        return config;
    } catch (err) {
        console.error("Memory Utility Error (fetch config):", err);
        return {
            father_uid: 'U77e56cb573085ba79d37b496c6abdb63',
            mother_uid: 'U8c53c87647799f798f208250be71ae1b'
        };
    }
}
/**
 * Check if a user is an Owner/Boss (Robust Dual-UID Check)
 */
export async function checkIsBoss(userId) {
    if (!userId) return false;
    try {
        const configs = await getYuzuConfigs();
        const { father_uid, mother_uid } = configs;
        
        // 1. Check against config UIDs (Direct match from Yuzu Config)
        if (userId === father_uid || userId === mother_uid) return true;
        
        // 2. Check employees table for Owner position (Dual-UID Match)
        const client = getSupabase();
        const { data: emp } = await client
            .from('employees')
            .select('position')
            .or(`line_bot_id.ilike.${userId},line_user_id.ilike.${userId}`)
            .eq('is_active', true)
            .maybeSingle();
        
        if (emp && (emp.position === 'Owner' || emp.position === 'CEO' || emp.position === 'Manager' || emp.position === 'แอดมิน')) {
            return true;
        }
        
        return false;
    } catch (err) {
        console.error("Error in checkIsBoss:", err);
        return false;
    }
}
