const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAll() {
    const { data, error } = await supabase
            .from('employees')
            .select('line_user_id, line_bot_id, name, nickname, position, is_active')
            .eq('is_active', true);
    
    if (error) console.log("ERROR:", error);
    else fs.writeFileSync('tmp_emps.json', JSON.stringify(data, null, 2));
    console.log("Done");
}

checkAll();
