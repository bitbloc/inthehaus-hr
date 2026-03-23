const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
(async () => {
    const { data: employees } = await supabase.from('employees').select('nickname, name, is_active').eq('is_active', true);
    console.log(JSON.stringify(employees, null, 2));
})();
