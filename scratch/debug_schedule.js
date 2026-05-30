const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Supabase URL:", supabaseUrl);
  // Get all employees
  const { data: employees, error: empErr } = await supabase
    .from('employees')
    .select('id, name, nickname, line_user_id, is_active');
  if (empErr) {
    console.error("Employees error:", empErr);
    return;
  }
  console.log("--- Employees ---");
  console.log(employees);

  // Get shifts
  const { data: shifts } = await supabase.from('shifts').select('*');
  console.log("--- Shifts ---");
  console.log(shifts);

  // Week boundary
  const monStr = '2026-05-25';
  const sunStr = '2026-05-31';

  for (const emp of employees) {
    console.log(`\n================= Employee: ${emp.nickname} (${emp.id}) =================`);
    
    // Roster transactions
    const { data: txs } = await supabase
      .from('roster_transactions')
      .select('date, shift_id, is_off, custom_start_time, custom_end_time, status')
      .eq('employee_id', emp.id)
      .gte('date', monStr)
      .lte('date', sunStr);
    console.log("Roster Transactions (May 25 - May 31):", txs);

    // Roster overrides
    const { data: overrides } = await supabase
      .from('roster_overrides')
      .select('date, shift_id, is_off, custom_start_time, custom_end_time')
      .eq('employee_id', emp.id)
      .gte('date', monStr)
      .lte('date', sunStr);
    console.log("Roster Overrides (May 25 - May 31):", overrides);

    // Employee schedules
    const { data: templates } = await supabase
      .from('employee_schedules')
      .select('day_of_week, is_off, shift_id')
      .eq('employee_id', emp.id);
    console.log("Employee Templates (Day 0-6):", templates);
  }
}

run();
