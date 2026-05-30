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
    console.log("1. Testing 'ลางาน' (pending) query with replacement employee join...");
    const { data: pendingLeaves, error: err1 } = await supabase
      .from('leave_requests')
      .select('*, employees!employee_id(name, nickname, position), replacement_employee:employees!replacement_employee_id(name, nickname, position)')
      .eq('status', 'pending')
      .order('leave_date', { ascending: true });

    if (err1) {
        console.error("FAIL: Error fetching pending leaves:", err1);
    } else {
        console.log("SUCCESS: Fetched pending leave requests successfully!");
        console.log(`Number of pending leave requests: ${pendingLeaves.length}`);
    }

    console.log("\n2. Testing 'ลางานล่าสุด' (history) query...");
    const { data: historyLeaves, error: err2 } = await supabase
      .from('leave_requests')
      .select('*, employees!employee_id(name, nickname, position), replacement_employee:employees!replacement_employee_id(name, nickname, position)')
      .order('created_at', { ascending: false })
      .limit(5);

    if (err2) {
        console.error("FAIL: Error fetching history leaves:", err2);
    } else {
        console.log("SUCCESS: Fetched history leave requests successfully!");
        console.log(`Number of history leave requests: ${historyLeaves.length}`);
        if (historyLeaves.length > 0) {
            console.log("Latest history leave:", JSON.stringify(historyLeaves[0], null, 2));
        }
    }
}

main();
