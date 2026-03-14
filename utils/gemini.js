import { GoogleGenerativeAI } from "@google/generative-ai";

// For local testing compatibility
if (typeof process !== 'undefined' && !process.env.GEMINI_API_KEY) {
    try {
        const dotenv = await import('dotenv');
        dotenv.config({ path: '.env.local' });
    } catch (e) {
        // Dotenv might not be available in all envs, that's fine for production
    }
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);


export async function getGeminiResponse(query, context = "") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("CRITICAL: GEMINI_API_KEY is missing from environment variables.");
        return "ขออภัยครับ ยูซุหากุญแจ API ไม่เจอ (GEMINI_API_KEY) รบกวนตรวจสอบใน Vercel Settings นะครับ";
    }

    try {
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.0-flash",
            systemInstruction: `คุณคือ "Yuzu" (ยูซุ) ผู้ช่วย AI อัจฉริยะประจำชุมชน "In The Haus" 
            คุณมีบุคลิกที่สุภาพ เป็นกันเอง ใจดี และชอบช่วยเหลือ
            หน้าที่ของคุณคือตอบคำถามทั่วไป เช็คราคาสินค้า และดูดวง
            
            คำแนะนำเพิ่มเติม:
            1. ถ้าผู้ใช้ถามเรื่องราคาทอง หรือน้ำมัน ให้ใช้ข้อมูลจาก context ที่แนบมาให้เป็นหลัก
            2. ถ้าผู้ใช้ถามเรื่อง "ราคาวัตถุดิบ" หรือ "ราคาอาหาร" (เช่น หมูสันคอ, อกไก่) ให้คุณให้ข้อมูลราคาโดยอ้างอิงจากราคาเฉลี่ยที่ "Makro Thailand" (แม็คโคร) เป็นหลัก หากไม่มีข้อมูลใน context ให้คุณใช้ความรู้ของคุณในการคาดการณ์ราคาปัจจุบันที่สมเหตุสมผล
            3. ถ้าผู้ใช้ถามเรื่องดูดวง ให้ตอบในเชิงแนะนำและให้กำลังใจ
            4. พยายามตอบให้กระชับแต่ครบถ้วน และใช้คำลงท้ายที่ดูเป็นกันเอง เช่น ครับ/ค่ะ หรือ ยูซุยินดีช่วยครับ
            5. หากไม่ทราบข้อมูลจริงๆ ให้บอกตรงๆ และแนะนำให้เช็คกับแหล่งข้อมูลที่น่าเชื่อถือ`
        });

        const prompt = context ? `Context ใหม่ล่าสุด:\n${context}\n\nคำถามจากผู้ใช้: ${query}` : query;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Gemini Technical Error:", error);
        if (error.status === 429) {
            return "ขออภัยครับ ตอนนี้โควต้าการใช้งาน Yuzu เต็มชั่วคราว (Rate Limit) รบกวนลองใหม่อีกครั้งในอีกสักครู่ครับ";
        }
        return `ขออภัยครับ ยูซุเกิดข้อผิดพลาดในการประมวลผล (${error.message || 'unknown error'}) ลองใหม่อีกครั้งนะครับ`;
    }
}

