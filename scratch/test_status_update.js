const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function main() {
    // Test updating an employee's employment_status to 'Suspended'
    const { data: testEmp } = await supabase.from('employees').select('id, employment_status').limit(1).single();
    if (!testEmp) return;
    
    console.log("Original status:", testEmp.employment_status);
    const originalStatus = testEmp.employment_status;

    const { data, error } = await supabase.from('employees').update({ employment_status: 'Suspended' }).eq('id', testEmp.id).select();
    if (error) {
        console.error("Error setting Suspended:", error);
    } else {
        console.log("Successfully set status to Suspended!");
        // Revert back
        await supabase.from('employees').update({ employment_status: originalStatus }).eq('id', testEmp.id);
        console.log("Reverted status back to:", originalStatus);
    }
}

main();
