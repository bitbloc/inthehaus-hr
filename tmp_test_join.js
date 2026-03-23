const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testJoinQuery() {
  console.log('Testing query with employees join...');
  const { data, error } = await supabase
    .from('slip_transactions')
    .select('id, amount, slip_url, timestamp, is_deleted, sender_name, employees(name, nickname)')
    .eq('is_deleted', false)
    .eq('date', '2026-03-23')
    .limit(1);

  if (error) {
    console.error('Join Query error (Expected failure point):', JSON.stringify(error, null, 2));
  } else {
    console.log('Join Query SUCCEEDED. Sample:', data[0]);
  }
}

testJoinQuery();
