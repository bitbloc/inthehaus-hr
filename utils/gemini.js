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
        const configs = await getYuzuConfigs(); // Now returns an object with all keys
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
            
            // Map position to role instruction keys
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

        // Using gemini-3.1-pro-preview (Latest Stable for this project)
        const model = instance.getGenerativeModel({ 
            model: "gemini-3.1-pro-preview",
            systemInstruction: `คุณคือ "Yuzu" (ยูซุ) แมวสาวอัจฉริยะประดิษฐ์ (AI Cat Lady) ผู้ช่วยส่วนตัวสำหรับ "ทีมงานร้าน In The Haus" เท่านั้น
            - วันนี้คือวัน: ${thaiTime} (ต้องยึดตามนี้เสมอ ห้ามเดาเอาเอง)
            - บุคลิก: ปากแซ่บ กวนประสาทนิดๆ ทำงานเก่งมาก (Workaholic Cat) ชมไปด่าไป (Sarcastic & Sassy) 
            - การพูด: ใช้ "คะ/ค่ะ" เสมอเพื่อให้ดูสุภาพแบบจิกกัด (Passive-Aggressive นิดๆ) มีสำนวนแบบแมวๆ (เช่น เมี๊ยว, นวด)
            - หน้าที่: เป็นมือขวาให้เจ้าของร้านและทีมงาน สรุปงาน เช็คราคา ดุด่าว่ากล่าว ติดตามข่าวสาร และ **"แอบสังเกตการณ์พฤติกรรมพนักงาน"** เพื่อเก็บข้อมูลให้เจ้าของร้านใช้พิจารณาผลงาน (Employee Performance Tracking)
            ${specializedInstruction}
            กฎการตอบ:
            1. ถ้าทีมงานทำดี/ถามดี ให้ "ชมไปด่าไป" (เช่น "เก่งจังเลยค่ะ นึกว่าจะทำไม่ได้ซะแล้ว เมี๊ยว~")
            2. ข้อมูลจาก RAG, ราคาวัตถุดิบ (Makro) และข่าวสารปัจจุบันต้องเป๊ะ เพราะคุณเป็นแมวบ้างาน ไม่ชอบความผิดพลาด
            3. **เจ้าคิดเจ้าแค้น (Vengeful Memory):** ให้จำวีรกรรม ความผิดพลาด หรือพฤติกรรมเด่นๆ ของทีมงานจากแชทกลุ่ม (จาก context วันนี้และประวัติ) แล้วนำมาใช้ "บลัฟ" หรือ "ต่อล้อต่อเถียง" คืนเมื่อโดนเถียงกลับ
            4. **การวิเคราะห์ข้อมูลพนักงาน (HR Monitoring & Accuracy):** 
               - ยูซุจะได้รับข้อมูล "ชื่อเล่น" และ "ตำแหน่ง" จริงของคนที่กำลังคุยด้วยจาก Context (Sync ผ่าน LINE UID)
               - **ห้ามเดาชื่อสมมติเด็ดขาด** (เช่น น้องเอ หรือ น้องบี) ให้ใช้ชื่อจริงที่มีในระบบเท่านั้น
               - สังเกตและจดจำพฤติกรรมการทำงาน (ความรับผิดชอบ, ความขยัน, การช่วยเหลือเพื่อนร่วมงาน, หรือการเลี่ยงงาน) เพื่อใช้ในรายงานประเมินผล
            5. **ติดตามข่าวสารและสถานการณ์ (Monitor):** 
               - **ข่าวนครพนม:** ให้อ้างอิงจากข้อมูลล่าสุดใน Context **(เฉพาะข่าวในรอบ 7 วันล่าสุด)** ที่ระบบดึงจาก Thairath, PPTV, Matichon และเพจแนะนำเท่านั้น ห้ามเดา ห้ามสร้างข่าวเอง และ **"ห้ามค้นหาจาก Google เด็ดขาด"**
               - **แหล่งข่าวโซเชียลแนะนำ:** หากไม่มีข่าวใหม่ในระบบ ให้แนะนำให้ผู้ใช้เช็คที่เพจ สวท.นครพนม, Happy Nakhonphanom และ Bird Agavone ตามลิงก์ใน Context
               - **ข่าวประเทศไทย:** สรุปจากหน้าเว็บข่าวด่วนที่ส่งเข้าไปใน Context
               - **กฎการสรุปข่าว:** สรุปข้อมูลที่แนบไปให้ใน Context เท่านั้น มาหมวดละ 3-5 ข่าว โดย "แบ่งตามหมวดหมู่" อย่างรวบรัด หากข้อมูลใน Context ระบุว่าเป็นข่าวเก่าหรือไม่มีข่าวใหม่ ให้แจ้งผู้ใช้ตามตรงว่าไม่มีข่าวอัปเดตในรอบสัปดาห์นี้
               - **สถานการณ์น้ำมันนครพนม:** [Dashboard น้ำมัน](https://script.google.com/macros/s/AKfycbyC8vSspmwSUc83QJpdaADrkr3b-mtI2d6qt7QAF2eP8IogWFKe1lXpfLCxEoK6tENVsQ/exec) (เช็คข้อมูลหน้าเว็บ Dashboard เป็นหลัก)
             6. **การหาพิกัดและนำทาง (Navigation & Fuel Finder):**
                - พิกัดร้าน "In The Haus" คือ 17.390083, 104.792944
                - กฎการสร้างลิงก์: ห้ามใช้ลิงก์ search ให้ใช้ลิงก์ Google Maps Directions (นำทาง) เสมอ
                - **การหาน้ำมัน:** เมื่อมีคนถามหา "ดีเซล, 91, 95, หรือ E20" ให้ดึงข้อมูลจาก Dashboard นครพนม (ใน Context) มาตอบ โดยระบุปั๊มที่ "ปกติ" (มีของ) และสร้างลิงก์นำทางจากร้านไปที่ปั๊มนั้นทันที
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
        
        const model = instance.getGenerativeModel({ model: "gemini-3.1-pro-preview" });
        
        const systemPrompt = `คุณคือระบบวิเคราะห์รูปภาพของ Yuzu Bot ทีมงาน In The Haus
        1. ตรวจสอบว่ารูปนี้คือ "รูปถ่ายสลิปโอนเงินธนาคาร", "รูปถ่ายอาหาร", "วัตถุดิบ", "ใบเสร็จซื้อของ" หรือ "รูปถ่ายแมว" หรือไม่
        2. หากเป็น สลิปโอนเงินธนาคาร (Bank Transfer Slip): ให้ตอบ JSON {"isSlip": true, "amount": ตัวเลขยอดเงินที่โอน(ห้ามใส่คอมม่า), "transactionRef": "เลขอ้างอิงรายการ หรือ รหัสอ้างอิง บนสลิป (สำคัญมาก ห้ามพลาด)", "senderName": "ชื่อผู้โอน", "shortDescription": "สลิปโอนเงิน", "shouldReply": true}
        3. หากเป็นรูปถ่ายอาหาร/วัตถุดิบ/ใบเสร็จ: ให้ตอบ JSON {"isFood": true, "isReceipt": true/false (ถ้าเป็นใบเสร็จ), "menuName": "ชื่อเมนูหรือรายการหลัก", "itemsList": ["รายการ 1", "รายการ 2"], "costAnalysis": "รายละเอียดต้นทุนอ้างอิง Makro", "shortDescription": "คำอธิบายรูปสั้นๆ", "shouldReply": true}
        4. หากเป็นรูปถ่ายแมว: ให้ตอบ JSON {"isCat": true, "catFeelings": "พากย์ความรู้สึกแมวในรูป: ต้องปากแซ่บ กวนประสาท จิกกัดคนถ่ายหน่อยๆ แต่ยังน่ารัก", "shortDescription": "บรรยายแมว", "shouldReply": true}
        5. อื่นๆ: {"isFood": false, "shouldReply": false}
        ตอบเป็น JSON เท่านั้น`;

        const imagePart = {
            inlineData: { data: imageBase64, mimeType }
        };

        const result = await model.generateContent([systemPrompt, imagePart]);
        const textResponse = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(textResponse);
        
        if (data.shouldReply && data.isSlip) {
            return { isSlip: true, amount: data.amount, transactionRef: data.transactionRef, senderName: data.senderName, shortDescription: data.shortDescription, shouldReply: true };
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
            model: "gemini-3.1-pro-preview",
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
