const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
    const { data, error } = await supabase.from('slip_transactions').insert({
        group_id: 'test_group',
        user_id: 'U5982dc3642092f71f02c0a55c2d4a2fd', // some existing user
        amount: 50.00,
        slip_url: 'https://example.com/slip.jpg'
    });
    if (error) {
        console.error("Test Insert Error:", error);
    } else {
        console.log("Insert success!");
    }
}

testInsert();
