const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkEmployees() {
    const { data: employees, error } = await supabase
        .from('employees')
        .select('*');
    if (error) console.error("Error fetching employees:", error);
    else console.log("Employees:", JSON.stringify(employees, null, 2));
}

checkEmployees();
