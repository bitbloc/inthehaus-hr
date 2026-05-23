const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function main() {
    console.log("Querying roster_transactions for May 2026...");
    const { data, error } = await supabase
        .from('roster_transactions')
        .select(`
            id,
            employee_id,
            date,
            slot_type,
            shift_id,
            custom_start_time,
            custom_end_time,
            is_off,
            status,
            employees(name, nickname)
        `)
        .gte('date', '2026-05-20')
        .lte('date', '2026-05-25')
        .order('date');

    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Roster transactions length:", data.length);
        data.forEach(d => {
            console.log(`Date: ${d.date} | Emp: ${d.employees?.nickname || d.employees?.name} | Shift: ${d.shift_id} | Off: ${d.is_off} | Status: ${d.status} | Custom: ${d.custom_start_time}-${d.custom_end_time}`);
        });
    }
}

main();
