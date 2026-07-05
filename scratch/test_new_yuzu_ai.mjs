import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { getGeminiResponse } from '../utils/gemini.js';
import { getYuzuConfigs } from '../utils/memory.js';

async function runTests() {
    console.log("=== STARTING NEW YUZU AI TESTS ===");

    // Fetch config to verify UIDs
    const configs = await getYuzuConfigs();
    const fatherUid = configs.father_uid || "U77e56cb573085ba79d37b496c6abdb63";
    const motherUid = configs.mother_uid || "U8c53c87647799f798f208250be71ae1b";
    const kasperUid = "U5982dc3642092f71f02c0a55c2d4a2fd"; // Regular employee

    console.log(`Father UID: ${fatherUid}`);
    console.log(`Mother UID: ${motherUid}`);
    console.log(`Kasper UID: ${kasperUid}`);

    // ==========================================
    // PART 1 TESTS: SOP & Operations & Hygiene
    // ==========================================
    console.log("\n========================================================");
    console.log("TEST CASE 1: Part 1 - SOP Issue from Regular Staff (พี่แคสเปอร์)");
    console.log("Query: 'yuzu วันนี้ถังแช่น้ำแข็งพังน้า'");
    console.log("========================================================");
    const p1Reply = await getGeminiResponse("yuzu วันนี้ถังแช่น้ำแข็งพังน้า", "", [], kasperUid);
    console.log("Yuzu's Reply:\n", p1Reply);

    console.log("\n========================================================");
    console.log("TEST CASE 2: Part 1 - SOP Issue from Boss (พี่ฤ)");
    console.log("Query: 'ยูซุ วันนี้แอร์ที่ห้องรับแขกเสียนะ'");
    console.log("========================================================");
    const p1BossReply = await getGeminiResponse("ยูซุ วันนี้แอร์ที่ห้องรับแขกเสียนะ", "", [], fatherUid);
    console.log("Yuzu's Reply:\n", p1BossReply);

    // ==========================================
    // PART 2 TESTS: Kitchen & Cold Chain
    // ==========================================
    console.log("\n========================================================");
    console.log("TEST CASE 3: Part 2 - Fresh Delivery from Regular Staff (พี่แคสเปอร์)");
    console.log("Query: 'yuzu มีของสดเข้ามาส่ง นมจืดเมจิ 10 แกลลอน ผักกาดหอม 5 กิโลครับ'");
    console.log("========================================================");
    const p2Reply = await getGeminiResponse("yuzu มีของสดเข้ามาส่ง นมจืดเมจิ 10 แกลลอน ผักกาดหอม 5 กิโลครับ", "", [], kasperUid);
    console.log("Yuzu's Reply:\n", p2Reply);

    // ==========================================
    // PART 3 TESTS: Sales & Service Coach
    // ==========================================
    console.log("\n========================================================");
    console.log("TEST CASE 4: Part 3 - Food Pairing from Regular Staff (พี่แคสเปอร์)");
    console.log("Query: 'yuzu แกงไตปลา เชียร์คู่กับเครื่องดื่มอะไรดีครับ?'");
    console.log("========================================================");
    const p3Reply = await getGeminiResponse("yuzu แกงไตปลา เชียร์คู่กับเครื่องดื่มอะไรดีครับ?", "", [], kasperUid);
    console.log("Yuzu's Reply:\n", p3Reply);

    console.log("\n========================================================");
    console.log("TEST CASE 5: Part 3 - Pairing Suggestion from Boss (พี่แหม่ม)");
    console.log("Query: 'ยูซุ แนะนำเครื่องดื่มเข้าคู่กับคั่วกลิ้งสิคะ'");
    console.log("========================================================");
    const p3BossReply = await getGeminiResponse("ยูซุ แนะนำเครื่องดื่มเข้าคู่กับคั่วกลิ้งสิคะ", "", [], motherUid);
    console.log("Yuzu's Reply:\n", p3BossReply);
}

runTests().catch(console.error);
