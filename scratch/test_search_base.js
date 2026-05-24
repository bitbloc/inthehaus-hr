import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { fetchStockItems } from '../utils/stock_api.js';

async function test() {
  try {
    const items = await fetchStockItems("เบส");
    console.log("Returned items for 'เบส':", items.map(i => i.name));
  } catch (err) {
    console.error("Error:", err);
  }
}
test();
