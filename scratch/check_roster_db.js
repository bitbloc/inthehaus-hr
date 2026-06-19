const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function check() {
    try {
        console.log("Checking database roster records...");
        
        // 1. Check roster transactions for June 15 to June 21, 2026
        const { data: txs, error: txErr } = await supabase
            .from('roster_transactions')
            .select('*, employees(id, nickname, name), shifts(name, start_time, end_time)')
            .gte('date', '2026-06-15')
            .lte('date', '2026-06-21')
            .order('date');
            
        if (txErr) {
            console.error("Tx error:", txErr);
        } else {
            console.log("\n--- Roster Transactions (June 15 - June 21, 2026) ---");
            console.log(txs.map(t => ({
                date: t.date,
                employee: t.employees?.nickname || t.employees?.name,
                shift: t.shifts?.name || 'Custom',
                is_off: t.is_off,
                status: t.status,
                start_time: t.custom_start_time || t.shifts?.start_time,
                end_time: t.custom_end_time || t.shifts?.end_time
            })));
        }

        // 2. Check employee schedules (templates)
        const { data: scheds, error: schedErr } = await supabase
            .from('employee_schedules')
            .select('*, employees(id, nickname, name), shifts(name, start_time, end_time)');
            
        if (schedErr) {
            console.error("Sched error:", schedErr);
        } else {
            console.log("\n--- Employee Schedules Templates (Active) ---");
            console.log(scheds.map(s => ({
                employee: s.employees?.nickname || s.employees?.name,
                day_of_week: s.day_of_week, // 0-6 (0=Mon or Sun depending on how mapped, let's see)
                is_off: s.is_off,
                shift: s.shifts?.name
            })).slice(0, 20));
        }

    } catch (e) {
        console.error(e);
    }
}

check();
