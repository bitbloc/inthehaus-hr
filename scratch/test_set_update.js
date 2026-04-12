
require('dotenv').config({ path: '.env.local' });
const STOCK_API_BASE_URL = "https://lxfavbzmebqqsffgyyph.supabase.co/functions/v1/stock-api";
const STOCK_API_KEY = "1500323553";

const getHeaders = () => ({
    "Content-Type": "application/json",
    "X-Internal-API-Key": STOCK_API_KEY,
    "Authorization": `Bearer ${process.env.STOCK_API_ANON_KEY}`
});

async function run() {
    const itemsRes = await fetch(`${STOCK_API_BASE_URL}/items`, { headers: getHeaders() });
    const items = await itemsRes.json();
    const singha = items.find(i => i.name.includes("เบียร์สิงห์"));
    console.log("INITIAL QUANTITY:", singha.current_quantity);

    console.log("Attempting 'set' transaction to 40...");
    // If I want 40, and current is singha.current_quantity.
    // Let's see if the API expects 'quantity_change' or 'target_quantity'.
    // The history logs showed 'quantity_change'.
    const target = 40;
    const diff = target - singha.current_quantity;

    const payload = {
      stock_item_id: singha.id,
      transaction_type: 'set',
      quantity_change: diff, // History says this
      performed_by: 'Antigravity Debug Set',
      note: `Test set to ${target}`
    };
    await fetch(`${STOCK_API_BASE_URL}/transactions`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });

    await new Promise(r => setTimeout(r, 2000));

    const itemsRes2 = await fetch(`${STOCK_API_BASE_URL}/items`, { headers: getHeaders() });
    const items2 = await itemsRes2.json();
    const singha2 = items2.find(i => i.id === singha.id);
    console.log("FINAL QUANTITY:", singha2.current_quantity);
    console.log("DIFF OBSERVED:", singha2.current_quantity - singha.current_quantity);
    console.log("EXPECTED DIFF:", diff);
}
run();
