const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDupes() {
    const { data, error } = await supabase
        .from('employees')
        .select('id, name, line_bot_id, is_active')
        .eq('line_bot_id', 'U77e56cb573085ba79d37b496c6abdb63');
    
    fs.writeFileSync('tmp_out_utf8.json', JSON.stringify(data, null, 2), 'utf8');
}

checkDupes();
