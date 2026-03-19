
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkEmployees() {
  const { data, error } = await supabase
    .from('employees')
    .select('name, nickname, position, line_user_id')
    .eq('is_active', true);

  if (error) {
    console.error("Error fetching employees:", error);
  } else {
    console.log("Active Employee UID Mapping:");
    console.log(JSON.stringify(data, null, 2));
  }
}

checkEmployees();
