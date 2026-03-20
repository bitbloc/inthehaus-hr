const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkEmployees() {
    const { data, error } = await supabase.from('employees').select('id, name, nickname, position, line_user_id');
    if (error) {
        console.error("Error fetching employees:", error);
        return;
    }
    console.log(JSON.stringify(data, null, 2));
}

checkEmployees();
