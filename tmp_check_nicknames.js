const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkNicknames() {
    const { data: owners, error } = await supabase.from('employees').select('name, nickname, line_user_id');
    if (error) {
        console.error("Error fetching owners:", error);
        return;
    }
    owners.forEach(o => {
      console.log(`Name: ${o.name}, Nickname: ${o.nickname}, UID: ${o.line_user_id}`);
    });
}

checkNicknames();
