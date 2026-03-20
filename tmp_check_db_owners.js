const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkOwners() {
    const { data: owners, error } = await supabase.from('employees').select('name, nickname, position, line_user_id').eq('position', 'Owner');
    if (error) {
        console.error("Error fetching Owners:", error);
        return;
    }
    owners.forEach(o => {
      console.log(`Name: ${o.name}, Nickname: ${o.nickname}, UID: ${o.line_user_id}`);
    });
}

checkOwners();
