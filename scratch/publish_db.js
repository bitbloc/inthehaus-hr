const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function main() {
    console.log("Publishing roster_transactions for May 18th to May 24th, 2026...");
    const { data, error } = await supabase
        .from('roster_transactions')
        .update({ status: 'PUBLISHED' })
        .gte('date', '2026-05-18')
        .lte('date', '2026-05-24')
        .eq('status', 'DRAFT');

    if (error) {
        console.error("Error publishing:", error);
    } else {
        console.log("Successfully published transactions:", data);
        
        // Let's verify by querying again
        const { data: ver } = await supabase
            .from('roster_transactions')
            .select('date, status, employees(nickname)')
            .gte('date', '2026-05-18')
            .lte('date', '2026-05-24');
        console.log("Current statuses in this range:");
        ver.forEach(v => {
            console.log(`Date: ${v.date} | Emp: ${v.employees?.nickname} | Status: ${v.status}`);
        });
    }
}

main();
