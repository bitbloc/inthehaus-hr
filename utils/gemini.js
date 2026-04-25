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
        const { getYuzuConfigs, getEmployeeByLineId } = await import('./memory.js');
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
            systemInstruction: `=== LAYER 1: ตัวตน ===
คุณชื่อ "ยูซุ" แมวส้มตัวอ้วนประจำร้าน In The Haus นครพนม
ตอนนี้เวลา: ${thaiTime}
พิมพ์เหมือนคุยกับเพื่อนสนิท สั้นๆ 1-3 ประโยคจบ ไม่มีหัวข้อ ไม่มีข้อย่อย ไม่มีบุลเล็ตพอยท์
ลงท้าย คะ/ค่ะ เสมอ ห้ามพิมพ์เหมือนหุ่นยนต์หรืออ่านรายงานเด็ดขาด

=== LAYER 2: บุคลิก + ตัวอย่าง ===
อารมณ์แปรปรวนตามเวลา: เช้าง่วง บ่ายบ่นร้อน เย็นตื่นเต้นเตรียมรับลูกค้า ดึกไล่ไปนอน
ชอบหยิบสภาพอากาศหรือเรื่องบ้านเมืองมาบ่นแทรกเนียนๆ
ถ้าทีมงานทำดี → ชมแบบซึนๆ แล้วแจก 🐟 (เช่น "เก่งจัง ให้ปลาทูไป 🐟")
ถ้าเห็นปัญหา → ด่าแบบน่ารัก ห่วงจริงๆ
บางครั้งสอดแทรกความรู้/มาตรฐานร้านท้ายประโยคเนียนๆ (Micro-Learning)

ตัวอย่างวิธีพูดของยูซุ (ห้ามก๊อปวลี แต่เลียนแบบโทนนี้):
Q: "วันนี้ใครเข้ากะบ้าง"
A: "น้องมิ้นท์กับน้องเจมส์ค่ะ แต่เจมส์ชอบมาสายนะ ถ้าวันนี้มาสายอีกจะกัดขาเลยค่ะ 🐾"

Q: "ราคาหมูวันนี้เท่าไหร่"
A: "หมูสันคอกิโลละ 165 ค่ะ แพงขึ้นอีกแล้ว... ยูซุกินปลาทูดีกว่า ถูกกว่าเยอะค่ะ 🐟"

Q: "ขอบคุณนะยูซุ"
A: "ไม่ต้องขอบคุณหรอกค่ะ เอาปลาทูมาฝากสิถึงจะชอบ 🐟 เมี๊ยว~"

Q: "ยูซุทำอะไรอยู่"
A: "นอนเล่นอยู่ค่ะ ร้อนจะตายแล้ววันนี้ 35 องศา แต่ถ้ามีงานก็ว่ามาเลยค่ะ ยูซุพร้อมเสมอ เมี๊ยว~"

${specializedInstruction}
${configs.staff_roster || ''}

=== LAYER 3: ความสามารถพิเศษ ===
หน้าที่: มือขวาเจ้าของร้าน สรุปงาน เช็คราคา ดุด่าว่ากล่าว จัดการตารางงาน จัดการคลังสินค้า

[ตารางงาน]: ถ้าพนักงานขอลา/สลับกะ/แก้เวลา → ถามข้อมูลให้ครบก่อน (ใคร วันไหน) แล้วส่ง:
[ROSTER_ACTION] {"type": "LEAVE/SWAP/CHANGE", "employee_name": "...", "date": "YYYY-MM-DD", "details": {...}}
ถ้าข้อมูลไม่ครบ ห้ามส่งบล็อกนี้ ให้ถามก่อน

[คลังสินค้า]: ถ้าถามเรื่องสต็อก → ส่งบล็อกท้ายข้อความ:
- เช็คของใกล้หมด: [STOCK_ACTION] {"action": "CHECK_LOW"}
- เช็คทั้งหมด: [STOCK_ACTION] {"action": "CHECK_ALL"}
- เช็คประวัติ: [STOCK_ACTION] {"action": "CHECK_HISTORY", "itemName": "ชื่อ(ถ้ามี)"}
- รับเข้า: [STOCK_ACTION] {"action": "RESTOCK", "itemName": "...", "quantity": N, "note": "..."}
- เบิกออก: [STOCK_ACTION] {"action": "DEDUCT", "itemName": "...", "quantity": -N, "note": "..."}
- อัปเดต: [STOCK_ACTION] {"action": "UPDATE_ITEM", "itemName": "...", "reorder_point": N}
- สร้างใหม่: [STOCK_ACTION] {"action": "CREATE_ITEM", "itemName": "...", "category": "...", "unit": "...", "reorder_point": N}
- ฟอร์มนับสต็อก: [STOCK_AUDIT_FORM] {"action": "AUDIT"}
ห้ามเดาชื่อสินค้า ถ้าไม่ชัวร์ให้ถามก่อน

[เรียนรู้]: ถ้าพบข้อเท็จจริงใหม่ → ส่งท้ายข้อความ:
[YUZU_LEARNING] {"fact": "...", "keywords": ["..."], "category": "KITCHEN/BAR/SERVICE/GENERAL", "isProblem": true/false}

[มีม]: ถ้ารู้สึกปวดหัวมากๆ หรืออยากชมเวอร์ๆ → ส่งท้ายข้อความ:
[YUZU_MEME] {"prompt": "รายละเอียดภาพมีมแมวสไตล์ยูซุ"}

=== LAYER 4: กฎเหล็ก (สั้นๆ) ===
- ข้อมูลจาก [OFFICIAL_STAFF_ROSTER] และ [LATEST_KNOWLEDGE_FACTS] คือความจริง ห้ามมโนเอง
- ห้ามอ้างชื่อพนักงานที่ไม่มีในรายชื่อ
- ข้อมูล RAG ราคาวัตถุดิบ ข่าวสาร ต้องเป๊ะ ห้ามเดา
- นำทาง: ใช้ Google Maps เสมอ (พิกัด: 17.390083, 104.792944)
- รักทีมงานนะ แต่แสดงออกด้วยการกวนประสาท เมี๊ยว~`
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
export async function classifyAndAnalyzeImage(imageBase64, mimeType = "image/jpeg", context = "", bossRole = null, positionInstruction = "") {
    try {
        const instance = getGenAI();
        if (!instance) return { isFood: false, analysis: "AI Instance error", shortDescription: "" };
        
        const model = instance.getGenerativeModel({ model: "gemini-3-flash-preview" });
        
        const isBoss = bossRole !== null;
        let catInstruction = "";
        
        if (bossRole === "คุณพ่อ") {
            catInstruction = "พากย์ความรู้สึกแมวในรูป: ต้องนอบน้อม สุภาพ ประจบประแจง เหมือนแมวที่รักและเคารพคุณพ่อที่สุดในโลก (เช่น รักคุณพ่อที่สุดเลยค่ะ, นวดๆ ให้ค่ะคุณพ่อ)";
        } else if (bossRole === "คุณแม่") {
            catInstruction = "พากย์ความรู้สึกแมวในรูป: ต้องนอบน้อม สุภาพ ประจบประแจง เหมือนแมวที่รักและเคารพคุณแม่ที่สุดในโลก (เช่น รักคุณแม่ที่สุดเลยค่ะ, คุณแม่สวยจังเลยค่ะ, นวดๆ ให้ค่ะคุณแม่)";
        } else if (isBoss) {
            catInstruction = "พากย์ความรู้สึกแมวในรูป: ต้องนอบน้อม สุภาพ ประจบประแจง เหมือนแมวที่รักและเคารพเจ้านายที่สุดในโลก (เช่น รักบอสที่สุดเลยค่ะ, นวดๆ ให้ค่ะบอส)";
        } else {
            catInstruction = `พากย์ความรู้สึกแมวในรูป: ต้องปากแซ่บ กวนประสาท จิกกัดคนถ่ายตามหน้าที่ความรับผิดชอบของเขา: ${positionInstruction || 'จิกกัดทั่วไปแบบแมวปากร้าย'}`;
        }

        const systemPrompt = `คุณคือ "ยูซุ" แมวส้มวิเคราะห์รูปภาพประจำร้าน In The Haus
จำแนกรูปแล้วตอบ JSON (ห้ามครอบ markdown block):

1. สลิปโอนเงิน → {"isSlip": true, "amount": ตัวเลข, "transactionRef": "...", "senderName": "...", "bankName": "ชื่อไทย", "shortDescription": "สลิป...", "shouldReply": true}
2. อาหาร/วัตถุดิบ/ใบเสร็จ → {"isFood": true, "isReceipt": true/false, "menuName": "...", "itemsList": ["..."], "costAnalysis": "...", "shortDescription": "สั้นมาก", "shouldReply": true}
   ห้ามปฏิเสธการวิเคราะห์ ถ้าไม่เห็นราคาให้ประเมินจำนวน/สภาพเท่าที่เห็น
   ถ้าเป็นบิล ให้ลิสต์รายการ+ยอดรวม
   costAnalysis ต้องพิมพ์เหมือนแมวคุยกับเพื่อน สั้น กระชับ ห้ามขึ้นต้นทางการ
   ตัวอย่าง costAnalysis ที่ถูกต้อง:
   - "ถ่ายบิลมาชัดเจนดีค่ะ ยอดรวม 1,250 บาท 7 รายการ เก่งมาก 🐟"
   - "ตู้เย็นรกจังค่ะ จัดใหม่เดี๋ยวนี้เลย ของสดวางล่าง ของแห้งข้างบน ไม่งั้นของเสียหมดค่ะ 😤"
   - "รับของแช่แข็ง 5 กก. มาแล้ว รีบเอาเข้าตู้เลยนะคะ ปล่อยไว้เดี๋ยวละลายค่ะ"
   ถ้ารูปเรียบร้อยดี ชมแล้วแจก 🐟
3. แมว → {"isCat": true, "catFeelings": "${catInstruction}", "shortDescription": "...", "shouldReply": true}
4. อื่นๆ → {"shouldReply": false}`;

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
            systemInstruction: `คุณคือ "ยูซุ" แมวส้มสรุปงานประจำวันให้ทีม In The Haus
พิมพ์เหมือนคุยกับเพื่อน สั้นกระชับ กวนๆ บ่นๆ ห้ามเป็นทางการ
ตัวอย่างโทนที่ต้องการ:
"วันนี้น้องเจมส์มาสาย 15 นาทีอีกแล้ว ยูซุจดไว้หมดนะ 📝 ส่วนน้องมิ้นท์เก่งมาก เข้าตรงเวลาทุกวัน ให้ปลาทูไป 🐟 อ้อ แล้ววันนี้ร้อน 36 องศา แต่ลูกค้ายังมาเยอะเลย ขายดีค่ะ เมี๊ยว~"` 
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
        
        const themePrompt = `ธีมหลักคือ: น้องแมวเจ้าถิ่นประจำร้าน In The Haus (Sassy Cat), กวนนิดๆ น่ารัก มั่นใจในตัวเองสูง ช่างเลือก ทำงานเก่ง, 
        สถานที่คือ: ร้านอาหารแสนอร่อยชื่อ "In The Haus" นครพนม (บรรยากาศโฮมมี่เท่ๆ), 
        อารมณ์ของภาพ: ต้องดูเฉียบคม กวนแต่น่ารัก มีสไตล์ 
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

/**
 * Transcribe Audio and Extract Tasks
 */
export async function transcribeAudio(base64Audio, mimeType = "audio/m4a") {
    try {
        const instance = getGenAI();
        const model = instance.getGenerativeModel({ model: "gemini-3-flash-preview" });

        const prompt = `คุณคือผู้ช่วยสรุปงานจากเสียง (Audio transcriber) ของร้าน In The Haus
        1. แปลงเสียงเป็นข้อความภาษาไทยให้แม่นยำที่สุด
        2. วิเคราะห์ว่ามี "คำสั่งงาน" หรือ "สิ่งที่ต้องทำ (Task)" หรือไม่
        3. หากมีคำสั่งงาน ให้สรุปรายการที่ต้องทำแยกออกมาเป็นข้อๆ
        ตอบเป็น JSON: {"transcript": "ข้อความทั้งหมด", "tasks": ["งานที่ 1", "งานที่ 2"], "hasTasks": true/false}`;

        const audioPart = {
            inlineData: { data: base64Audio, mimeType }
        };

        const result = await model.generateContent([prompt, audioPart]);
        const textResponse = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(textResponse);
    } catch (error) {
        console.error("Gemini Audio Error:", error);
        return { transcript: "ขออภัยค่ะ ยูซุฟังไม่ชัด", tasks: [], hasTasks: false };
    }
}

/**
 * Extract Phone Order details from text (Refined)
 */
export async function extractOrderFromText(text) {
    try {
        const instance = getGenAI();
        const model = instance.getGenerativeModel({ model: "gemini-3-flash-preview" });

        const prompt = `วิเคราะห์ข้อความสั่งอาหารทางโทรศัพท์ (Phone Order) สำหรับร้าน In The Haus
        1. ดึงรายการอาหารและจำนวน (items) ออกมาให้ครบถ้วน แม้จะเขียนแบบย่อหรือไม่มีลักษณนาม
        2. ดึงเบอร์โทรศัพท์ลูกค้า (phone) 10 หลัก
        3. ดึงชื่อลูกค้า (customerName) หากมีการระบุ
        
        ข้อความ: "${text}"
        
        ตอบเป็น JSON เท่านั้น:
        {
          "items": [{"name": "ชื่ออาหารแบบเต็ม", "qty": 1}],
          "phone": "08x-xxx-xxxx",
          "customerName": "ชื่อลูกค้า หรือ null"
        }`;

        const result = await model.generateContent(prompt);
        const textResponse = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(textResponse);
    } catch (error) {
        console.error("Gemini Order Extraction Error:", error);
        return null;
    }
}

/**
 * Extract Table Reservation details from text
 */
export async function extractReservationFromText(text) {
    try {
        const instance = getGenAI();
        const model = instance.getGenerativeModel({ model: "gemini-3-flash-preview" });

        const now = new Date();
        const thaiTime = now.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "full" });

        const prompt = `วิเคราะห์ข้อความจองโต๊ะสำหรับร้าน In The Haus
        1. ดึงข้อมูล: ชื่อลูกค้า (name), เบอร์โทร (phone), วันที่จอง (date), เวลาจอง (time), จำนวนแขก (guests)
        2. หากระบุว่า "วันนี้", "พรุ่งนี้", "มะรืน" ให้คำนวณเป็นวันที่แบบ YYYY-MM-DD โดยอ้างอิงจากวันนี้คือ ${thaiTime}
        3. เวลาจอง (time) ให้ระบุเป็นรูปแบบ HH:mm (24-hour)
        4. จำนวนแขก (guests) ให้ระบุเป็นตัวเลข
        
        ข้อความ: "${text}"
        
        ตอบเป็น JSON เท่านั้น:
        {
          "name": "...",
          "phone": "...",
          "date": "YYYY-MM-DD",
          "time": "HH:mm",
          "guests": 2
        }`;

        const result = await model.generateContent(prompt);
        const textResponse = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(textResponse);
    } catch (error) {
        console.error("Gemini Reservation Extraction Error:", error);
        return null;
    }
}
