const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkPhotos() {
    const { data, error } = await supabase
        .from('employees')
        .select('id, name, nickname, photo_url');

    if (error) {
        console.error("Error fetching employees:", error.message);
    } else {
        console.log("Employees photo URLs:", data);
    }
}

checkPhotos();
