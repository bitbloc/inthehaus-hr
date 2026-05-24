import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { handleStockResponseTags } from '../app/api/webhook/handlers/stockHandler.js';

async function verify() {
  console.log("=== Testing Stock Tag Handler (Check multiple items) ===");
  const response = `[STOCK_ACTION] {"action": "CHECK_ITEM", "itemName": "เบส"}`;
  const request = { url: "https://localhost/api/webhook" };
  const query = "เช็คเบสชาไทย ชามะลิ นมมิกซ์ และเบสอื่นในบาร์ให้ที";

  try {
    const msg = await handleStockResponseTags(response, request, query);
    console.log("Returned Message:");
    console.log(JSON.stringify(msg, null, 2));
    
    if (msg && msg.type === 'flex') {
      console.log("✅ SUCCESS: Correctly returned Flex message for matching stock items!");
    } else {
      console.log("❌ FAILED: Unexpected return value", msg);
    }
  } catch (err) {
    console.error("❌ FAILED with error:", err);
  }
}

verify();
