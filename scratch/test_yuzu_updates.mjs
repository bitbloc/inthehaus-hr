import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { getGeminiResponse } from '../utils/gemini.js';
import { getEmployeeByLineId, getYuzuConfigs } from '../utils/memory.js';

async function runTests() {
    console.log("=== RUNNING YUZU PERSONALITY & BEHAVIOR TESTS ===");

    // Fetch config to get boss UIDs
    const configs = await getYuzuConfigs();
    const fatherUid = configs.father_uid;
    const motherUid = configs.mother_uid;

    console.log(`Father UID: ${fatherUid}`);
    console.log(`Mother UID: ${motherUid}`);

    // Test Case 1: Regular employee (e.g. แคสเปอร์)
    // Kasper line_bot_id is "U5982dc3642092f71f02c0a55c2d4a2fd" (from our DB query)
    const kasperUid = "U5982dc3642092f71f02c0a55c2d4a2fd";
    console.log("\n--- TEST CASE 1: Regular Employee (พี่แคสเปอร์) ---");
    const kasperEmp = await getEmployeeByLineId(kasperUid);
    console.log("Kasper DB Data:", JSON.stringify(kasperEmp));
    
    const kasperQuery1 = "วันนี้งานที่ร้านเป็นยังไงบ้าง ยูซุ?";
    console.log(`Kasper asks: "${kasperQuery1}"`);
    const kasperReply1 = await getGeminiResponse(kasperQuery1, "วันนี้มีคิวล้างถังน้ำกาแฟ", [], kasperUid);
    console.log(`Yuzu reply:\n${kasperReply1}`);

    // Test Case 2: Father UID
    console.log("\n--- TEST CASE 2: Boss Father (คุณพ่อ) ---");
    const fatherQuery = "วันนี้เหนื่อยจัง ยูซุทำงานเหนื่อยไหม?";
    console.log(`Father asks: "${fatherQuery}"`);
    const fatherReply = await getGeminiResponse(fatherQuery, "", [], fatherUid);
    console.log(`Yuzu reply:\n${fatherReply}`);

    // Test Case 3: Mother UID
    console.log("\n--- TEST CASE 3: Boss Mother (คุณแม่) ---");
    const motherQuery = "วันนี้ร้านจัดสต็อกบาร์เรียบร้อยไหมยูซุ?";
    console.log(`Mother asks: "${motherQuery}"`);
    const motherReply = await getGeminiResponse(motherQuery, "วันนี้บาร์เช็คสต็อกเรียบร้อย", [], motherUid);
    console.log(`Yuzu reply:\n${motherReply}`);

    // Test Case 4: Espresso Shot Analysis - Fast Flow
    console.log("\n--- TEST CASE 4: Espresso Shot (Under-extracted) ---");
    const shotQuery1 = "18g 35ml ไหลวิที่ 4 จบที่ 20 วินาทีนะคะ";
    console.log(`Kasper sends: "${shotQuery1}"`);
    const shotReply1 = await getGeminiResponse(shotQuery1, "", [], kasperUid);
    console.log(`Yuzu reply:\n${shotReply1}`);

    // Test Case 5: Espresso Shot - Slow Flow
    console.log("\n--- TEST CASE 5: Espresso Shot (Over-extracted) ---");
    const shotQuery2 = "18g 40ml ไหลวิที่ 7 จบที่ 35 วินาทีค่ะ";
    console.log(`Kasper sends: "${shotQuery2}"`);
    const shotReply2 = await getGeminiResponse(shotQuery2, "", [], kasperUid);
    console.log(`Yuzu reply:\n${shotReply2}`);
    
    // Test Case 6: Espresso Shot - Perfect Flow
    console.log("\n--- TEST CASE 6: Espresso Shot (Perfect) ---");
    const shotQuery3 = "18g 36ml ไหลวิที่ 6 จบที่ 27 วินาทีครับ";
    console.log(`Kasper sends: "${shotQuery3}"`);
    const shotReply3 = await getGeminiResponse(shotQuery3, "", [], kasperUid);
    console.log(`Yuzu reply:\n${shotReply3}`);
}

runTests().catch(console.error);
