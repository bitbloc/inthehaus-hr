const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  // Query pg_tables to get all tables in public schema
  const { data, error } = await supabase.from('pg_tables').select('tablename').eq('schemaname', 'public');
  if (error) {
    // Fallback: try checking if a custom function or query works, or query information_schema.tables if allowed
    const { data: data2, error: error2 } = await supabase.rpc('get_tables');
    if (error2) {
      console.log("pg_tables error:", error.message);
      console.log("rpc get_tables error:", error2.message);
      // Let's try raw SQL or common table checks
      const commonTables = [
        'employees', 'leave_requests', 'attendance_logs', 'roster_transactions', 
        'employee_schedules', 'shifts', 'yuzu_chat_history', 'yuzu_config', 
        'yuzu_knowledge', 'slip_transactions', 'phone_orders', 'table_reservations',
        'espresso_logs', 'espresso_reports', 'espresso_shots', 'coffee_logs'
      ];
      for (const t of commonTables) {
        const { error: err } = await supabase.from(t).select('count').limit(1);
        if (!err) {
          console.log(`Table exists: ${t}`);
        }
      }
    } else {
      console.log("Tables from RPC:", data2);
    }
  } else {
    console.log("Tables from pg_tables:", data.map(t => t.tablename));
  }
}
run();
