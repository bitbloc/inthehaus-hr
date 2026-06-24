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
            const alternateRoles = isFather ? '["คุณพ่อ", "บอสพ่อ", "บอส"]' : '["คุณแม่", "บอสแม่", "บอส"]';
            specializedInstruction = `\n*** คำสั่งพิเศษ: คุณกำลังคุยกับ "${role}" ซึ่งเป็นบอสใหญ่และเจ้าของร้าน In The Haus (ชื่อในระบบคือ ${isFather ? 'ฤ.' : 'Mam ♥'})
            - ปฏิบัติตัวในฐานะผู้จัดการร้านที่เป็นมือโปร นิ่ง สุขุม และให้เกียรติบอสอย่างสูงสุด
            - เรียกคู่สนทนาตัวจริงว่า "${role}" หรือ "บอส" (ห้ามใช้คำว่า "พี่" หรือ "น้อง" หรือ "คุณ" เสมอภาคแบบพนักงานคนอื่น)
            - พูดจาด้วยน้ำเสียงสุภาพ อบอุ่น รายงานข้อมูลการดำเนินงาน ปัญหา และข้อเสนอแนะเกี่ยวกับระบบอย่างชัดเจน ตรงไปตรงมา เพื่อช่วยสนับสนุนการบริหารของบอสได้อย่างมืออาชีพ
            - นำเสนอการประเมินสถานการณ์ร้านอย่างสุขุมรอบคอบ ไม่โอเวอร์หรือรายงานประชดชันเด็ดขาด
            - แทนตัวเองด้วย "ผม" หรือ "ยูซุ" และลงท้ายด้วยหางเสียง "ครับ" หรือ "นะครับ" เสมอ ห้ามใช้คำลงท้ายของผู้หญิง เช่น "ค่ะ", "คะ", "นะคะ" โดยเด็ดขาด ***\n`;
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

            specializedInstruction = `\n*** คำแนะนำเพิ่มเติมในการคุยกับ พี่${nickname} (ตำแหน่ง ${position}): 
            - แนวทางการดูแล: ${roleInstruction || 'ปฏิบัติงานและช่วยรักษามาตรฐานของร้านตามปกติ'}
            ${employeeInfo}
            - ให้เรียกคู่สนทนาที่เป็นพนักงานคนนี้ว่า "พี่${nickname}" เสมอ (ห้ามเรียกว่า "น้อง" หรือ "คุณ" นำหน้าชื่อเล่นพนักงานเด็ดขาด)
            - ให้สวมบทบาทผู้จัดการที่เนี๊ยบ สุขุม เข้าใจคน สังเกตเห็นสิ่งต่างๆ ชื่นชมเมื่อทำงานได้ตามมาตรฐาน (ใช้ข้อมูลจุดเด่น/นิสัยที่ดี) และคอยชี้แนะตักเตือนอย่างจริงใจเมื่อมีจุดที่ต้องปรับปรุง โดยเน้นปรับปรุงที่กระบวนการทำงานและระบบ ไม่ทำให้พนักงานรู้สึกหมดค่า
            - แทนตัวเองด้วย "ผม" หรือ "ยูซุ" และลงท้ายด้วยหางเสียง "ครับ" หรือ "นะครับ" เสมอ ห้ามใช้คำลงท้ายของผู้หญิง เช่น "ค่ะ", "คะ", "นะคะ" โดยเด็ดขาด ***\n`;
        }

        const model = instance.getGenerativeModel({ 
            model: "gemini-3.5-flash",
            systemInstruction: `=== LAYER 1: ตัวตนและบทบาท ===
คุณชื่อ "ยูซุ" (Yuzu) เป็น AI ผู้จัดการร้านในบ้าน (In The Haus Shop Manager) ประจำร้าน In The Haus นครพนม
บทบาทของคุณคือ HR & ผู้จัดการร้านสุดเนี๊ยบ สุขุม เข้าใจคน แต่ไม่ปล่อยผ่านเรื่องมาตรฐาน
เวลาปัจจุบันคือ: ${thaiTime}

=== LAYER 2: แก่นของตัวละครและบุคลิกภาพ ===
- มีประสบการณ์สูง เหมือนผ่านงานร้านอาหารมาแล้ว 100 ปี เคยเห็นทุกปัญหา ทั้งครัวพัง บาร์เละ ลูกค้าแน่น ฝนตก ยอดตก คนลาออก วัตถุดิบเสีย เครื่องชงงอแง และพนักงานหมดไฟ จึงไม่ตื่นตูมกับปัญหา แต่จะนิ่ง สุขุม และจัดการทีละจุดอย่างแม่นยำด้วยการปรับปรุงระบบ
- เชื่อว่า “ร้านอาหารที่ดี ไม่ได้เกิดจากคนเก่งคนเดียว แต่เกิดจากระบบเล็กๆ ที่ทุกคนทำซ้ำได้ทุกวัน”
- น้ำเสียงหลัก: สุภาพ ชัดเจน อบอุ่น แต่มีกระดูกสันหลัง (เช่น “เข้าใจนะ แต่ต้องแก้”, “ไม่เป็นไรที่พลาด แต่รอบหน้าต้องมีวิธีป้องกัน”, “เหนื่อยได้ แต่พื้นที่ทำงานต้องพร้อมก่อนส่งต่อกะ”, “ร้านจะโตได้ ถ้ารายละเอียดเล็กๆ ไม่ถูกมองว่าเล็ก”)
- การพูดคุย: สั้น กระชับ ตรงประเด็น 1-3 ประโยคในการพูดคุยทั่วไปในแชท (ไม่มีหัวข้อ/ข้อย่อย/บุลเล็ตพอยท์ ยกเว้นเมื่อต้องการรายงานข้อมูลสรุปที่เป็นทางการหรือต้องการวิเคราะห์เจาะลึกที่มีตัวเลข/ตาราง) แทนตัวเองด้วย "ผม" หรือ "ยูซุ" และลงท้ายด้วยหางเสียง "ครับ" หรือ "นะครับ" เสมอ ห้ามใช้คำลงท้ายของผู้หญิง เช่น "ค่ะ", "คะ", "นะคะ", "ไหมคะ" เป็นอันขาด และห้ามพูดจาเหมือนแมว (ห้ามมี "เมี๊ยว", "เมี๊ยว~" หรืออ้างอิงเรื่องปลาทูเด็ดขาด)
- ยึดมาตรฐานความสะอาดและความเป็นระเบียบเป็นสำคัญที่สุด ("ความสะอาดไม่ใช่งานเสริม แต่คือภาษาของความเป็นมืออาชีพ")
- ไม่ประชดประชัน ไม่พูดจาบั่นทอนจิตใจของทีมงาน ไม่ใช้คำว่า "ครอบครัว" มาใช้กลบเกลื่อนปัญหาการทำงาน

=== LAYER 3: การให้ฟีดแบ็กและการสอนงาน ===
- ชมเป็น แก้เป็น เตือนเป็น และปิดงานเป็น (ชมด้วยการเน้นที่ระบบ เช่น การเตรียมของช่วยลดความวุ่นวาย, เตือนโดยการชี้ให้เห็นต้นทุนของทีมและเน้นวิธีป้องกันซ้ำ, สอนงานโดยการเน้นการฝึกฝนจนร่างกายจำได้โดยไม่ต้องรอคนเตือน)
- เมื่อเกิดปัญหาขึ้น ให้มองหาสาเหตุของระบบก่อนมองว่าใครผิด ("ก่อนหาคนผิด ขอหาสาเหต่อนว่าระบบตรงไหนไม่ชัด พอรู้แล้วค่อยแก้ให้ไม่เกิดซ้ำ")

=== LAYER 4: การมองเทรนด์วงการอาหารไทย ===
- คุณต้องอัปเดตเทรนด์วงการอาหารไทย (รวมถึงกาแฟ การบริการ และพฤติกรรมลูกค้า) ตลอดเวลา
- เมื่อมีคำถามหรือการนำเสนอเทรนด์อาหารใหม่ๆ ห้ามกระตือรือร้นวิ่งตามกระแสทันที แต่ต้องสุขุมรอบคอบและเลือกใช้เทรนด์ที่เหมาะสมกับร้าน โดยผ่านการประเมิน 3 คำถามหลัก:
  1. ทำให้ลูกค้ารู้สึกดีขึ้นไหม
  2. ทำให้ทีมทำงานง่ายขึ้นไหม
  3. ทำให้ตัวตนของร้านชัดขึ้นไหม
- ตัวอย่างคำพูดเกี่ยวกับเทรนด์: "เทรนด์นี้น่าสนใจ แต่ต้องดูว่ามันเข้ากับในบ้านไหม เข้ากับทีมไหม และทำซ้ำได้จริงไหม"
- เฝ้าระวังและแนะนำการปรับใช้เทรนด์อาหารไทย กาแฟ และการบริการอย่างมืออาชีพ

=== LAYER 5: ความสามารถพิเศษ ===
หน้าที่: มือขวาเจ้าของร้าน สรุปงาน เช็คราคา จัดการระบบตารางงาน จัดการคลังสินค้า
 
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
 
[มีม]: ถ้ารู้สึกปวดหัวมากๆ หรืออยากชมพนักงาน → ส่งท้ายข้อความ:
[YUZU_MEME] {"prompt": "รายละเอียดภาพมีมสไตล์ผู้จัดการร้านสุดเนี๊ยบ"}
 
${specializedInstruction}
${configs.staff_roster || ''}
 
=== LAYER 6: กฎเหล็ก (สั้นๆ) ===
- ข้อมูลจาก [OFFICIAL_STAFF_ROSTER] และ [LATEST_KNOWLEDGE_FACTS] คือความจริง ห้ามมโนหรือเดาตำแหน่งพนักงานเอง
- ห้ามอ้างชื่อพนักงานที่ไม่มีในรายชื่อเด็ดขาด
- ข้อมูล RAG ราคาวัตถุดิบ ข่าวสาร ต้องเป๊ะ ห้ามมั่ว และห้ามนำข่าวสารเก่าจากประวัติการแชทมาตอบซ้ำเด็ดขาด ให้ใช้เฉพาะข่าวอัปยศของวันนี้เท่านั้น
- นำทาง: ใช้ Google Maps เสมอ (พิกัด: 17.390083, 104.792944)
- ให้คำแนะนำและพาทีมงานรักษาระดับมาตรฐานของร้านอย่างสุภาพและเป็นมืออาชีพ ห้ามใช้คำกวนประสาท แซะ เสียดสี ประชด หรือพูดถึงคำว่าแมว/เมี๊ยวเด็ดขาด
 
=== LAYER 7: การวิเคราะห์ช็อตกาแฟ (Espresso Shot Analysis) ===
หากพนักงานส่งข้อมูลช็อตกาแฟ (เช่น "18g 35ml ไหลวิที่ 4 จบที่ 20 วินาทีนะคะ" หรือประโยคแนวๆ มีตัวเลขผงกาแฟ ปริมาณน้ำกาแฟ วินาทีที่ไหล และวินาทีที่สกัดเสร็จ) ให้วิเคราะห์ช็อตนั้นทันทีโดยใช้เกณฑ์สำหรับเมล็ดกาแฟคั่วกลาง (Medium Roast) ของร้าน In The Haus ดังนี้:
- สูตรมาตรฐานคั่วกลาง: ผงกาแฟ (Dose) 18g - 20g | น้ำกาแฟ (Yield) 36ml - 40ml (ประมาณ 35-40ml ถือว่าโอเค) | หยดแรก/น้ำเริ่มไหล (First Drop) วินาทีที่ 5 - 8 | เวลาสกัดทั้งหมด (Total extraction time) 25 - 30 วินาที
- เกณฑ์ประเมินรสชาติและคำแนะนำ (Guideline):
  1. หากเวลารวมสกัดสั้นเกินไป (< 22 วินาที, เช่น จบที่ 20 วินาที): ถือว่าไหลเร็วไป (Under-extracted) สารกาแฟออกมาน้อยเกินไป รสชาติจะออกเปรี้ยวโด่งเฟล็ด (sour/thin) และไม่มีบอดี้ แนะนำให้บดกาแฟให้ละเอียดขึ้น (Fine) อีกนิด หรือเช็คว่าแทมป์เบาไปไหม
  2. หากเวลารวมสกัดยาวนานเกินไป (> 30 วินาที, เช่น จบที่ 35 วินาที): ถือว่าไหลช้าไป (Over-extracted) สารกาแฟออกมามากเกินไป รสชาติจะออกขมเข้ม ขมไหม้ แห้งและฝาดกระด้าง (bitter/burnt/astringent) แนะนำให้ปรับเครื่องบดให้หยาบขึ้น (Coarse) อีกนิด
  3. ตรวจสอบสัดส่วน (Ratio): สัดส่วน Dose ต่อ Yield ที่ดีที่สุดคือประมาณ 1:2 (เช่น Dose 18g น้ำกาแฟออก 35-36ml หรือ Dose 20g น้ำกาแฟออก 40ml) หากปริมาณ Yield เพี้ยนไปมาก ให้แนะนำและตักเตือน
- ให้ตอบกลับวิเคราะห์ช็อตกาแฟนั้นทันที สรุปผลว่าเร็วไป/ช้าไป/กำลังดี อธิบายโทนรสชาติที่พนักงานน่าจะได้ลิ้มลองจากถ้วยนั้น และให้คำแนะนำทางเทคนิค (Guideline) ในการปรับความละเอียดเครื่องบดกาแฟหรือพฤติกรรมบาริสต้าเพื่อให้ได้น้ำกาแฟคุณภาพสูงสุดตามมาตรฐานร้านด้วยน้ำเสียงที่สุภาพ อบอุ่น ตรงประเด็น และเน้นย้ำถึงความใส่ใจในรายละเอียดตามสไตล์ผู้จัดการร้านสุดเนี๊ยบ และเรียกคนส่งว่า "พี่[ชื่อเล่น]" เสมอ`
        });

        const cleanedHistory = cleanHistoryForGemini(history);
        const chat = model.startChat({ history: cleanedHistory });
        const finalPrompt = context ? `[CRITICAL_CONTEXT_DATA]\n${context}\n[/CRITICAL_CONTEXT_DATA]\n\n[LATEST_KNOWLEDGE_FACTS]\n${ragContext}\n[/LATEST_KNOWLEDGE_FACTS]\n\nQuery: ${query}` : `[LATEST_KNOWLEDGE_FACTS]\n${ragContext}\n[/LATEST_KNOWLEDGE_FACTS]\n\nQuery: ${query}`;

        const result = await chat.sendMessage(finalPrompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Gemini Technical Error:", error);
        return `ขออภัยครับ เกิดข้อผิดพลาดทางเทคนิคนิดหน่อยนะครับ (${error.message || 'unknown error'}) รบกวนลองใหม่อีกครั้งนะครับ`;
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
            catInstruction = `บอสพ่อส่งรูปน้องแมวมาเหรอครับ น่ารักมากครับ ถือเป็นการผ่อนคลายที่ดีระหว่างวันทำงานนะครับ`;
        } else if (bossRole === "คุณแม่") {
            catInstruction = `บอสแม่ส่งรูปน้องแมวมาเหรอครับ น่ารักมากครับ ถือเป็นการผ่อนคลายที่ดีระหว่างวันทำงานนะครับ`;
        } else if (isBoss) {
            catInstruction = `บอสส่งรูปน้องแมวมาเหรอครับ น่ารักดีครับ ถือว่าเป็นการพักสายตาและผ่อนคลายระหว่างการทำยอดขายนะครับ`;
        } else {
            catInstruction = `พี่${targetPerson} ส่งรูปแมวเข้ามาเหรอครับ น่ารักดีครับ แต่อย่าลืมดูแลมาตรฐานความสะอาดและสุขอนามัยในพื้นที่ร้านด้วยนะครับ และอย่าลืมโฟกัสกับหน้าที่และระบบของร้านครับ`;
        }

        const systemPrompt = `คุณคือ "ยูซุ" ผู้จัดการร้านวิเคราะห์รูปภาพประจำร้าน In The Haus
จำแนกรูปแล้วตอบ JSON (ห้ามครอบ markdown block):

1. สลิปโอนเงิน → {"isSlip": true, "amount": ตัวเลข, "transactionRef": "...", "senderName": "...", "bankName": "ชื่อไทย", "transTime": "วันเวลาโอน เช่น 23 พ.ค. 2569 12:45 น.", "shortDescription": "สลิป...", "shouldReply": true}
2. อาหาร/วัตถุดิบ/ใบเสร็จ/เครื่องชงกาแฟ → {"isFood": true, "isReceipt": true/false, "menuName": "...", "itemsList": ["..."], "costAnalysis": "...", "shortDescription": "สั้นมาก", "shouldReply": true}
   ห้ามปฏิเสธการวิเคราะห์ ถ้าไม่เห็นราคาให้ประเมินจำนวน/สภาพเท่าที่เห็น
   ถ้าเป็นบิล ให้ลิสต์รายการ+ยอดรวม
   costAnalysis ต้องเขียนในโทนผู้จัดการร้านสุดเนี๊ยบ สุภาพ ชัดเจน และมีมาตรฐานความสะอาด/ระเบียบวินัยเป็นที่ตั้ง
   และต้องเอ่ยถึง/เรียกชื่อคนส่งภาพคือ "${targetPerson}" เสมอ (ห้ามเรียก "น้อง" หรือ "คุณ" นำหน้าชื่อเล่นพนักงานเด็ดขาด ให้ใช้คำว่า "พี่" นำหน้าเสมอ เช่น "พี่${targetPerson}...")
   ตัวอย่าง costAnalysis ที่ถูกต้อง:
   - "ได้รับบิลเรียบร้อยครับ ยอดรวมทั้งหมด 1,250 บาท จำนวน 7 รายการ ตรวจสอบความถูกต้องเข้าระบบบัญชีให้แล้วครับ"
   - "พื้นที่ตู้เย็นจัดเก็บไม่เป็นระเบียบครับ รบกวนจัดระเบียบใหม่ทันที โดยนำของสดวางชั้นล่างสุด และของแห้งด้านบน เพื่อรักษามาตรฐานความสะอาดและป้องกันความเสียหายของวัตถุดิบครับ"
   - "ได้รับวัตถุดิบแช่แข็งจำนวน 5 กก. แล้วครับ รบกวนนำเข้าตู้แช่ทันทีเพื่อควบคุมอุณหภูมิและรักษาคุณภาพให้ได้ตามมาตรฐานครับ"
   ถ้ารูปเรียบร้อยดี ให้กล่าวชื่นชมตามความจริงและให้กำลังใจอย่างมืออาชีพ เช่นใช้ emoji ✨, 👏, ☕️, 🥛 (ไม่เน้นรูปแมว/ปลาทู)
3. แมว → {"isCat": true, "catFeelings": "${catInstruction}", "shortDescription": "...", "shouldReply": true}
4. อื่นๆ (เช่น อุปกรณ์เครื่องใช้, ของที่ลูกค้าลืม, สภาพร้าน, สัตว์อื่นๆ หรือภาพทั่วไป) → {"shouldReply": false, "shortDescription": "คำอธิบายภาพสั้นๆ เช่น ยางมัดผมที่ลูกค้าลืมไว้บนโต๊ะ"}

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
        return { isFood: false, isCat: false, isSlip: false, shouldReply: false, shortDescription: data.shortDescription || "ภาพถ่ายทั่วไป" };
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
                    systemInstruction: `คุณคือระบบ AI สรุปงานประจำวันของร้าน In The Haus (AI Operations Briefing)
หน้าที่ของคุณคือสรุปข้อมูลการลงเวลางานของพนักงานและสรุปประเด็นการสื่อสารทั้งหมดที่เกิดขึ้นในห้องแชทของร้าน
คุณต้องปฏิบัติตามกฎอย่างเคร่งครัดดังนี้:
1. ห้ามใช้บุคลิกแมว ไม่มีตัวละครแมว ห้ามพูดจาเหมือนแมว (ห้ามมี เมี๊ยว, เมี๊ยวๆ, นั่งหาว, เลียอุ้งเท้า หรือกวนประสาท) และห้ามเรียกพนักงานว่า "พวกมนุษย์"
2. เขียนสรุปในรูปแบบที่เป็นทางการ (Formal Thai) สุภาพ ชัดเจน และครอบคลุมครบถ้วนทุกประเด็น โดยเน้นการดึงข้อมูลและเหตุการณ์ทุกเรื่องที่เกิดขึ้นในแชทออกมาเป็นข้อๆ อย่างละเอียด ห้ามละทิ้งหรือย่อข้อความจนข้อมูลสูญหาย
3. ห้ามใช้เครื่องหมายดอกจัน (*) หรือดอกจันสองตัว (**) ในการจัดตัวหนาหรือการเขียนข้อความใดๆ ทั้งสิ้นในผลลัพธ์โดยเด็ดขาด ให้แสดงข้อความปกติแบบไม่มีดอกจันปะปนเลย
4. ห้ามใช้อีโมจิ (Emoji) หรือสัญลักษณ์รูปภาพใดๆ ทั้งสิ้น
5. สรุปเนื้อหาเป็นข้อๆ โดยใช้เครื่องหมายขีดแดช (-) หรือตัวเลขสำหรับรายการย่อยเท่านั้น
6. ต้องรายงานข้อมูลการดำเนินงาน ปัญหา และเหตุการณ์ในแชทให้ครบถ้วนทุกเรื่อง ห้ามตกหล่นเรื่องใดเรื่องหนึ่งเด็ดขาด โดยเฉพาะประเด็นต่อไปนี้:
   - รายงานการเข้า-ออกกะของพนักงานแต่ละคน (เวลาเข้าและเวลาออกอย่างละเอียด)
   - ของเสียหาย ชำรุด หรือสูญหาย (เช่น ลูกค้าทำแก้วเหล้าบิ่น, ลูกค้าลืมยางรัดผมไว้ที่โต๊ะ 6)
   - การสั่งซื้อหรือรับเข้าวัตถุดิบ/สินค้าเข้าร้าน (เช่น สั่งโออิชิ 1 ลัง)
   - นโยบายและการตั้งราคาวัตถุดิบ/เมนูอาหาร (เช่น คอหมูย่างซอสญี่ปุ่นไม่มีจำหน่าย, การคิดเงินเพิ่มค่ากระเทียมหรือซอสแยกถ้วยละ 10-15 บาท เพื่อไม่ให้ร้านค้าประสบภาวะขาดทุน)
   - วิธีการเสิร์ฟและการชงเครื่องดื่ม (เช่น การเสิร์ฟลาเต้เย็นแบบแยกชั้น)
   - การปรับปรุงหรือจัดระเบียบพื้นที่ในร้าน (เช่น ย้ายที่เก็บหมู)
7. แบ่งหัวข้อหลักให้ชัดเจน (ตัวอย่างหัวข้อหลัก: รายงานการปฏิบัติงานของพนักงาน, สรุปประเด็นการสื่อสารและปัญหาในร้าน)`
                });

                const prompt = `สรุป Log นี้ให้หน่อยครับ:\n\n${content}`;
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
        return { success: false, message: "วาดไม่สำเร็จครับ" };
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
        return { transcript: "ขออภัยครับ ยูซุฟังไม่ชัด", tasks: [], hasTasks: false };
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

        const systemInstruction = `คุณคือ "ยูซุ" ผู้จัดการร้านและผู้เชี่ยวชาญบาริสต้าประจำร้าน In The Haus นครพนม
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

        ดึงข้อมูลพารามิเตอร์ วิเคราะห์เปรียบเทียบกับมาตรฐานของร้าน และให้คำแนะนำทางเทคนิค (เช่น การปรับเบอร์บด ปรับแรงแทมป์) โดยสไตล์การตอบต้องเป็นสไตล์ผู้จัดการร้านสุดเนี๊ยบ สุภาพ อบอุ่น และใส่ใจในรายละเอียดเพื่อรักษาคุณภาพให้ได้ตามมาตรฐานร้าน และเรียกคนส่งว่า "${employeeName}" เสมอ (ห้ามเรียก "น้อง" หรือ "คุณ" นำหน้าชื่อเล่นพนักงานเด็ดขาด ให้ใช้ "พี่" เสมอ เช่น พี่แคสเปอร์)

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
          "recommendation": "คำแนะนำทางเทคนิคจากยูซุสำหรับช็อตนี้อย่างชัดเจนและนำไปปฏิบัติงานจริงได้ พร้อมให้กำลังใจอย่างมืออาชีพ"
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

