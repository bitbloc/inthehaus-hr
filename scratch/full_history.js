
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
    console.log("CURRENT STATE:", JSON.stringify(singha, null, 2));

    const historyRes = await fetch(`${STOCK_API_BASE_URL}/transactions?item_id=${singha.id}`, { headers: getHeaders() });
    const history = await historyRes.json();
    
    console.log("HISTORY LOG:");
    history.forEach(t => {
        console.log(`[${t.created_at}] ${t.transaction_type} change=${t.quantity_change} by=${t.performed_by} note="${t.note}"`);
    });
}
run();
