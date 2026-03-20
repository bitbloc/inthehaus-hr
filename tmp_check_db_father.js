const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkFather() {
    const { data, error } = await supabase.from('employees').select('name, nickname, position, line_user_id').eq('line_user_id', 'U77e56cb573085ba79d37b496c6abdb63').maybeSingle();
    if (error) {
        console.error("Error fetching Father:", error);
        return;
    }
    console.log("Father:", data);
}

checkFather();
