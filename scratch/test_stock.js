import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { fetchStockItems } from '../utils/stock_api.js';

async function test() {
  try {
    console.log("Searching 'เบสชาไทย':");
    console.log(await fetchStockItems("เบสชาไทย"));

    console.log("\nSearching 'ชามะลิ':");
    console.log(await fetchStockItems("ชามะลิ"));

    console.log("\nSearching 'นมมิกซ์':");
    console.log(await fetchStockItems("นมมิกซ์"));
  } catch (err) {
    console.error("Error:", err);
  }
}
test();
