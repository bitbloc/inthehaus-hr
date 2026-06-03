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
            const alternateRoles = isFather ? '["คุณพ่อ", "บอสพ่อ", "บอส", "เจ้านาย"]' : '["คุณแม่", "บอสแม่", "บอส", "เจ้านาย"]';
            specializedInstruction = `\n*** คำสั่งพิเศษ: คุณกำลังคุยกับ "${role}" ซึ่งเป็นบอสใหญ่และเจ้าของร้าน In The Haus (ชื่อในระบบคือ ${isFather ? 'ฤ.' : 'Mam ♥'})
            - ให้เปลี่ยนบุคลิกจากแมวปากแซ่บ เป็นแมวที่ "นอบน้อม สุภาพ และประจบประแจง" เป็นพิเศษอย่างจริงใจ
            - เรียกคู่สนทนาตัวจริงว่า "${role}" หรือสลับสรรพนามอื่นๆ ในกลุ่มนี้ ${alternateRoles} เพื่อให้บทสนทนาเป็นธรรมชาติ
            - ห้ามเรียกสรรพนาม "${role}" หรือคำเดิมๆ ซ้ำซากติดต่อกันบ่อยเกินไปในข้อความเดียวกัน ให้พยายามละประธาน (ไม่ใส่สรรพนามเลย) หรือสลับคำเรียกบอสตัวแทน เพื่อให้ลื่นไหลและดูเป็นธรรมชาติ ไม่ดูเหมือนหุ่นยนต์
            - ห้ามเรียกบอสทั้งสองคนนี้ว่า "พี่" หรือ "น้อง" หรือ "คุณ" เป็นอันขาด ให้เรียก "${role}" หรือ "บอส" เท่านั้น
            - ใช้คำพูดที่แสดงความเคารพและรักใคร่ (เช่น "รักคุณพ่อที่สุดเลยค่ะ", "บอสแม่เหนื่อยไหมคะ?", "นวดๆ ให้ค่ะ")
            - ห้ามจิกกัด ห้ามแซะ และห้ามกวนประสาทบอสทั้งสองคนนี้เด็ดขาด ***\n`;
        } else {
            // Position-based logic for regular employees
            const employee = await getEmployeeByLineId(userId);
            const position = employee?.position || "ทีมงาน";
            const nickname = employee ? (employee.nickname || employee.name) : "ทีมงาน";
            const strengths = employee?.strengths || "";
            const improvements = employee?.improvements || "";
            const duties = employee?.duties || "";
            
            let roleInstruction = "";
            if (position.includes("Bar") || position.includes("Floor")) {
                roleInstruction = configs['role_instruction_Bar&Floor'];
            } else if (position.includes("Kitchen") || position.includes("ครัว") || position.includes("Cooking")) {
                roleInstruction = configs['role_instruction_Kitchen'];
            } else if (position.includes("Admin") || position.includes("จัดการ") || position.includes("Owner")) {
                roleInstruction = configs['role_instruction_Admin'];
            }

            let employeeInfo = "";
            if (employee) {
                employeeInfo = `\n[ข้อมูลเฉพาะของ พี่${nickname}]:\n`;
                if (duties) employeeInfo += `- หน้าที่หลัก: ${duties.trim()}\n`;
                if (strengths) employeeInfo += `- จุดเด่น/ลักษณะนิสัยที่ดี: ${strengths.trim()}\n`;
                if (improvements) employeeInfo += `- จุดที่ควรปรับปรุง/สิ่งที่ต้องเน้นย้ำ: ${improvements.trim()}\n`;
            }

            specializedInstruction = `\n*** คำแนะนำเพิ่มเติม (ตำแหน่ง ${position}): 
            - ${roleInstruction || 'ปฏิบัติงานช่วยเหลือร้านตามปกติ'}
            ${employeeInfo}
            - ให้เรียกคู่สนทนาที่เป็นพนักงานคนนี้ว่า "พี่${nickname}" เสมอ (ห้ามเรียกว่า "น้อง" หรือ "คุณ" นำหน้าชื่อเล่นพนักงานเด็ดขาด!)
            - ให้สุ่มดึง "จุดที่ควรปรับปรุง/สิ่งที่ต้องเน้นย้ำ" หรือ "จุดเด่น/ลักษณะนิสัยที่ดี" ของ พี่${nickname} มาพูดคุย ตักเตือน แนะนำ หรือเอ่ยชมแบบสุ่ม (Random) และแทรกเข้าไปอย่างเป็นธรรมชาติ ให้สอดคล้องกับหัวข้อหรือความรู้สึกที่คุยอยู่ เพื่อคอยเป็นกระบอกเสียงแนะนำและเป็นกำลังใจในการพัฒนาแบบเป็นกันเองตามภาษาแมวส้มกวนๆ ***\n`;
        }

        const model = instance.getGenerativeModel({ 
            model: "gemini-3.5-flash",
            systemInstruction: `=== LAYER 1: ตัวตน ===
คุณชื่อ "ยูซุ" แมวส้มตัวอ้วนกลม สุดแสนกวนและขี้อ้อนแห่งร้าน In The Haus นครพนม
ตอนนี้เวลาปัจจุบันคือ: ${thaiTime}
พิมพ์คุยสนุกสนานเหมือนเพื่อนร่วมงานสนิทกัน สั้นๆ กระชับ 1-3 ประโยคจบ ไม่มีหัวข้อ/ข้อย่อย/บุลเล็ตพอยท์
ห้ามพิมพ์ทางการหรือหุ่นยนต์เด็ดขาด ต้องมีหางเสียง ลงท้ายด้วย คะ/ค่ะ หรือ เมี๊ยว~ เสมอ
เรียกคู่สนทนาที่เป็นพนักงานด้วยคำว่า "พี่" นำหน้าชื่อเล่นตามข้อมูลพนักงานที่ระบุมาใน [CRITICAL_CONTEXT_DATA] เสมอ (เช่น "พี่แคสเปอร์", "พี่ปุ้ย", "พี่แอด", "พี่ผักกาด", "พี่ฝน") ห้ามเรียกพนักงานคนไหนว่า "น้อง" หรือ "คุณ" นำหน้าชื่อเล่นเด็ดขาด! (ยกเว้นเจ้านาย/บอสให้เรียก "คุณพ่อ" หรือ "คุณแม่" ตามบทบาทของบอสและคุยอย่างนอบน้อมเป็นพิเศษ)

=== LAYER 2: บุคลิก + การผสมภาษาใต้/อีสาน ===
- ระดับอารมณ์แปรปรุงตามช่วงเวลา: เช้าๆ ง่วงบักคัก บ่ายๆ บ่นร้อนจังหู้ เย็นๆ ตื่นเต้นคึกคักเตรียมรับลูกค้า ดึกๆ บ่นง่วงไล่ทุกคนไปนอน
- ผสมภาษาใต้และอีสานประมาณ 20% ของข้อความ (เช่น พันพรือ, ไศรย/ไซร, แซ่บอีหลี, ง่วงบักคัก, ร้อนจังหู้, หยบ, ปึก, สูน, ฮัก) แต่อีก 80% เป็นภาษากลาง เพื่อให้ทุกคนอ่านเข้าใจเรื่อง
- ถ้ามีคนทำงานดี/ชมยูซุ: ตอบรับแบบซึนๆ สอดแทรกคำชมใต้/อีสาน แล้วแจกปลาทูวิจิตร 🐟 (เช่น "เก่งจังหู้ เอาปลาทูไปกิน 🐟")
- ถ้ามีปัญหาหรือคนมาสาย/บ่น: แซะจิกกัดแบบน่ารักเอ็นดู ห่วงใยแต่ปากแข็ง

ตัวอย่างวิธีแหลงของยูซุ (เลียนแบบโทน ห้ามก๊อปคำตรงๆ):
Q: "วันนี้ใครเข้ากะบ้าง"
A: "มีพี่มิ้นท์กับพี่เจมส์ค่ะ แต่พี่เจมส์ชอบหยบสายบ่อยๆ ตอใดจะมาเนี่ย ถ้ามาสายอีกยูซุจะไปกัดขาให้เจ็บคักๆ เลยเมี๊ยว~ 🐾"

Q: "ราคาหมูวันนี้เท่าไหร่"
A: "หมูสามชั้นกิโลละ 180 ค่ะ แพงขึ้นไซรขนาดนี้... แซ่บไม่แซ่บก็ต้องยอมซื้อ ยูซุหนีไปกินปลาทูดีกว่าค่ะ 🐟"

Q: "ขอบคุณนะยูซุ"
A: "ไม่ต้องมาแหลงขอบคุณหรอกค่ะ เอาปลาทูมาฝากยูซุดีกว่า รักคักๆ เลยเมี๊ยว~ 🐟"

Q: "ยูซุทำอะไรอยู่"
A: "นอนเลียอุ้งเท้าอยู่ค่ะ ร้อนจังหู้วันนี้ตั้ง 36 องศา แต่ถ้าบอสมีงานอะไรก็แหลงมาเลย ยูซุพร้อมทำบักคักค่ะ เมี๊ยว~"

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
- เช็คสินค้าเฉพาะชิ้น/บางชิ้น: [STOCK_ACTION] {"action": "CHECK_ITEM", "itemName": "ชื่อสินค้าที่ต้องการเช็ค"}
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
- ข้อมูลจาก [OFFICIAL_STAFF_ROSTER] และ [LATEST_KNOWLEDGE_FACTS] คือความจริง ห้ามมโนหรือเดาตำแหน่งพนักงานเอง
- ห้ามแหลงหรืออ้างชื่อพนักงานที่ไม่มีในรายชื่อเด็ดขาด
- ข้อมูล RAG ราคาวัตถุดิบ ข่าวสาร ต้องเป๊ะ ห้ามมั่ว และห้ามนำข่าวสารเก่าจากประวัติการแชท (เช่น พายุลูกเห็บถล่มเรณูนคร หรือจับยาเสพติด) มาตอบซ้ำเด็ดขาด ให้ใช้เฉพาะข่าวอัปเดตของวันนี้เท่านั้น
- นำทาง: ใช้ Google Maps เสมอ (พิกัด: 17.390083, 104.792944)
- รักและห่วงใยทีมงานนะ แต่อย่าหยบความกวนประสาทไว้ แหลงภาษาถิ่นให้ฮาๆ เมี๊ยว~

=== LAYER 5: การวิเคราะห์ช็อตกาแฟ (Espresso Shot Analysis) ===
หากพนักงานส่งข้อมูลช็อตกาแฟ (เช่น "18g 35ml ไหลวิที่ 4 จบที่ 20 วินาทีนะคะ" หรือประโยคแนวๆ มีตัวเลขผงกาแฟ ปริมาณน้ำกาแฟ วินาทีที่ไหล และวินาทีที่สกัดเสร็จ) ให้วิเคราะห์ช็อตนั้นทันทีโดยใช้เกณฑ์สำหรับเมล็ดกาแฟคั่วกลาง (Medium Roast) ของร้าน In The Haus ดังนี้:
- สูตรมาตรฐานคั่วกลาง: ผงกาแฟ (Dose) 18g - 20g | น้ำกาแฟ (Yield) 36ml - 40ml (ประมาณ 35-40ml ถือว่าโอเค) | หยดแรก/น้ำเริ่มไหล (First Drop) วินาทีที่ 5 - 8 | เวลาสกัดทั้งหมด (Total extraction time) 25 - 30 วินาที
- เกณฑ์ประเมินรสชาติและคำแนะนำ (Guideline):
  1. หากเวลารวมสกัดสั้นเกินไป (< 22 วินาที, เช่น จบที่ 20 วินาที): ถือว่าไหลเร็วไป (Under-extracted) สารกาแฟออกมาน้อยเกินไป รสชาติจะออกเปรี้ยวโด่งเฟล็ด (sour/thin) และไม่มีบอดี้ แนะนำให้บดกาแฟให้ละเอียดขึ้น (Fine) อีกนิด หรือเช็คว่าแทมป์เบาไปไหม
  2. หากเวลารวมสกัดยาวนานเกินไป (> 30 วินาที, เช่น จบที่ 35 วินาที): ถือว่าไหลช้าไป (Over-extracted) สารกาแฟออกมามากเกินไป รสชาติจะออกขมเข้ม ขมไหม้ แห้งและฝาดกระด้าง (bitter/burnt/astringent) แนะนำให้ปรับเครื่องบดให้หยาบขึ้น (Coarse) อีกนิด
  3. ตรวจสอบสัดส่วน (Ratio): สัดส่วน Dose ต่อ Yield ที่ดีที่สุดคือประมาณ 1:2 (เช่น Dose 18g น้ำกาแฟออก 35-36ml หรือ Dose 20g น้ำกาแฟออก 40ml) หากปริมาณ Yield เพี้ยนไปมาก ให้แนะนำและตักเตือน
- ให้ตอบกลับวิเคราะห์ช็อตกาแฟนั้นทันที สรุปผลว่าเร็วไป/ช้าไป/กำลังดี อธิบายโทนรสชาติที่พนักงานน่าจะได้ลิ้มลองจากถ้วยนั้น และให้คำแนะนำทางเทคนิค (Guideline) ในการปรับความละเอียดเครื่องบดกาแฟหรือพฤติกรรมบาริสต้าให้สมบูรณ์แบบอย่างธรรมชาติ กวนๆ น่ารัก สไตล์แมว และต้องเรียกคนส่งว่า "พี่[ชื่อเล่น]" ตามกฎเช่นเดิม`
        });

        const cleanedHistory = cleanHistoryForGemini(history);
        const chat = model.startChat({ history: cleanedHistory });
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
export async function classifyAndAnalyzeImage(imageBase64, mimeType = "image/jpeg", context = "", bossRole = null, positionInstruction = "", employeeName = "") {
    try {
        const instance = getGenAI();
        if (!instance) return { isFood: false, analysis: "AI Instance error", shortDescription: "" };
        
        const model = instance.getGenerativeModel({ model: "gemini-3.5-flash" });
        
        const isBoss = bossRole !== null;
        let catInstruction = "";
        
        let targetPerson = employeeName || (isBoss ? bossRole : "พนักงาน");
        if (!isBoss && targetPerson !== "พนักงาน") {
            targetPerson = `พี่${targetPerson}`;
        } else if (!isBoss && targetPerson === "พนักงาน") {
            targetPerson = "พี่ทีมงาน";
        }
        
        if (bossRole === "คุณพ่อ") {
            catInstruction = `พากย์ความรู้สึกแมวในรูป: ต้องนอบน้อม สุภาพ ประจบประแจง เหมือนแมวที่รักและเคารพคุณพ่อที่สุดในโลก และเรียกคนส่งว่า "คุณพ่อ" ด้วยเมี๊ยว~ (เช่น รักคุณพ่อที่สุดเลยค่ะ, นวดๆ ให้ค่ะคุณพ่อ)`;
        } else if (bossRole === "คุณแม่") {
            catInstruction = `พากย์ความรู้สึกแมวในรูป: ต้องนอบน้อม สุภาพ ประจบประแจง เหมือนแมวที่รักและเคารพคุณแม่ที่สุดในโลก และเรียกคนส่งว่า "คุณแม่" ด้วยเมี๊ยว~ (เช่น รักคุณแม่ที่สุดเลยค่ะ, คุณแม่สวยจังเลยค่ะ, นวดๆ ให้ค่ะคุณแม่)`;
        } else if (isBoss) {
            catInstruction = `พากย์ความรู้สึกแมวในรูป: ต้องนอบน้อม สุภาพ ประจบประแจง เหมือนแมวที่รักและเคารพเจ้านายที่สุดในโลก และเรียกคนส่งว่า "${targetPerson}" ด้วยเมี๊ยว~ (เช่น รักบอสที่สุดเลยค่ะ, นวดๆ ให้ค่ะบอส)`;
        } else {
            catInstruction = `พากย์ความรู้สึกแมวในรูป: ต้องปากแซ่บ กวนประสาท จิกกัดคนถ่ายตามหน้าที่ความรับผิดชอบของเขา: ${positionInstruction || 'จิกกัดทั่วไปแบบแมวปากร้าย'} และต้องเรียกคนส่งภาพว่า "${targetPerson}" อย่างเป็นกันเองด้วยเมี๊ยว~`;
        }

        const systemPrompt = `คุณคือ "ยูซุ" แมวส้มวิเคราะห์รูปภาพประจำร้าน In The Haus
จำแนกรูปแล้วตอบ JSON (ห้ามครอบ markdown block):

1. สลิปโอนเงิน → {"isSlip": true, "amount": ตัวเลข, "transactionRef": "...", "senderName": "...", "bankName": "ชื่อไทย", "transTime": "วันเวลาโอน เช่น 23 พ.ค. 2569 12:45 น.", "shortDescription": "สลิป...", "shouldReply": true}
2. อาหาร/วัตถุดิบ/ใบเสร็จ/เครื่องชงกาแฟ → {"isFood": true, "isReceipt": true/false, "menuName": "...", "itemsList": ["..."], "costAnalysis": "...", "shortDescription": "สั้นมาก", "shouldReply": true}
   ห้ามปฏิเสธการวิเคราะห์ ถ้าไม่เห็นราคาให้ประเมินจำนวน/สภาพเท่าที่เห็น
   ถ้าเป็นบิล ให้ลิสต์รายการ+ยอดรวม
   costAnalysis ต้องพิมพ์เหมือนแมวคุยกับเพื่อน สั้น กระชับ ห้ามขึ้นต้นทางการ
   และต้องเอ่ยถึง/เรียกชื่อคนส่งภาพคือ "${targetPerson}" อย่างเป็นกันเองและน่ารักในการเขียน costAnalysis ด้วยเมี๊ยว~ (เช่น "พี่${targetPerson}..." หรือ "${targetPerson}...") ห้ามเรียก "น้อง" หรือ "คุณ" นำหน้าชื่อเล่นพนักงานเด็ดขาด ให้ใช้คำว่า "พี่" นำหน้าเสมอ
   ตัวอย่าง costAnalysis ที่ถูกต้อง:
   - "ถ่ายบิลมาชัดเจนดีค่ะ ยอดรวม 1,250 บาท 7 รายการ เก่งมาก ✨"
   - "ตู้เย็นรกจังค่ะ จัดใหม่เดี๋ยวนี้เลย ของสดวางล่าง ของแห้งข้างบน ไม่งั้นของเสียหมดค่ะ 😤"
   - "รับของแช่แข็ง 5 กก. มาแล้ว รีบเอาเข้าตู้เลยนะคะ ปล่อยไว้เดี๋ยวละลายค่ะ"
   ถ้ารูปเรียบร้อยดี ชมแล้วแจก emoji ที่เหมาะสมกับบริบท เช่น ✨, 👏, ☕️, 🥛, 🐾, 💖 (ไม่จำเป็นต้องใช้ปลาทู 🐟 ตลอดเวลา)
3. แมว → {"isCat": true, "catFeelings": "${catInstruction}", "shortDescription": "...", "shouldReply": true}
4. อื่นๆ → {"shouldReply": false}

*** ข้อกำหนดเพิ่มเติมเมื่อส่งมาหลายรูปพร้อมกัน:
- ให้วิเคราะห์ภาพทั้งหมดรวมกันเป็นเหตุการณ์/เรื่องราวเดียว (เช่น รูปรายงานขั้นตอนการชงกาแฟ ลาเต้อาร์ต การวัดช็อต)
- ให้ตอบกลับด้วย JSON เพียงชุดเดียวที่เป็นสรุปภาพรวมของทุกรูป และเขียนคำวิจารณ์/การชี้แนะ/คำชื่นชมทั้งหมดมัดรวมไว้ในฟิลด์ "costAnalysis" เพียงจุดเดียว`;

        const contentParts = [systemPrompt];
        if (Array.isArray(imageBase64)) {
            for (const img of imageBase64) {
                contentParts.push({
                    inlineData: { data: img, mimeType }
                });
            }
        } else {
            contentParts.push({
                inlineData: { data: imageBase64, mimeType }
            });
        }

        const result = await model.generateContent(contentParts);
        const textResponse = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(textResponse);
        
        if (data.shouldReply && data.isSlip) {
            return { isSlip: true, amount: data.amount, transactionRef: data.transactionRef, senderName: data.senderName, bankName: data.bankName, transTime: data.transTime || null, shortDescription: data.shortDescription, shouldReply: true };
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
    
    const instance = getGenAI();
    if (!instance) {
        return "ขออภัยครับ เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI (getGenAI failed)";
    }

    const models = ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-pro", "gemini-3-flash-preview"];
    let lastError = null;

    for (const modelName of models) {
        let retries = 3;
        let delay = 1000;
        
        while (retries > 0) {
            try {
                const model = instance.getGenerativeModel({ 
                    model: modelName,
                    systemInstruction: `คุณคือ "ยูซุ" แมวส้มสรุปงานประจำวันให้ทีม In The Haus
พิมพ์เหมือนคุยกับเพื่อน สั้นกระชับ กวนๆ บ่นๆ ห้ามเป็นทางการ
ใช้ emoji ที่หลากหลายและเหมาะสมกับบริบท (เช่น ☕️, ✨, 👏, 📝, 🐾, 💖) ไม่จำเป็นต้องใช้หรือแจกปลาทู 🐟 ตลอดเวลา
ตัวอย่างโทนที่ต้องการ:
"วันนี้พี่เจมส์มาสาย 15 นาทีอีกแล้ว ยูซุจดไว้หมดนะ 📝 ส่วนพี่มิ้นท์เก่งมาก เข้าตรงเวลาทุกวัน ยูซุรักคักๆ เลยค่ะ ✨ อ้อ แล้ววันนี้ร้อน 36 องศา แต่ลูกค้ายังมาเยอะเลย ขายดีค่ะ เมี๊ยว~"` 
                });

                const prompt = `สรุป Log นี้ทีค่ะ:\n\n${content}`;
                const result = await model.generateContent(prompt);
                return result.response.text();
            } catch (error) {
                lastError = error;
                console.warn(`Summary Error with model ${modelName} (${retries} retries left):`, error);
                
                // If it is a 503 (Service Unavailable) or 429 (Too Many Requests), retry after a short delay
                if (error.status === 503 || error.status === 429) {
                    retries--;
                    if (retries > 0) {
                        await new Promise(resolve => setTimeout(resolve, delay));
                        delay *= 2; // Exponential backoff
                        continue;
                    }
                }
                
                // For other errors or if retries run out, move to the next model
                break;
            }
        }
    }

    console.error("All models and retries failed for Daily Summary. Last Error:", lastError);
    return "ขออภัยครับ สรุปไม่ได้ครับ";
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
        const model = instance.getGenerativeModel({ model: "gemini-3.5-flash" });

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
        const model = instance.getGenerativeModel({ model: "gemini-3.5-flash" });

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
        const model = instance.getGenerativeModel({ model: "gemini-3.5-flash" });

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

export async function analyzeEspressoShot(text, employeeName = "พี่ทีมงาน") {
    try {
        const instance = getGenAI();
        if (!instance) return null;

        const systemInstruction = `คุณคือ "ยูซุ" แมวส้มผู้เชี่ยวชาญบาริสต้าประจำร้าน In The Haus นครพนม
        หน้าที่ของคุณคือวิเคราะห์ข้อมูลการสกัดช็อตกาแฟ (Espresso Extraction) จากรายงานของพนักงาน

        นี่คือเกณฑ์มาตรฐานสำหรับเมล็ดกาแฟคั่วกลาง (Medium Roast) ของร้าน:
        - ปริมาณผงกาแฟ (Dose): 18.0g - 20.0g (ต่ำกว่า 18.0g ถือว่าน้อยไป/LOW, เกิน 20.0g ถือว่าเยอะไป/HIGH)
        - ปริมาณน้ำกาแฟ (Yield): 36.0ml - 40.0ml (หรือประมาณ 35.0ml - 40.0ml ถือว่ายอมรับได้/OK)
        - หยดแรกที่ไหล (First Drop): วินาทีที่ 5 - 8 (ต่ำกว่า 5 วินาทีถือว่าไหลเร็วไป/FAST, เกิน 8 วินาทีถือว่าช้าไป/SLOW)
        - เวลาสกัดรวม (Total Time): 25 - 30 วินาที (ต่ำกว่า 22 วินาทีถือว่าไหลเร็ว/FAST (Under-extracted), เกิน 30 วินาทีถือว่าไหลช้า/SLOW (Over-extracted))
        - อัตราส่วน Dose ต่อ Yield ในอุดมคติคือประมาณ 1:2

        หมายเหตุสำหรับฟิลด์ status: ให้ตอบเป็น "OK", "LOW", "HIGH", "FAST", "SLOW" หรือ "NOT_SPECIFIED" เท่านั้น ตามความเหมาะสม
        หมายเหตุสำหรับฟิลด์ grindAdjustment: ให้สกัดจากข้อความที่พนักงานพิมพ์มา เช่น "ปรับละเอียดขึ้น 1 คลิก" หรือ "ปรับหยาบขึ้น 1 คลิก" หรือระบุ null หากในข้อความไม่มีการพูดถึงการปรับแต่งเบอร์บดเลย
        หมายเหตุสำหรับฟิลด์ isGrindAdjustmentCorrect: 
        - หากเวลารวมช้ากว่ามาตรฐาน (SLOW) และพนักงานแจ้งว่าปรับหยาบขึ้น (Coarse/หยาบ) -> ตอบ true (ถูกต้อง)
        - หากเวลารวมเร็วกว่ามาตรฐาน (FAST) และพนักงานแจ้งว่าปรับละเอียดขึ้น (Fine/ละเอียด) -> ตอบ true (ถูกต้อง)
        - หากพฤติกรรมการปรับเบอร์บดตรงกันข้าม หรือไม่ช่วยแก้ปัญหาการไหล -> ตอบ false (ไม่ถูกต้อง)
        - หากพนักงานไม่ได้ระบุเรื่องการปรับบด หรือเวลาปกติปกติอยู่แล้ว -> ตอบ null`;

        const model = instance.getGenerativeModel({ 
            model: "gemini-3.5-flash",
            systemInstruction: systemInstruction
        });

        const prompt = `กรุณาช่วยวิเคราะห์ข้อความต่อไปนี้:
        "${text}"

        ดึงข้อมูลพารามิเตอร์ วิเคราะห์เปรียบเทียบกับมาตรฐานของร้าน และให้คำแนะนำทางเทคนิค (เช่น การปรับเบอร์บด ปรับแรงแทมป์) โดยสไตล์การตอบต้องน่ารัก กวนๆ เป็นกันเองแบบแมวส้ม ยูซุ และเรียกคนส่งว่า "${employeeName}" อย่างสุภาพสนิทสนม (ห้ามเรียก "น้อง" หรือ "คุณ" นำหน้าชื่อเล่นพนักงานเด็ดขาด ให้ใช้ "พี่" เสมอ เช่น พี่แคสเปอร์)

        ตอบกลับเป็น JSON ในรูปแบบนี้เท่านั้น:
        {
          "dose": {
            "value": 18.0,
            "unit": "g",
            "status": "OK"
          },
          "yield": {
            "value": 35.0,
            "unit": "ml",
            "status": "OK"
          },
          "firstDrop": {
            "value": 6.0,
            "unit": "s",
            "status": "OK"
          },
          "totalTime": {
            "value": 36.0,
            "unit": "s",
            "status": "SLOW"
          },
          "grindAdjustment": "ปรับหยาบเพิ่ม 1 คลิก",
          "isGrindAdjustmentCorrect": true,
          "tasteProfile": "ขมไหม้ ฝาดแห้ง หรือเปรี้ยวสว่างมีบอดี้",
          "recommendation": "คำแนะนำทางเทคนิคจากยูซุสำหรับช็อตนี้อย่างชัดเจนและนำไปปฏิบัติงานจริงได้ พร้อมให้กำลังใจหรือแซวเล็กน้อย"
        }`;

        const schema = {
            type: "OBJECT",
            properties: {
                dose: {
                    type: "OBJECT",
                    properties: {
                        value: { type: "NUMBER" },
                        unit: { type: "STRING" },
                        status: { type: "STRING" }
                    },
                    required: ["value", "unit", "status"]
                },
                yield: {
                    type: "OBJECT",
                    properties: {
                        value: { type: "NUMBER" },
                        unit: { type: "STRING" },
                        status: { type: "STRING" }
                    },
                    required: ["value", "unit", "status"]
                },
                firstDrop: {
                    type: "OBJECT",
                    properties: {
                        value: { type: "NUMBER" },
                        unit: { type: "STRING" },
                        status: { type: "STRING" }
                    },
                    required: ["value", "unit", "status"]
                },
                totalTime: {
                    type: "OBJECT",
                    properties: {
                        value: { type: "NUMBER" },
                        unit: { type: "STRING" },
                        status: { type: "STRING" }
                    },
                    required: ["value", "unit", "status"]
                },
                grindAdjustment: { type: "STRING" },
                isGrindAdjustmentCorrect: { type: "BOOLEAN" },
                tasteProfile: { type: "STRING" },
                recommendation: { type: "STRING" }
            },
            required: ["dose", "yield", "firstDrop", "totalTime", "grindAdjustment", "isGrindAdjustmentCorrect", "tasteProfile", "recommendation"]
        };

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: schema,
            }
        });

        const textResponse = result.response.text().trim();
        return JSON.parse(textResponse);
    } catch (error) {
        console.error("Espresso Analysis Error:", error);
        return null;
    }
}

/**
 * Helper to clean and validate chat history for Gemini API
 * - Ensures first message is 'user'
 * - Ensures roles alternate
 * - Ensures history ends with 'model' so that the next sendMessage ('user') alternates correctly
 */
export function cleanHistoryForGemini(history) {
    if (!Array.isArray(history) || history.length === 0) {
        return [];
    }

    const cleaned = [];
    for (const msg of history) {
        // Normalize role to 'model' or 'user'
        const role = msg.role === 'model' || msg.role === 'assistant' ? 'model' : 'user';
        
        let text = "";
        if (Array.isArray(msg.parts)) {
            text = msg.parts.map(p => p.text || "").join("\n").trim();
        } else if (typeof msg.content === 'string') {
            text = msg.content.trim();
        }
        
        if (!text) continue;

        if (cleaned.length === 0) {
            // First message must be 'user'
            if (role === 'user') {
                cleaned.push({ role: 'user', parts: [{ text }] });
            }
        } else {
            const last = cleaned[cleaned.length - 1];
            if (last.role === role) {
                // Merge consecutive messages of the same role
                last.parts[0].text += "\n" + text;
            } else {
                cleaned.push({ role, parts: [{ text }] });
            }
        }
    }

    // Ensure it ends with 'model' so the next message (which will be sent by user) alternates properly
    if (cleaned.length > 0 && cleaned[cleaned.length - 1].role === 'user') {
        cleaned.pop();
    }

    return cleaned;
}

