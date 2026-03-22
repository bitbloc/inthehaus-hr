const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testGetEmployee() {
    const lineUserId = 'U77e56cb573085ba79d37b496c6abdb63';
    const { data, error } = await supabase
            .from('employees')
            .select('name, nickname, position, employment_status, line_bot_id, line_user_id')
            .or(`line_bot_id.eq.${lineUserId},line_user_id.eq.${lineUserId}`)
            .eq('is_active', true)
            .maybeSingle();

    console.log(data, error);
}

testGetEmployee();
