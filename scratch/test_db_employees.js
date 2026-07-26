const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function main() {
    const { data: emps, error } = await supabase.from('employees').select('*');
    if (error) {
        console.error("Error fetching employees:", error);
        return;
    }
    console.log("Total employees:", emps.length);
    emps.forEach(e => {
        console.log(`ID: ${e.id} | Name: ${e.name} (${e.nickname}) | status: ${e.employment_status} | active: ${e.is_active}`);
    });
}

main();
