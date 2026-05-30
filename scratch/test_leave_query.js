require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase URL or Anon Key");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("Testing leave requests query with employees explicit join...");
    const { data: leaves, error } = await supabase
        .from('leave_requests')
        .select('*, employees!employee_id(name, position)')
        .eq('status', 'pending')
        .order('leave_date', { ascending: true });

    if (error) {
        console.error("FAIL: Error fetching leave requests:", error);
    } else {
        console.log("SUCCESS: Fetched pending leave requests successfully!");
        console.log(`Number of pending leave requests: ${leaves.length}`);
        if (leaves.length > 0) {
            console.log("First pending leave request:", JSON.stringify(leaves[0], null, 2));
        }
    }
}

main();
