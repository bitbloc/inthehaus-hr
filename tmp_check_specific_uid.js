const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUid() {
    const uid = 'U5982dc3642092f71f02c0a55c2d4a2fd';
    const { data, error } = await supabase.from('employees').select('*').eq('line_user_id', uid);
    if (error) {
        console.error("Error fetching employee:", error);
        return;
    }
    console.log("Found: ", data.length);
    if (data.length > 0) {
        console.log("Data for UID:", JSON.stringify(data[0], null, 2));
    } else {
        console.log("User not found!");
    }
}

checkUid();
