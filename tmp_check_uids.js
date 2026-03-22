require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkDatabases() {
  console.log("--- EMPLOYEES TABLE (Yuzu Uses This) ---");
  const { data: employees, error: err1 } = await supabase.from('employees').select('id, name, line_user_id, is_active').order('id', { ascending: true }).limit(5);
  if (err1) console.error(err1);
  console.log(employees);

  console.log("\n--- LINE_USERS / CHECK-IN TABLE (Might exist?) ---");
  // Let's list tables in Supabase to see if there's another table for check-in
  
  console.log("\nTrying to fetch an employee who can check in but Yuzu doesn't know:");
  // Let's search by name if possible, or just look at the schema.
}

checkDatabases();
