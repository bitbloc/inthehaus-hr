import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { classifyAndAnalyzeImage } from '../utils/gemini.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testVision() {
    console.log("=== TESTING YUZU STERN VISION CLASSIFIER ===");

    const imagePath = 'C:/Users/Ritha/.gemini/antigravity-ide/brain/f322ff51-075e-4b02-9f67-0adb8c20fbf8/media__1782273100404.png';
    
    if (!fs.existsSync(imagePath)) {
        console.error(`Image path does not exist: ${imagePath}`);
        return;
    }

    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    console.log("Analyzing image as a garnish/prep report...");
    const result = await classifyAndAnalyzeImage(
        base64Image,
        "image/png",
        "ราคามะนาว: 10 บาท/ลูก, ราคาแก้วพลาสติก: 2 บาท/ใบ",
        null, // bossRole = null (regular employee)
        "ควบคุมมาตรฐานในครัวอย่างเข้มงวด ตั้งแต่ความสะอาดของจานชามไปจนถึงวัตถุดิบและ garnish ทุกจานที่ออกต้องรสชาตินิ่ง ปริมาณได้รูป และจัดแต่งจานเป๊ะตามมาตรฐาน คัดทิ้งส่วนที่เหี่ยว/ช้ำทันที",
        "Add"
    );

    console.log("Vision classification result:", JSON.stringify(result, null, 2));
}

testVision().catch(console.error);
