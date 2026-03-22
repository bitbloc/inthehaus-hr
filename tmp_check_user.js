const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUser() {
    const { data, error } = await supabase
        .from('employees')
        .select('*')
        .or('line_bot_id.eq.U77e56cb573085ba79d37b496c6abdb63,line_user_id.eq.U77e56cb573085ba79d37b496c6abdb63');
    
    console.log("Check user:", JSON.stringify(data, null, 2));
    if (error) console.error(error);
}

checkUser();
