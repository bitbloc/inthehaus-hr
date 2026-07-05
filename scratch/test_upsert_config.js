require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const key = 'test_cron_lock';
  const val = new Date().toISOString().split('T')[0];
  
  console.log("Upserting key...");
  const { data, error } = await supabase
    .from('yuzu_config')
    .upsert({ key, value: val }, { onConflict: 'key' })
    .select();
    
  if (error) {
    console.error("Upsert Error:", error);
  } else {
    console.log("Upsert Success:", data);
    
    // Clean up
    console.log("Cleaning up...");
    const { error: delErr } = await supabase
      .from('yuzu_config')
      .delete()
      .eq('key', key);
    if (delErr) {
      console.error("Delete Error:", delErr);
    } else {
      console.log("Cleaned up successfully.");
    }
  }
}

test();
