const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function findBosses() {
    const { data: owners, error } = await supabase.from('employees').select('name, nickname, position, line_user_id').eq('position', 'Owner');
    if (error) {
        console.error("Error fetching bosses:", error);
        return;
    }
    console.log("Owners:", JSON.stringify(owners, null, 2));

    const { data: all, error: error2 } = await supabase.from('employees').select('name, nickname, position, line_user_id');
    if (owners) {
      console.log("Found", owners.length, "owners");
    }
}

findBosses();
