
require('dotenv').config({ path: '.env.local' });

const STOCK_API_BASE_URL = "https://lxfavbzmebqqsffgyyph.supabase.co/functions/v1/stock-api";
const STOCK_API_KEY = "1500323553";

const getHeaders = () => {
    return {
        "Content-Type": "application/json",
        "X-Internal-API-Key": STOCK_API_KEY,
        "Authorization": `Bearer ${process.env.STOCK_API_ANON_KEY}`
    };
};

async function run() {
    console.log("Fetching items...");
    const itemsRes = await fetch(`${STOCK_API_BASE_URL}/items`, { headers: getHeaders() });
    const items = await itemsRes.json();
    
    if (!Array.isArray(items)) {
        console.log("Error fetching items:", items);
        return;
    }

    const singha = items.find(i => i.name.includes("เบียร์สิงห์"));
    if (!singha) {
        console.log("SINGHA NOT FOUND. ALL ITEMS:", items.map(i => i.name));
        return;
    }
    console.log("ITEM FOUND:", JSON.stringify(singha, null, 2));

    console.log("Fetching history...");
    const historyRes = await fetch(`${STOCK_API_BASE_URL}/transactions?item_id=${singha.id}`, { headers: getHeaders() });
    const history = await historyRes.json();
    console.log("HISTORY (Last 5):", JSON.stringify(history.slice(0, 5), null, 2));
}
run();
