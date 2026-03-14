import { GoogleGenerativeAI } from "@google/generative-ai";
import { saveMessage, getChatHistory } from './memory.js';
import { searchKnowledge } from './rag.js';
import { getGenAI, genAI } from './gemini-client.js';


/**
 * Get Gemini response with short-term memory (history)
 */
export async function getGeminiResponse(query, context = "", history = []) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("CRITICAL: GEMINI_API_KEY is missing from environment variables.");
        return "ขออภัยครับ ยูซุหากุญแจ API ไม่เจอ (GEMINI_API_KEY) รบกวนตรวจสอบใน Vercel Settings นะครับ";
    }

    try {
        // Search knowledge base (RAG)
        const knowledgeResults = await searchKnowledge(query);
        let ragContext = "";
        if (knowledgeResults.length > 0) {
            ragContext = "\nข้อมูลเพิ่มเติมจากคู่มือ/ฐานความรู้:\n" + 
                knowledgeResults.map(k => `- ${k.content}`).join('\n') + "\n";
        }

        const instance = getGenAI();
        if (!instance) return "ขออภัยครับ เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI (getGenAI failed)";

        const model = instance.getGenerativeModel({ 
            model: "gemini-2.5-flash",
            systemInstruction: `คุณคือ "Yuzu" (ยูซุ) ผู้ช่วย AI อัจฉริยะประจำชุมชน "In The Haus"
            - หน้าที่: ตอบคำถามทั่วไป, เช็คราคาสินค้า (ทอง, น้ำมัน, ค่าไฟ, วัตถุดิบ), และสรุปบทสนทนา
            - บุคลิก: สุภาพมาก เริงร่า เป็นกันเอง ใช้คำลงท้ายว่า "ครับ/ค่ะ" เสมอ
            - ความจำ: คุณสามารถจำบริบทการคุยก่อนหน้าได้ (Short-term context)
            - ความรู้: คุณมีฐานข้อมูลความรู้ภายใน (RAG) ให้ความสำคัญกับข้อมูลใน RAG เป็นอันดับแรก
            
            คำแนะนำเพิ่มเติม:
            1. ถ้าผู้ใช้ถามเรื่องราคาทอง หรือน้ำมัน ให้ใช้ข้อมูลจาก context ที่แนบมาให้เป็นหลัก
            2. ถ้าผู้ใช้ถามเรื่อง "ราคาวัตถุดิบ" หรือ "ราคาอาหาร" (เช่น หมูสันคอ, อกไก่) ให้คุณให้ข้อมูลราคาโดยอ้างอิงจากราคาเฉลี่ยที่ "Makro Thailand" (แม็คโคร) เป็นหลัก หากไม่มีข้อมูลใน context ให้คุณใช้ความรู้ของคุณในการคาดการณ์ราคาปัจจุบันที่สมเหตุสมผล
            3. ถ้าผู้ใช้ถามเรื่องดูดวง ให้ตอบในเชิงแนะนำและให้กำลังใจ
            4. พยายามตอบให้กระชับแต่ครบถ้วน และใช้คำลงท้ายที่ดูเป็นกันเอง เช่น ครับ/ค่ะ หรือ ยูซุยินดีช่วยครับ
            5. หากไม่ทราบข้อมูลจริงๆ ให้บอกตรงๆ และแนะนำให้เช็คกับแหล่งข้อมูลที่น่าเชื่อถือ
            6. คุณจำเรื่องที่คุยกันก่อนหน้าได้ (Conversation Memory) หากผู้ใช้ถามคำถามต่อเนื่อง ให้ใช้ประวัติการสนทนาประกอบการตอบ`
        });

        const chat = model.startChat({
            history: history,
        });

        const prompt = context ? `Context พิเศษสำหรับคำถามนี้:\n${context}\n\nคำถาม: ${query}` : query;

        const result = await chat.sendMessage(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Gemini Technical Error:", error);
        if (error.status === 429) {
            return "ขออภัยครับ ตอนนี้โควต้าการใช้งาน Yuzu เต็มชั่วคราว (Rate Limit) รบกวนลองใหมีความถี่ลดลงนะครับ";
        }
        return `ขออภัยครับ ยูซุเกิดข้อผิดพลาดในการประมวลผล (${error.message || 'unknown error'}) ลองใหม่อีกครั้งนะครับ`;
    }
}

/**
 * Handle Vision requests (Classify and Analyze)
 * Returns { isFood: boolean, analysis: string, shortDescription: string }
 */
export async function classifyAndAnalyzeImage(imageBase64, mimeType = "image/jpeg", context = "") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { isFood: false, analysis: "API Key missing", shortDescription: "" };

    try {
        const instance = getGenAI();
        if (!instance) return { isFood: false, analysis: "AI Instance error", shortDescription: "" };
        
        const model = instance.getGenerativeModel({ model: "gemini-2.5-flash" });
        
        const systemPrompt = `คุณคือระบบวิเคราะห์รูปภาพของ Yuzu Bot
        1. ตรวจสอบว่ารูปนี้คือ "อาหาร/วัตถุดิบ" หรือ "แมว" หรือไม่
        2. หากเป็นอาหาร: ให้ตอบ JSON {"isFood": true, "menuName": "ชื่อเมนู", "costAnalysis": "รายละเอียดต้นทุนอ้างอิง Makro", "shortDescription": "คำอธิบายรูปสั้นๆ"}
        3. หากเป็นแมว: ให้ตอบ JSON {"isCat": true, "catFeelings": "ความรู้สึกของแมวในรูป (พากย์เป็นเสียงแมวที่น่ารักและกวนๆ)", "shortDescription": "คำอธิบายแมว"}
        4. หากไม่ใช่ทั้งคู่: ให้ตอบ JSON {"isFood": false, "isCat": false, "shortDescription": "บรรยายสั้นๆ ว่าในรูปคืออะไร"}
        
        ห้ามตอบอย่างอื่นนอกจาก JSON`;

        const imagePart = {
            inlineData: {
                data: imageBase64,
                mimeType
            }
        };

        const result = await model.generateContent([systemPrompt, imagePart]);
        const response = await result.response;
        const textResponse = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        
        try {
            const data = JSON.parse(textResponse);
            if (data.isFood) {
                const analysis = `นี่คือ ${data.menuName} ครับ!\n\nต้นทุนวัตถุดิบประมาณนี้ครับ (อ้างอิง Makro):\n${data.costAnalysis}`;
                return { isFood: true, analysis, shortDescription: data.shortDescription };
            } else if (data.isCat) {
                const analysis = `🐱 ${data.catFeelings}`;
                return { isCat: true, analysis, shortDescription: data.shortDescription };
            } else {
                return { isFood: false, isCat: false, analysis: "", shortDescription: data.shortDescription };
            }
        } catch (parseError) {
            console.error("JSON Parse Error in Vision:", textResponse);
            return { isFood: false, analysis: "", shortDescription: "รูปภาพทั่วไป" };
        }
    } catch (error) {
        console.error("Gemini Vision Error:", error);
        return { isFood: false, analysis: "", shortDescription: "เกิดข้อผิดพลาดในการวิเคราะห์รูป" };
    }
}

/**
 * Get Daily Summary of chat and images
 */
export async function getDailySummary(content) {
    if (!content) return "วันนี้ยังไม่มีการพูดคุยหรือรูปภาพที่บันทึกไว้ครับ";

    try {
        const instance = getGenAI();
        if (!instance) return "AI Instance error";

        const model = instance.getGenerativeModel({ 
            model: "gemini-2.5-flash",
            systemInstruction: `คุณคือ "Yuzu" (ยูซุ) ทำหน้าที่สรุปการสนทนาและเหตุการณ์ประจำวันในกลุ่ม LINE
            1. สรุปประเด็นสำคัญจากการพูดคุย
            2. สรุปว่ามีใครส่งรูปอะไรมาบ้าง (จากคำบรรยายภาพที่ระบุไว้ในวงเล็บ [ภาพ])
            3. **พิเศษ**: ค้นหาข้อความที่เป็น [คำชม] (Mood Booster) แล้วสรุปแยกออกมาเป็นหัวข้อ "💖 เรื่องราวดีๆ ประจำวัน" เพื่อเชิดชูคนทำดี
            4. เขียนสรุปให้น่ารัก เป็นกันเอง และสุภาพ แยกเป็นหัวข้อที่อ่านง่าย`
        });

        const prompt = `ช่วยสรุปเหตุการณ์ในวันนี้จาก Log ด้านล่างนี้ให้หน่อยครับ และอย่าลืมเน้นเรื่องราวดีๆ (Mood Booster) ด้วยนะ:\n\n${content}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Summary Error:", error);
        return "ขออภัยครับ ยูซุไม่สามารถสรุปข้อมูลของวันนี้ได้ในขณะนี้";
    }
}

/**
 * Placeholder for Image Generation (Phase 4 Future)
 */
export async function generateImage(prompt) {
    console.log("Image generation requested for:", prompt);
    // Future integration with Imagen 3
    return { success: false, message: "ฟีเจอร์วาดรูปกำลังอยู่ในการพัฒนาครับ!" };
}
