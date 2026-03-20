const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkConfig() {
    const { data, error } = await supabase.from('payroll_config').select('*');
    if (error) {
        console.error("Error fetching payroll_config:", error);
        return;
    }
    console.log("Config:", data);
}

checkConfig();
