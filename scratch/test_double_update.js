
require('dotenv').config({ path: '.env.local' });
const STOCK_API_BASE_URL = "https://lxfavbzmebqqsffgyyph.supabase.co/functions/v1/stock-api";
const STOCK_API_KEY = "1500323553";

const getHeaders = () => ({
    "Content-Type": "application/json",
    "X-Internal-API-Key": STOCK_API_KEY,
    "Authorization": `Bearer ${process.env.STOCK_API_ANON_KEY}`
});

async function run() {
    // 1. Get initial state
    const itemsRes = await fetch(`${STOCK_API_BASE_URL}/items`, { headers: getHeaders() });
    const items = await itemsRes.json();
    const singha = items.find(i => i.name.includes("เบียร์สิงห์"));
    console.log("INITIAL QUANTITY:", singha.current_quantity);

    // 2. Add a transaction of +1
    console.log("Adding +1 transaction...");
    const payload = {
      stock_item_id: singha.id,
      transaction_type: 'in',
      quantity_change: 1,
      performed_by: 'Antigravity Debug',
      note: 'Test for double update'
    };
    await fetch(`${STOCK_API_BASE_URL}/transactions`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });

    // 3. Wait a bit for trigger
    await new Promise(r => setTimeout(r, 2000));

    // 4. Get final state
    const itemsRes2 = await fetch(`${STOCK_API_BASE_URL}/items`, { headers: getHeaders() });
    const items2 = await itemsRes2.json();
    const singha2 = items2.find(i => i.id === singha.id);
    console.log("FINAL QUANTITY:", singha2.current_quantity);
    console.log("DIFF:", singha2.current_quantity - singha.current_quantity);
}
run();
