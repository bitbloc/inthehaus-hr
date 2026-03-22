const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
    const { data, error } = await supabase.from('slip_transactions').insert({
        group_id: 'test_group',
        user_id: 'random_nonexistent_user',
        amount: 228.00,
        slip_url: 'https://example.com/slip.jpg'
    });
    
    if (error) {
        console.error("Insert Error with nonexistent user:", error);
    } else {
        console.log("Insert success with nonexistent user!");
    }

    const { data: d2, error: e2 } = await supabase.from('slip_transactions').insert({
        group_id: 'test_group',
        user_id: 'Ua3eb90a094053f1802f8968ace5d25b8', // known line_user_id
        amount: 228.00,
        slip_url: 'https://example.com/slip.jpg'
    });

    if (e2) {
        console.error("Insert Error with valid user:", e2);
    } else {
        console.log("Insert success with valid user!");
    }
}

testInsert();
