
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

async function listTableColumns() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  
  // Supabase doesn't have a direct "describe table" in JS SDK, 
  // but we can query an item and see the keys.
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('❌ Error fetching employees sample:', error.message);
  } else if (data) {
    console.log('✅ Employee Table Keys:', Object.keys(data).join(', '));
  } else {
    // If table is empty, we might need a different approach.
    const { data: all, error: err2 } = await supabase.rpc('get_table_columns', { table_name: 'employees' });
    if (err2) {
      console.log('❌ get_table_columns RPC failed (expected if not defined).');
    } else {
       console.log('RPC results:', all);
    }
  }
}

listTableColumns();
