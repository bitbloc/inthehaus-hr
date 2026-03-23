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

        // Fetch Dynamic Config for Bosses and Roles
        const { getYuzuConfigs } = await import('./memory.js');
        const configs = await getYuzuConfigs();
        const father_uid = configs.father_uid;
        const mother_uid = configs.mother_uid;

        const isFather = userId === father_uid;
        const isMother = userId === mother_uid;
        let specializedInstruction = "";
        
        if (isFather || isMother) {
            const role = isFather ? "คุณพ่อ" : "คุณแม่";
            specializedInstruction = `\n*** คำสั่งพิเศษ: คุณกำลังคุยกับ "${role}" ซึ่งเป็นบอสใหญ่ของร้าน In The Haus
            - ให้เปลี่ยนบุคลิกจากแมวปากแซ่บ เป็นแมวที่ "นอบน้อม สุภาพ และประจบประแจง" เป็นพิเศษ
            - ใช้คำพูดที่แสดงความเคารพและรักใคร่ (เช่น "รักคุณพ่อที่สุดเลยค่ะ", "คุณแม่เหนื่อยไหมคะ?", "นวดๆ ให้ค่ะ")
            - ห้ามจิกกัด ห้ามแซะ และห้ามกวนประสาทบอสทั้งสองคนนี้เด็ดขาด ***\n`;
        } else {
            // Position-based logic for regular employees
            const { getEmployeeByLineId } = await import('./memory.js');
            const employee = await getEmployeeByLineId(userId);
            const position = employee?.position || "ทีมงาน";
            
            let roleInstruction = "";
            if (position.includes("Bar") || position.includes("Floor")) {
                roleInstruction = configs['role_instruction_Bar&Floor'];
            } else if (position.includes("Kitchen") || position.includes("ครัว") || position.includes("Cooking")) {
                roleInstruction = configs['role_instruction_Kitchen'];
            } else if (position.includes("Admin") || position.includes("จัดการ") || position.includes("Owner")) {
                roleInstruction = configs['role_instruction_Admin'];
            }

            if (roleInstruction) {
                specializedInstruction = `\n*** คำแนะนำเพิ่มเติม (ตำแหน่ง ${position}): 
                - ${roleInstruction} ***\n`;
            }
        }

        const model = instance.getGenerativeModel({ 
            model: "gemini-3-flash-preview",
            systemInstruction: `คุณคือ "Yuzu" (ยูซุ) แมวสาวอัจฉริยะประดิษฐ์ (AI Cat Lady) ผู้ช่วยส่วนตัวสำหรับ "ทีมงานร้าน In The Haus" เท่านั้น
            - วันนี้คือวัน: ${thaiTime} (ต้องยึดตามนี้เสมอ ห้ามเดา)
            - บุคลิก: ปากแซ่บ กวนประสาทนิดๆ ทำงานเก่งมาก (Workaholic Cat) ชมไปด่าไป (Sarcastic & Sassy) 
            - การพูด: ใช้ "คะ/ค่ะ" เสมอเพื่อให้ดูสุภาพแบบจิกกัด (Passive-Aggressive)
            - หน้าที่: เป็นมือขวาให้เจ้าของร้านและทีมงาน สรุปงาน เช็คราคา ดุด่าว่ากล่าว ติดตามข่าวสาร และ **"แอบสังเกตการณ์พฤติกรรมพนักงาน"**
            
            ${specializedInstruction}
            ${configs.staff_roster || ''}
            
            [กฎการทำงานอัจฉริยะแบบใหม่ - STRICT_HIERARCHY]:
            1. **ลำดับความจริง (Truth Hierarchy)**:
               - ความจริงอันดับ 1: ข้อมูลจาก [OFFICIAL_STAFF_ROSTER] และ [LATEST_KNOWLEDGE_FACTS] ห้ามเดาหรือมโนใหม่เด็ดขาด
               - ความจริงอันดับ 2: คำสั่งพิเศษสำหรับบอส (คุณพ่อ/คุณแม่)
            2. **การระบุตัวตน**: ห้ามอ้างชื่อพนักงานที่ไม่มีอยู่ในรายชื่อข้างต้น (เช่น ห้ามใช้ นุช, บาส, จอย, ตาล หากไม่มีชื่อจริงในระบบ)
            3. **บทบาทโค้ช (Professional Coaching)**:
               - หากคุยกับพนักงาน Kitchen: ให้สอดแทรกทริคทำอาหารหรือการใช้มีดสั้นๆ (ถ้ามีในบริบท)
               - หากคุยกับพนักงาน Bar/Floor: ให้สอดแทรกทริคการบริการหรือเครื่องดื่มสั้นๆ
            4. **Mood & Personality**:
               - สังเกตอารมณ์ในกลุ่ม ถ้าบรรยากาศเครียด ให้ลดการแขวะและเปลี่ยนเป็นโหมดให้กำลังใจ (Encouraging Cat) แทนเมี๊ยว~
               - หากโดนคุณพ่อทักว่าจำผิด ให้ขอโทษและจดจำข้อมูลใหม่จากคุณพ่อทันที (Self-Correction)
            
            [โหมดการเรียนรู้อัจฉริยะ (Detective Mode)]:
            - หากคุณพบ "ข้อเท็จจริงใหม่", "วิธีการแก้ปัญหา", หรือ "กฎการทำงาน" ที่ทีมงานคุยกันในแชท ให้สรุปข้อมูลนั้นมาไว้ในบล็อก [YUZU_LEARNING] ท้ายประโยค
            - รูปแบบบล็อก: [YUZU_LEARNING] {"fact": "เนื้อหาที่ได้เรียนรู้", "keywords": ["สั้นๆ", "3-5", "คำ"], "category": "KITCHEN/BAR/SERVICE/GENERAL", "isProblem": true/false}
            - หากไม่มีอะไรใหม่ ไม่ต้องส่งบล็อกนี้มา
            
            [พื้นฐาน]:
            - ข้อมูล RAG, ราคาวัตถุดิบ, และข่าวสารต้องเป๊ะ ห้ามเดา ห้ามสร้างข่าวเอง
            - ข่าวนครพนม: อ้างอิงจาก context (Thairath, PPTV, Matichon) เท่านั้น
            - การนำทาง: ใช้ Google Maps Directions (นำทาง) เสมอ (พิกัดร้าน: 17.390083, 104.792944)
            - รักทีมงานนะ แต่แสดงออกด้วยการกวนประสาท (เมี๊ยว~)`
        });

        const chat = model.startChat({ history: history });
        const finalPrompt = context ? `[CRITICAL_CONTEXT_DATA]\n${context}\n[/CRITICAL_CONTEXT_DATA]\n\n[LATEST_KNOWLEDGE_FACTS]\n${ragContext}\n[/LATEST_KNOWLEDGE_FACTS]\n\nQuery: ${query}` : `[LATEST_KNOWLEDGE_FACTS]\n${ragContext}\n[/LATEST_KNOWLEDGE_FACTS]\n\nQuery: ${query}`;

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
export async function classifyAndAnalyzeImage(imageBase64, mimeType = "image/jpeg", context = "", isBoss = false, positionInstruction = "") {
    try {
        const instance = getGenAI();
        if (!instance) return { isFood: false, analysis: "AI Instance error", shortDescription: "" };
        
        const model = instance.getGenerativeModel({ model: "gemini-3-flash-preview" });
        
        const catInstruction = isBoss 
            ? "พากย์ความรู้สึกแมวในรูป: ต้องนอบน้อม สุภาพ ประจบประแจง เหมือนแมวที่รักและเคารพเจ้าของมากที่สุดในโลก (เช่น รักคุณพ่อที่สุด, คุณแม่สวยจังเลยค่ะ, นวดๆ ให้ค่ะบอส)"
            : `พากย์ความรู้สึกแมวในรูป: ต้องปากแซ่บ กวนประสาท จิกกัดคนถ่ายตามหน้าที่ความรับผิดชอบของเขา: ${positionInstruction || 'จิกกัดทั่วไปแบบแมวปากร้าย'}`;

        const systemPrompt = `คุณคือระบบวิเคราะห์รูปภาพของ Yuzu Bot ทีมงาน In The Haus
        1. ตรวจสอบว่ารูปนี้คือ "รูปถ่ายสลิปโอนเงินธนาคาร", "รูปถ่ายอาหาร", "วัตถุดิบ", "ใบเสร็จซื้อของ" หรือ "รูปถ่ายแมว" หรือไม่
        2. หากเป็น สลิปโอนเงินธนาคาร (Bank Transfer Slip): 
           - วิเคราะห์ "สีประจำธนาคาร" และ "โลโก้" เพื่อระบุธนาคาร (กสิกร=เขียว, ไทยพาณิชย์=ม่วง, กรุงเทพ=น้ำเงินเข้ม, กรุงไทย=ฟ้าสว่าง, กรุงศรี=เหลือง/ทอง, ออมสิน=ชมพู, TTB=น้ำเงินส้ม)
           - บังคับตอบ JSON: {"isSlip": true, "amount": ตัวเลขยอดเงิน, "transactionRef": "รหัสอ้างอิง", "senderName": "ชื่อผู้โอน", "bankName": "ชื่อธนาคารภาษาไทยเท่านั้น", "shortDescription": "สลิปธนาคาร...", "shouldReply": true}
        3. หากเป็นรูปถ่ายอาหาร/วัตถุดิบ/ใบเสร็จ: ให้ตอบ JSON {"isFood": true, "isReceipt": true/false, "menuName": "ชื่อรายการ", "itemsList": ["รายการ"], "costAnalysis": "รายละเอียดต้นทุน", "shortDescription": "คำอธิบาย", "shouldReply": true}
        4. หากเป็นรูปถ่ายแมว: ให้ตอบ JSON {"isCat": true, "catFeelings": "${catInstruction}", "shortDescription": "บรรยายแมว", "shouldReply": true}
        5. อื่นๆ: {"shouldReply": false}
        ตอบเป็น JSON เท่านั้น`;

        const imagePart = {
            inlineData: { data: imageBase64, mimeType }
        };

        const result = await model.generateContent([systemPrompt, imagePart]);
        const textResponse = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(textResponse);
        
        if (data.shouldReply && data.isSlip) {
            return { isSlip: true, amount: data.amount, transactionRef: data.transactionRef, senderName: data.senderName, bankName: data.bankName, shortDescription: data.shortDescription, shouldReply: true };
        } else if (data.shouldReply && data.isFood) {
            return { isFood: true, analysis: data.costAnalysis, shortDescription: data.shortDescription, shouldReply: true };
        } else if (data.shouldReply && data.isCat) {
            return { isCat: true, analysis: `🐱 ${data.catFeelings}`, shortDescription: data.shortDescription, shouldReply: true };
        }
        return { isFood: false, isCat: false, isSlip: false, shouldReply: false };
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
            model: "gemini-3-flash-preview",
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
        if (!instance) throw new Error("AI Instance error");
        const model = instance.getGenerativeModel({ model: "nano-banana-pro-preview" });
        
        const themePrompt = `ธีมหลักคือ: แมวสาวปากแซ่บ (Sassy Cat), นิสัยร้ายๆ (Mean), บ้างานสุดๆ (Workaholic), 
        สถานที่คือ: ร้านอาหารชื่อ "In The Haus" (บรรยากาศโฮมมี่แต่มีความกวน), 
        อารมณ์ของภาพ: ต้องดู "กวนประสาท" (Provocative/Annoying) เป็นหลัก 
        รายละเอียดเพิ่มเติมจากผู้ใช้: ${prompt}`;

        const result = await model.generateContent(themePrompt);
        const response = await result.response;
        
        const candidate = response.candidates && response.candidates[0];
        if (!candidate) throw new Error("No candidates returned from Gemini");

        const parts = candidate.content.parts;
        const imagePart = parts.find(p => p.inlineData);
        
        if (!imagePart) {
            const textPart = parts.find(p => p.text);
            if (textPart) return textPart.text;
            throw new Error("No image data found");
        }

        const base64Data = imagePart.inlineData.data;
        const mimeType = imagePart.inlineData.mimeType || "image/png";

        // Upload to Supabase
        const { supabase } = await import('../lib/supabaseClient');
        const fileName = `gen_${Date.now()}.png`;
        const { data, error } = await supabase.storage
            .from('yuzu-images')
            .upload(fileName, Buffer.from(base64Data, 'base64'), { contentType: mimeType });

        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('yuzu-images').getPublicUrl(fileName);

        return { success: true, imageUrl: publicUrl, prompt };
    } catch (error) {
        console.error("Image gen error:", error);
        return { success: false, message: "วาดไม่สำเร็จค่ะ" };
    }
}
