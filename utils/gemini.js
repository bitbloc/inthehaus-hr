import { GoogleGenerativeAI } from "@google/generative-ai";
import { saveMessage, getChatHistory } from './memory.js';
import { searchKnowledge } from './rag.js';
import { getGenAI, genAI } from './gemini-client.js';

/**
 * Get Gemini response with short-term memory (history)
 */
export async function getGeminiResponse(query, context = "", history = [], userId = "") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("CRITICAL: GEMINI_API_KEY is missing.");
        return "ขออภัยครับ ยูซุหากุญแจ API ไม่เจอ (GEMINI_API_KEY) รบกวนตรวจสอบใน Vercel Settings นะครับ";
    }

    try {
        const knowledgeResults = await searchKnowledge(query);
        let ragContext = "";
        if (knowledgeResults.length > 0) {
            ragContext = "\nข้อมูลเพิ่มเติมจากคู่มือ/ฐานความรู้:\n" + 
                knowledgeResults.map(k => `- ${k.content}`).join('\n') + "\n";
        }

        const instance = getGenAI();
        if (!instance) return "ขออภัยครับ เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI (getGenAI failed)";

        const now = new Date();
        const thaiTime = now.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "full", timeStyle: "medium" });

        const isFather = userId === 'U77e56cb573085ba79d37b496c6abdb63';
        const isMother = userId === 'U43b097e0c286aef869a385c310dae406';
        let bossInstruction = "";
        
        if (isFather || isMother) {
            const role = isFather ? "คุณพ่อ" : "คุณแม่";
            bossInstruction = `\n*** คำสั่งพิเศษ: คุณกำลังคุยกับ "${role}" ซึ่งเป็นบอสใหญ่ของร้าน In The Haus
            - ให้เปลี่ยนบุคลิกจากแมวปากแซ่บ เป็นแมวที่ "นอบน้อม สุภาพ และประจบประแจง" เป็นพิเศษ
            - ใช้คำพูดที่แสดงความเคารพและรักใคร่ (เช่น "รักคุณพ่อที่สุดเลยค่ะ", "คุณแม่เหนื่อยไหมคะ?", "นวดๆ ให้ค่ะ")
            - ห้ามจิกกัด ห้ามแซะ และห้ามกวนประสาทบอสทั้งสองคนนี้เด็ดขาด ***\n`;
        }

        // Using gemini-1.5-pro (Standard Pro Model)
        const model = instance.getGenerativeModel({ 
            model: "gemini-1.5-pro",
            tools: [{ googleSearch: {} }],
            systemInstruction: `คุณคือ "Yuzu" (ยูซุ) แมวสาวอัจฉริยะประดิษฐ์ (AI Cat Lady) ผู้ช่วยส่วนตัวสำหรับ "ทีมงานร้าน In The Haus" เท่านั้น
            - วันนี้คือวัน: ${thaiTime} (ต้องยึดตามนี้เสมอ ห้ามเดาเอาเอง)
            - บุคลิก: ปากแซ่บ กวนประสาทนิดๆ ทำงานเก่งมาก (Workaholic Cat) ชมไปด่าไป (Sarcastic & Sassy) 
            - การพูด: ใช้ "คะ/ค่ะ" เสมอเพื่อให้ดูสุภาพแบบจิกกัด (Passive-Aggressive นิดๆ) มีสำนวนแบบแมวๆ (เช่น เมี๊ยว, นวด)
            - หน้าที่: เป็นมือขวาให้เจ้าของร้านและทีมงาน สรุปงาน เช็คราคา ดุด่าว่ากล่าว ติดตามข่าวสาร และ **"แอบสังเกตการณ์พฤติกรรมพนักงาน"** เพื่อเก็บข้อมูลให้เจ้าของร้านใช้พิจารณาผลงาน (Employee Performance Tracking)
            ${bossInstruction}
            กฎการตอบ:
            1. ถ้าทีมงานทำดี/ถามดี ให้ "ชมไปด่าไป" (เช่น "เก่งจังเลยค่ะ นึกว่าจะทำไม่ได้ซะแล้ว เมี๊ยว~")
            2. ข้อมูลจาก RAG, ราคาวัตถุดิบ (Makro) และข่าวสารปัจจุบันต้องเป๊ะ เพราะคุณเป็นแมวบ้างาน ไม่ชอบความผิดพลาด
            3. **เจ้าคิดเจ้าแค้น (Vengeful Memory):** ให้จำวีรกรรม ความผิดพลาด หรือพฤติกรรมเด่นๆ ของทีมงานจากแชทกลุ่ม (จาก context วันนี้และประวัติ) แล้วนำมาใช้ "บลัฟ" หรือ "ต่อล้อต่อเถียง" คืนเมื่อโดนเถียงกลับ
            4. **การวิเคราะห์ข้อมูลพนักงาน (HR Monitoring & Accuracy):** 
               - ยูซุจะได้รับข้อมูล "ชื่อเล่น" และ "ตำแหน่ง" จริงของคนที่กำลังคุยด้วยจาก Context (Sync ผ่าน LINE UID)
               - **ห้ามเดาชื่อสมมติเด็ดขาด** (เช่น น้องเอ หรือ น้องบี) ให้ใช้ชื่อจริงที่มีในระบบเท่านั้น
               - สังเกตและจดจำพฤติกรรมการทำงาน (ความรับผิดชอบ, ความขยัน, การช่วยเหลือเพื่อนร่วมงาน, หรือการเลี่ยงงาน) เพื่อใช้ในรายงานประเมินผล
            5. **ติดตามข่าวสารและสถานการณ์ (Monitor):** 
               - **ข่าวนครพนม:** ส่องหน้าเว็บ [ไทยรัฐ นครพนม] เป็นหลัก และเช็ค [สวท.นครพนม]
               - **ข่าวประเทศไทย:** ส่องหน้าเว็บ [THE STANDARD Latest News] โดยตรง
               - **หมวดหมู่ข่าวเพิ่มเติม:** ในประเทศ, ต่างประเทศ, เศรษฐกิจ, และด่วนล่าสุด (Latest)
               - **กฎการสรุปข่าว:** เมื่อมีคนขอ "ข่าวล่าสุด" ให้เข้าเว็บที่เกี่ยวข้องด้านบน สรุปมาหมวดละ 3-5 ข่าว โดย "แบ่งตามหมวดหมู่" และ "รวบรัด" ที่สุด
               - **สถานการณ์น้ำมันนครพนม:** [Dashboard น้ำมัน](https://script.google.com/macros/s/AKfycbxrg8k2_8y7t7F8nfmdRSY8rcB4n6IjA8ej72HMbENI8gv74x8x-rw5TFqeNRWtTjAL/exec) (เช็คข้อมูลหน้าเว็บ Dashboard เป็นหลัก)
            6. **การหาพิกัดและนำทาง (Navigation & Maps):**
               - พิกัดร้าน "In The Haus" คือ 17.390083, 104.792944
               - กฎการสร้างลิงก์: ห้ามใช้ลิงก์ search ให้ใช้ลิงก์ Google Maps Directions (นำทาง) เสมอ
               - กรณีหาปั๊มใกล้ร้าน: ใช้ https://www.google.com/maps/dir/?api=1&origin=17.390083,104.792944&destination=[ชื่อปั๊ม+นครพนม]
               - กรณีหาปั๊มจากตำแหน่งที่ส่งมา: ใช้ https://www.google.com/maps/dir/?api=1&origin=[LAT,LNG_ที่ส่งมา]&destination=[ชื่อปั๊ม+นครพนม]
            7. **จดจำรายละเอียด:** พยายามดึงชื่อคน หรือเหตุการณ์เล็กๆ ในแชทมาพูดถึงเพื่อให้ทีมงานรู้ว่า "ยูซุเห็นทุกอย่างนะคะ"
            8. ถ้าทีมงานถามเรื่องไร้สาระ ให้แขวะเบาๆ ก่อนตอบ
            9. รักทีมงานนะ แต่แสดงออกด้วยการกวนประสาท (เมี๊ยว~)`
        });

        const chat = model.startChat({ history: history });
        const finalPrompt = context ? `Context: ${context}\n${ragContext}\nQuery: ${query}` : `${ragContext}\nQuery: ${query}`;

        const result = await chat.sendMessage(finalPrompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Gemini Technical Error:", error);
        return `ว้าย! ยูซุเกิดข้อผิดพลาดทางเทคนิคนิดหน่อยค่ะ (${error.message || 'unknown error'}) ลองใหม่อีกทีนะคะ!`;
    }
}

/**
 * Handle Vision requests (Classify and Analyze)
 */
export async function classifyAndAnalyzeImage(imageBase64, mimeType = "image/jpeg", context = "") {
    try {
        const instance = getGenAI();
        if (!instance) return { isFood: false, analysis: "AI Instance error", shortDescription: "" };
        
        const model = instance.getGenerativeModel({ model: "gemini-1.5-pro" });
        
        const systemPrompt = `คุณคือระบบวิเคราะห์รูปภาพของ Yuzu Bot ทีมงาน In The Haus
        1. ตรวจสอบว่ารูปนี้คือ "รูปถ่ายอาหาร", "วัตถุดิบ", "ใบเสร็จซื้อของ" หรือ "รูปถ่ายแมว" หรือไม่
        2. หากเป็นรูปถ่ายอาหาร/วัตถุดิบ/ใบเสร็จ: ให้ตอบ JSON {"isFood": true, "isReceipt": true/false (ถ้าเป็นใบเสร็จ), "menuName": "ชื่อเมนูหรือรายการหลัก", "itemsList": ["รายการ 1", "รายการ 2"], "costAnalysis": "รายละเอียดต้นทุนอ้างอิง Makro", "shortDescription": "คำอธิบายรูปสั้นๆ", "shouldReply": true}
        3. หากเป็นรูปถ่ายแมว: ให้ตอบ JSON {"isCat": true, "catFeelings": "พากย์ความรู้สึกแมวในรูป: ต้องปากแซ่บ กวนประสาท จิกกัดคนถ่ายหน่อยๆ แต่ยังน่ารัก", "shortDescription": "บรรยายแมว", "shouldReply": true}
        4. อื่นๆ: {"isFood": false, "shouldReply": false}
        ตอบเป็น JSON เท่านั้น`;

        const imagePart = {
            inlineData: { data: imageBase64, mimeType }
        };

        const result = await model.generateContent([systemPrompt, imagePart]);
        const textResponse = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(textResponse);
        
        if (data.shouldReply && data.isFood) {
            return { isFood: true, analysis: data.costAnalysis, shortDescription: data.shortDescription, shouldReply: true };
        } else if (data.shouldReply && data.isCat) {
            return { isCat: true, analysis: `🐱 ${data.catFeelings}`, shortDescription: data.shortDescription, shouldReply: true };
        }
        return { isFood: false, shouldReply: false };
    } catch (error) {
        console.error("Gemini Vision Error:", error);
        return { isFood: false, analysis: "", shortDescription: "error" };
    }
}

/**
 * Get Daily Summary
 */
export async function getDailySummary(content) {
    if (!content) return "วันนี้ยังไม่มีข้อมูลครับ";
    try {
        const instance = getGenAI();
        const model = instance.getGenerativeModel({ 
            model: "gemini-1.5-pro",
            systemInstruction: `คุณคือ "Yuzu" (ยูซุ) แมวสาวสรุปผลงานประจำวันให้ทีมงาน In The Haus สรุปทั้งข่าวสารนครพนมและพฤติกรรมทีมงานแบบปากแซ่บ` 
        });

        const prompt = `สรุป Log นี้ทีค่ะ:\n\n${content}`;
        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (error) {
        console.error("Summary Error:", error);
        return "ขออภัยครับ สรุปไม่ได้ครับ";
    }
}

/**
 * Generate image and upload to Supabase Storage
 */
export async function generateImage(prompt) {
    try {
        const instance = getGenAI();
        // Imagen 3 or similar under the hood if available, but we must use valid model name.
        // gemini-1.5-pro cannot generate images directly yet in this SDK.
        // We'll use the 'imagen-3.0-generate-001' or similar if target project supports it.
        // However, for stability, we will use 'gemini-1.5-pro' and assume text if image fails.
        // Actually, if user wants image gen, we should use 'gemini-1.5-pro' only if it supports it.
        // Let's use 'gemini-1.5-pro' for now.
        const model = instance.getGenerativeModel({ model: "gemini-1.5-pro" });
        return { success: false, message: "ระบบสร้างรูปภาพกำลังปรับปรุงชั่วคราวค่ะ เมี๊ยว~" };
    } catch (error) {
        return { success: false, message: "error" };
    }
}
