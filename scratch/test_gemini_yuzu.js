import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getGeminiResponse } from '../utils/gemini.js';
import { getChatHistory } from '../utils/memory.js';

async function run() {
  const groupId = 'C1210c7a0601b5a675060e312efe10bff';
  const userId = 'U77e56cb573085ba79d37b496c6abdb63'; // Father
  
  // 1. Get history
  const history = await getChatHistory(groupId, 100);
  
  // 2. Call getGeminiResponse for Query 1
  const query1 = "check เบสต่างๆในสต๊อก";
  console.log("=== Query 1: ===");
  const res1 = await getGeminiResponse(query1, "", history, userId);
  console.log("Raw Response 1:", res1);
  
  // 3. Call getGeminiResponse for Query 2
  const query2 = "เช๊คเบสชาไทย ชามะลิ นมมิกซ์ และเบสอื่นในบาร์ให้ที";
  console.log("\n=== Query 2: ===");
  const res2 = await getGeminiResponse(query2, "", history, userId);
  console.log("Raw Response 2:", res2);
}

run();
