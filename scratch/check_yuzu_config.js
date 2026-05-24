const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    const { data, error } = await supabase
        .from('yuzu_config')
        .select('*');

    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Yuzu Config:", JSON.stringify(data, null, 2));
    }
}

main();
