const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function inspect() {
    try {
        console.log("Supabase URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
        const { data, error } = await supabase
            .from('announcements')
            .select('*')
            .limit(5);

        if (error) {
            console.error("Error fetching announcements:", error);
        } else {
            console.log("Announcements sample data:");
            console.log(JSON.stringify(data, null, 2));
        }
    } catch (err) {
        console.error("Catch error:", err);
    }
}

inspect();
