
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

async function testHrSync() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  
  // Test fetching an employee by LINE UID (using one from the report)
  // According to uid_report_utf8.txt, Ritha (Boss) is U77e56cb573085ba79d37b496c6abdb63
  const testUid = 'U77e56cb573085ba79d37b496c6abdb63';
  
  console.log(`Checking UID: ${testUid}`);
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('line_uid', testUid)
    .maybeSingle();

  if (error) {
    console.error('❌ Error:', error.message);
  } else if (data) {
    console.log('✅ Found Employee:', data.nickname, '(', data.position, ')');
  } else {
    console.log('❓ No employee found for this UID.');
  }

  // Check all active employees
  const { data: all, error: err2 } = await supabase
    .from('employees')
    .select('nickname, line_uid, status')
    .eq('status', 'active');
    
  console.log('\nActive Employees with UIDs:');
  console.log(JSON.stringify(all, null, 2));
}

testHrSync();
