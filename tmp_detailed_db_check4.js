const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAdd() {
    const { data, error } = await supabase
            .from('employees')
            .select('name, line_user_id, line_bot_id')
            .eq('nickname', 'Add')
            .limit(1);
    
    if (error) console.log("ERROR:", error);
    else console.log(data);
}

checkAdd();
