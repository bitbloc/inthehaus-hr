import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

async function test() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    console.log("Fetching messages since:", today.toISOString());
    const { data: messages, error } = await supabase
      .from('yuzu_chat_history')
      .select('*')
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false });

    if (error) throw error;
    console.log("Found messages today:", messages.length);
    messages.forEach(msg => {
      console.log(`[${msg.created_at}] [Role: ${msg.role}] [Type: ${msg.message_type}]`);
      console.log(`Content: "${msg.content}"`);
      console.log("-".repeat(40));
    });
  } catch (err) {
    console.error("Error:", err);
  }
}
test();
