const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function publish() {
    try {
        console.log("Publishing roster transactions for June 15 - June 21, 2026...");
        
        const { data, error } = await supabase
            .from('roster_transactions')
            .update({ status: 'PUBLISHED' })
            .gte('date', '2026-06-15')
            .lte('date', '2026-06-21')
            .eq('status', 'DRAFT');

        if (error) {
            console.error("Publishing error:", error);
        } else {
            console.log("Successfully published transactions!");
        }
    } catch (e) {
        console.error(e);
    }
}

publish();
