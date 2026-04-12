
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: item, error } = await supabase.from('stock_items').select('*').ilike('name', '%เบียร์สิงห์%').single();
    if (error) {
        console.error("Error finding item:", error);
        return;
    }
    console.log("ITEM FOUND:", JSON.stringify(item, null, 2));

    const { data: transactions, error: err2 } = await supabase
        .from('stock_transactions')
        .select('*')
        .eq('stock_item_id', item.id)
        .order('created_at', { ascending: false })
        .limit(10);
    
    if (err2) {
        console.error("Error finding transactions:", err2);
        return;
    }
    console.log("TRANSACTIONS:", JSON.stringify(transactions, null, 2));
}
run();
