import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'fs';
import path from 'path';
import { classifyAndAnalyzeImage } from '../utils/gemini.js';

async function testPackageVision() {
    console.log("=== TESTING YUZU PACKAGE VISION CLASSIFICATION ===");

    const imagePath = 'C:/Users/Ritha/.gemini/antigravity-ide/brain/ba162534-88a8-4fac-b6f6-8a019f707657/media__1782540888011.png';
    
    if (!fs.existsSync(imagePath)) {
        console.error(`Image path does not exist: ${imagePath}`);
        return;
    }

    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    console.log("Analyzing actual package screenshot (fertilizer/decor)...");
    const resultNonKitchen = await classifyAndAnalyzeImage(
        base64Image,
        "image/png",
        "",
        null, // regular employee
        "ควบคุมมาตรฐานในครัวอย่างเข้มงวด ตั้งแต่ความสะอาดของจานชามไปจนถึงวัตถุดิบและ garnish ทุกจานที่ออกต้องรสชาตินิ่ง ปริมาณได้รูป และจัดแต่งจานเป๊ะตามมาตรฐาน คัดทิ้งส่วนที่เหี่ยว/ช้ำทันที",
        "Add"
    );

    console.log("Result (Non-Kitchen Package):");
    console.log(JSON.stringify(resultNonKitchen, null, 2));
}

testPackageVision().catch(console.error);
