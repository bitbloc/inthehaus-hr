
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const { data, error } = await supabase.rpc('get_triggers', {});
  if (error) {
    console.error("Failed to fetch triggers using rpc:", error.message);
    // So let's write a query if we can't use rpc
  } else {
    console.log(data);
  }
}
run();
