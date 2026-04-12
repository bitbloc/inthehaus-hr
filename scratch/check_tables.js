
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: tables, error } = await supabase.rpc('get_tables'); 
    // If rpc('get_tables') doesn't exist, we can try querying information_schema
    const { data, error: err2 } = await supabase.from('pg_tables').select('tablename').eq('schemaname', 'public');
    // Actually, simple query to information_schema is better if we have permission.
    // However, Supabase RLS usually blocks information_schema for anon keys.
    // Let's try to just fetch from common names.
    const names = ['stock_items', 'items', 'stock_transactions', 'transactions'];
    for (const name of names) {
        try {
            const { data, error } = await supabase.from(name).select('*').limit(1);
            if (!error) console.log(`Table exists: ${name}`);
            else console.log(`Table ${name} error: ${error.message}`);
        } catch (e) {
            console.log(`Table ${name} catch: ${e.message}`);
        }
    }
}
run();
