require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("Fetching yuzu_config...");
    const { data, error } = await supabase.from('yuzu_config').select('*');
    if (error) {
        console.error("Error fetching config:", error);
    } else {
        console.log("Yuzu Config Rows:");
        console.log(JSON.stringify(data, null, 2));
    }
}
main();
