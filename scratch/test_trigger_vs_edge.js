
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const itemId = "722f7028-7413-4cdd-a1fc-cab3240578ed"; // Singha

  const { data: item1 } = await supabase.from('stock_items').select('current_quantity').eq('id', itemId).single();
  console.log("INITIAL:", item1.current_quantity);

  // Directly insert into stock_transactions (bypassing edge function)
  const { data: t, error } = await supabase.from('stock_transactions').insert({
    stock_item_id: itemId,
    transaction_type: 'in',
    quantity_change: 1,
    performed_by: 'Antigravity Trigger Test',
    note: 'Testing Postgres Trigger directly'
  }).select().single();

  if (error) console.error("Insert error:", error.message);
  
  await new Promise(r => setTimeout(r, 1000));

  const { data: item2 } = await supabase.from('stock_items').select('current_quantity').eq('id', itemId).single();
  console.log("AFTER DB INSERT:", item2.current_quantity);
  console.log("TRIGGER DIFF:", item2.current_quantity - item1.current_quantity);

  // Now, test edge function
  const STOCK_API_BASE_URL = "https://lxfavbzmebqqsffgyyph.supabase.co/functions/v1/stock-api";
  await fetch(`${STOCK_API_BASE_URL}/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-API-Key": "1500323553",
      "Authorization": `Bearer ${process.env.STOCK_API_ANON_KEY}`
    },
    body: JSON.stringify({
      stock_item_id: itemId,
      transaction_type: 'in',
      quantity_change: 1,
      performed_by: 'Antigravity Edge Test',
      note: 'Testing Edge Function'
    })
  });

  await new Promise(r => setTimeout(r, 1000));

  const { data: item3 } = await supabase.from('stock_items').select('current_quantity').eq('id', itemId).single();
  console.log("AFTER EDGE FUNCTION:", item3.current_quantity);
  console.log("EDGE DIFF:", item3.current_quantity - item2.current_quantity);

}
run();
