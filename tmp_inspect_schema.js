const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function inspectSchema() {
  console.log('Inspecting slip_transactions columns...');
  const { data, error } = await supabase
    .from('slip_transactions')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Query error:', error);
  } else if (data && data.length > 0) {
    console.log('Columns found:', Object.keys(data[0]));
  } else {
    // If no data, try to get a single row without limit just in case
    console.log('No data found in slip_transactions or table empty.');
  }

  // Also check if we can query by 'date' specifically
  console.log('\nTesting query with date filter...');
  const { error: filterError } = await supabase
    .from('slip_transactions')
    .select('id')
    .eq('date', '2026-03-23')
    .limit(1);
  
  if (filterError) {
    console.error('Filter error (400 likely here):', filterError);
  } else {
    console.log('Query with date filter SUCCEEDED.');
  }
}

inspectSchema();
