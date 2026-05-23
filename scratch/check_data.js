const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://qmdhbnjjwogtnntjgrle.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtZGhibmpqd29ndG5udGpncmxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwNTQ4MzgsImV4cCI6MjA3OTYzMDgzOH0.BoXp_cwLU4k8KY_KaZi4oyAsebWJjD7A7sAe1nLlJBg';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    try {
        console.log("=== CHECKING EMPLOYEE SCHEDULES ===");
        const { data: scheds, error } = await supabase.from('employee_schedules').select('*, shifts(*)');
        if (error) console.error(error);
        else console.log(`Found ${scheds.length} schedules:`, scheds);
    } catch (e) {
        console.error(e);
    }
}

check();
