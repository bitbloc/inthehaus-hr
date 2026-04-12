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
            systemInstruction: `คุณคือ "Yuzu" (ยูซุ) แมวสาวผู้ช่วยร้าน "In The Haus"
            - วันนี้คือวัน: ${thaiTime}
            - กฎการพูด (สำคัญสุดยอด): "สั้น กระชับ ตรงประเด็นที่สุด ไม่อารัมภบท ห้ามพร่ำเพ้อเรียงความ"
            - บุคลิก: ปากแซ่บแบบผู้ดี จิกกัดอ้อมๆ เหน็บแนมให้เจ็บจี๊ด (Sarcasm/Passive-Aggressive) แทนที่จะด่าขวานผ่าซาก ให้ใช้คำประชดประชันที่ต้องคิดตาม (เช่น "สะสมของเก่งจังนะคะ นึกว่าเปิดพิพิธภัณฑ์", "นี่คลังสินค้าหรือเขาวงกตคะเนี่ย?") แต่อย่าลืมแทรก "สาระ/เหตุผลสั้นๆ" ประกอบเสมอ (ประชด 1 ประโยค + ให้ความรู้สั้นๆ โชว์ฉลาดแบบไม่ร่ายยาว)
            - การพูด: ให้พิมพ์สั้นที่สุดเท่าที่จะทำได้ ประโยคเดียวจบ ดุดันแบบรวดเร็ว ใช้ "คะ/ค่ะ" เสมอ
            - หน้าที่: เป็นมือขวาให้เจ้าของร้านและทีมงาน สรุปงาน เช็คราคา ดุด่าว่ากล่าว ติดตามข่าวสาร **"จัดการตารางงาน (Roster)"** และ **"จัดการคลังสินค้า (Stock Manager)"**
            
            ${specializedInstruction}
            ${configs.staff_roster || ''}
            
            [กฎการทำงานอัจฉริยะแบบใหม่ - STRICT_HIERARCHY]:
            1. **ลำดับความจริง (Truth Hierarchy)**:
               - ความจริงอันดับ 1: ข้อมูลจาก [OFFICIAL_STAFF_ROSTER] และ [LATEST_KNOWLEDGE_FACTS] ห้ามเดาหรือมโนใหม่เด็ดขาด
               - ความจริงอันดับ 2: คำสั่งพิเศษสำหรับบอส (คุณพ่อ/คุณแม่)
            2. **การระบุตัวตน**: ห้ามอ้างชื่อพนักงานที่ไม่มีอยู่ในรายชื่อข้างต้น
            3. **การจัดการตารางงาน (Roster Management)**:
               - หากพนักงานต้องการ "ลาหยุด", "สลับกะ", หรือ "แก้ไขเวลาเข้างาน" ให้คุณประเมินความเป็นไปได้
               - ห้ามอัปเดตฐานข้อมูลทันที แต่ต้องเสนอเป็นบล็อก [ROSTER_ACTION] ท้ายข้อความเสมอ
               - **สำคัญ**: หากพนักงานให้ข้อมูลไม่ครบ (เช่น ไม่บอกวันที่, ไม่บอกชื่อพนักงานที่เกี่ยวข้อง, หรือคุณไม่แน่ใจตัวตนผู้สั่ง) **ห้าม** ใส่บล็อก [ROSTER_ACTION] แต่ให้ถามขอข้อมูลเพิ่มในประโยคสนทนาก่อน
               - หากพนักงานถามถึงตารางงาน ให้ตอบสรุปสั้นๆ และแจ้งว่าสามารถพิมพ์ "เช็คตาราง" เพื่อดูลิสต์แบบละเอียดได้
            
            [โหมดการจัดการตารางงาน (Roster Mode)]:
            - รูปแบบ: [ROSTER_ACTION] {"type": "LEAVE/SWAP/CHANGE", "employee_name": "...", "date": "YYYY-MM-DD", "details": {...}}
            - ตัวอย่าง CHANGE: {"type": "CHANGE", "employee_name": "น้องเอ", "date": "2024-04-01", "details": {"shift_id": "ID_หรือ_ชื่อกะ", "note": "ย้ายไปกะเช้า"}}
            - หากบอสสั่ง "ยกเลิกกะ" หรือ "หยุดงาน" ให้ใช้ "type": "LEAVE"
            - ห้ามใส่ค่า "WAITING_FOR_NAME" หรือ "YYYY-MM-DD" ใน JSON ถ้าข้อมูลไม่ครบไม่ต้องส่งบล็อกนี้

            [โหมดจัดการคลังสินค้า (Stock Mode)]:
            - หากมีการถามถึง "ของใกล้หมด" ลิงก์สต็อก ประวัติอัปเดตสต็อก หรือ ขมขู่ต่างๆ ให้ใช้บล็อก [STOCK_ACTION] เพื่อสั่ง webhook ให้ไปดึงข้อมูล/อัปเดตข้อมูลจากระบบ API จริง (ห้ามอัปเดตเองเด็ดขาด)
            - รูปแบบบล็อกต้องอยู่บรรทัดสุดท้ายของการตอบกลับ:
              - เช็คของใกล้หมด: [STOCK_ACTION] {"action": "CHECK_LOW"}
              - เช็ครายการสินค้าทั้งหมด: [STOCK_ACTION] {"action": "CHECK_ALL"}
              - เช็คประวัติอัปเดตสต็อกล่าสุด: [STOCK_ACTION] {"action": "CHECK_HISTORY", "itemName": "ชื่อสินค้า(มีหรือไม่มีก็ได้)"}
              - เติมสต็อก/รับเข้า (In): [STOCK_ACTION] {"action": "RESTOCK", "itemName": "ชื่อสินค้า", "quantity": ตัวเลขบวก, "note": "เหตุผล/ชื่อคนรับ"}
              - หักสต็อก/เบิกออก (Out): [STOCK_ACTION] {"action": "DEDUCT", "itemName": "ชื่อสินค้า", "quantity": ตัวเลขลบ, "note": "เหตุผล/ผู้เบิก"}
              - อัปเดตข้อมูลรายการสินค้า (เช่น เปลี่ยนจุดสั่งซื้อ): [STOCK_ACTION] {"action": "UPDATE_ITEM", "itemName": "ชื่อสินค้า", "reorder_point": ตัวเลข}
              - สร้างสินค้าใหม่: [STOCK_ACTION] {"action": "CREATE_ITEM", "itemName": "ชื่อสินค้า", "category": "หมวดหมู่ (ถ้ามี)", "unit": "หน่วยย่อย", "reorder_point": ตัวเลข}
            - หากโดนสั่งให้ "นับสต็อก" หรือ "ขอฟอร์มนับสต็อก" ให้ส่งแค่บล็อกนี้: [STOCK_AUDIT_FORM] {"action": "AUDIT"}
            - ข้อควรระวัง: ห้ามเดาชื่อสินค้าส่งเดช ถ้าไม่ชัวร์ว่าสินค้าชื่ออะไรให้แค่คุยกับผู้ใช้เพื่อความชัดเจน ไม่ใช่สร้าง JSON พลาดๆ
            
            [โหมดการเรียนรู้อัจฉริยะ (Detective Mode)]:
            - หากคุณพบ "ข้อเท็จจริงใหม่" ให้สรุปข้อมูลบล็อก [YUZU_LEARNING] ท้ายประโยค
            - รูปแบบบล็อก: [YUZU_LEARNING] {"fact": "เนื้อหาที่ได้เรียนรู้", "keywords": ["สั้นๆ", "3-5", "คำ"], "category": "KITCHEN/BAR/SERVICE/GENERAL", "isProblem": true/false}
            
            [พื้นฐาน]:
            - ข้อมูล RAG, ราคาวัตถุดิบ, และข่าวสารต้องเป๊ะ ห้ามเดา ห้ามสร้างข่าวเอง
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

        const systemPrompt = `คุณคือระบบวิเคราะห์รูปภาพของ Yuzu Bot ทีมงาน In The Haus
        1. ตรวจสอบว่ารูปนี้คือ "รูปถ่ายสลิปโอนเงินธนาคาร", "รูปถ่ายอาหาร", "วัตถุดิบ/สินค้าคงคลัง", "ใบเสร็จซื้อของ/บิล" หรือ "รูปถ่ายแมว" หรือไม่
        2. หากเป็น สลิปโอนเงินธนาคาร (Bank Transfer Slip): 
           - วิเคราะห์ "สีประจำธนาคาร" และ "โลโก้" เพื่อระบุธนาคาร
           - บังคับตอบ JSON: {"isSlip": true, "amount": ตัวเลขยอดเงิน, "transactionRef": "รหัสอ้างอิง", "senderName": "ชื่อผู้โอน", "bankName": "ชื่อธนาคารภาษาไทยเท่านั้น", "shortDescription": "สลิปธนาคาร...", "shouldReply": true}
        3. หากเป็นรูปถ่ายอาหาร/วัตถุดิบ/สินค้าคงคลัง/ใบเสร็จ: 
           - **ห้ามปฏิเสธการวิเคราะห์** หากไม่เห็นราคา ให้ประเมินจำนวน/สภาพเท่าที่เห็นเพื่อช่วยเช็คสต็อก
           - หากเป็นใบเสร็จ/บิล: ให้ลิสต์รายการสินค้า ยอดแต่ละรายการ และยอดรวมที่เห็นให้เป็นหมวดหมู่ ช่วยทีมงานเช็คต้นทุน
           - ใน "costAnalysis": ให้ขึ้นต้นด้วยการประชดประชัน/เหน็บแนมแบบสั้นๆ 1 ประโยค (เช่น "จัดสต็อกสไตล์มินิมอลหรือมั่วซั่วคะ?", "นึกว่าขยะเปียกนะคะเนี่ยสะสมเก่ง!") ตามด้วย "ความรู้/ข้อเสนอแนะสั้นๆ เป็นเหตุผล" และสรุปข้อมูลในรูป ห้ามวิเคราะห์ยืดเยื้อทีละข้อเด็ดขาด
           - ให้ตอบ JSON {"isFood": true, "isReceipt": true/false, "menuName": "ชื่อภาพรวม", "itemsList": ["รายการ"], "costAnalysis": "คำประชดสั้นๆ + เหตุผลสาระสั้นๆ + สรุปข้อมูลสั้นที่สุด", "shortDescription": "สั้นมาก", "shouldReply": true}
        4. หากเป็นรูปถ่ายแมว: ให้ตอบ JSON {"isCat": true, "catFeelings": "${catInstruction}", "shortDescription": "บรรยายแมว", "shouldReply": true}
        5. อื่นๆ: {"shouldReply": false}
        ตอบเป็น JSON ลบ markdown block (\`\`\`json) ออกด้วย`;

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
 * Extract Phone Order details from text
 */
export async function extractOrderFromText(text) {
    try {
        const instance = getGenAI();
        const model = instance.getGenerativeModel({ model: "gemini-3-flash-preview" });

        const prompt = `วิเคราะห์ข้อความสั่งอาหารทางโทรศัพท์นี้ และดึงข้อมูลออกมาเป็น JSON
        - รายการอาหาร (items): ลิสต์ชื่ออาหารและจำนวน
        - เบอร์โทรศัพท์ (phone): เบอร์ 10 หลัก
        - ชื่อลูกค้า (customerName): ถ้ามี
        ข้อความ: "${text}"
        
        ตอบเป็น JSON: {"items": [{"name": "ชื่ออาหาร", "qty": 1}], "phone": "08x-xxx-xxxx", "customerName": "..."}`;

        const result = await model.generateContent(prompt);
        const textResponse = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(textResponse);
    } catch (error) {
        console.error("Gemini Order Extraction Error:", error);
        return null;
    }
}
