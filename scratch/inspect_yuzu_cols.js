const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('yuzu_chat_history').select('*').limit(1);
  if (error) {
    console.error("Error fetching record:", error);
  } else if (data && data.length > 0) {
    console.log("Keys in yuzu_chat_history:", Object.keys(data[0]));
    console.log("Sample record:", data[0]);
  } else {
    console.log("No records found in yuzu_chat_history");
  }
}
run();
