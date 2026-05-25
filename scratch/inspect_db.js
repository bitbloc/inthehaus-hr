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
    console.log("Fetching a sample leave request...");
    const { data: sampleLeave, error: err1 } = await supabase
        .from('leave_requests')
        .select('*')
        .limit(1);

    if (err1) {
        console.error("Error fetching leave_requests:", err1);
    } else {
        console.log("Leave requests sample row or columns:", sampleLeave);
    }

    console.log("Fetching a sample employee...");
    const { data: sampleEmp, error: err2 } = await supabase
        .from('employees')
        .select('*')
        .limit(1);

    if (err2) {
        console.error("Error fetching employees:", err2);
    } else {
        console.log("Employees sample keys:", sampleEmp ? Object.keys(sampleEmp[0] || {}) : "No employee found");
    }
}

main();
