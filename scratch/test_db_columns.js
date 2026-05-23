const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkColumns() {
    const { data, error } = await supabase
        .from('employees')
        .select('id, name, duties, strengths, improvements')
        .limit(1);

    if (error) {
        console.error("Columns do not exist or error:", error.message);
        if (error.message.includes('column') || error.message.includes('does not exist')) {
            console.log("CONFIRMED: Columns need to be created.");
        }
    } else {
        console.log("SUCCESS: Columns already exist!", data);
    }
}

checkColumns();
