const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    const { data, error } = await supabase
        .from('employees')
        .select('id, name, nickname, position, duties, strengths, improvements')
        .eq('is_active', true);

    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Employees:", JSON.stringify(data, null, 2));
    }
}

main();
