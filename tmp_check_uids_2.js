require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function listTables() {
  console.log("Fetching checkin related tables...");
  
  // Let's look for tables names that might be related to check-in or users
  const { data: checkinRows } = await supabase.from('check_ins').select('employee_id').limit(5);
  console.log("Check-ins use employee_id:", checkinRows);

  const { data: lineUserRows, error: lineErr } = await supabase.from('line_users').select('*').limit(2);
  if (lineErr) {
    console.log("No line_users table:", lineErr.message);
  } else {
    console.log("line_users found:", lineUserRows);
  }

  // Find all employees to see if there are duplicates
  const { data: employees } = await supabase.from('employees').select('id, name, nickname, line_user_id, is_active').ilike('name', '%BOT%');
  console.log("Any BOT employees?:", employees);

  // Let's find Casper
  const { data: casper } = await supabase.from('employees').select('id, name, nickname, line_user_id, is_active').ilike('name', '%Casper%');
  console.log("Any Casper employees?:", casper);

}

listTables();
