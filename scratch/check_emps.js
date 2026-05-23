const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function main() {
    console.log("Fetching all employees...");
    const { data: emps } = await supabase.from('employees').select('id, name, nickname');
    console.log("Employees in database:");
    emps.forEach(e => {
        console.log(`ID: ${e.id} | Name: ${e.name} | Nickname: ${e.nickname}`);
    });

    console.log("\nFetching roster_transactions...");
    const { data: txs } = await supabase.from('roster_transactions').select('*').gte('date', '2026-05-22').lte('date', '2026-05-22');
    txs.forEach(t => {
        const emp = emps.find(e => String(e.id) === String(t.employee_id));
        console.log(`Tx ID: ${t.id} | Date: ${t.date} | EmpID in Tx: ${t.employee_id} | Matched Emp Name: ${emp ? emp.name : 'NOT FOUND'}`);
    });
}

main();
