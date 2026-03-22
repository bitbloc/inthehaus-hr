const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUid() {
    const uid = 'U5982dc3642092f71f02c0a55c2d4a2fd';
    const { data, error } = await supabase.from('employees').select('name, nickname, line_user_id, is_active, employment_status').eq('line_user_id', uid);
    if (error) {
        console.error("Error fetching employee:", error);
        return;
    }
    fs.writeFileSync('output.json', JSON.stringify(data, null, 2), 'utf8');
    console.log("Done");
}

checkUid();
