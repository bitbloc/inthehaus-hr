const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUid() {
    const { count, error } = await supabase.from('employees').select('*', { count: 'exact', head: true });
    if (error) {
        console.error("Error fetching employee:", error);
        return;
    }
    console.log("Total employees:", count);
}

checkUid();
