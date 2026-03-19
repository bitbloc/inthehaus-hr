
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

async function getReport() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data, error } = await supabase
    .from('employees')
    .select('name, nickname, position, line_user_id, is_active, employment_status')
    .order('name');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Final Employee Report (Sync Check):');
  console.log('==================================');
  data.forEach(emp => {
    console.log(`- ${emp.name} (${emp.nickname || 'N/A'}) [${emp.employment_status || 'N/A'}] | Pos: ${emp.position} | Active: ${emp.is_active} | UID: ${emp.line_user_id || 'EMPTY'}`);
  });
}

getReport();
