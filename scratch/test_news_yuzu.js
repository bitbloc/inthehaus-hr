import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getGeminiResponse } from '../utils/gemini.js';
import { getAccurateNews } from '../utils/news.js';
import { getDailyContent } from '../utils/memory.js';
import { format } from 'date-fns';

async function run() {
  const groupId = 'C1210c7a0601b5a675060e312efe10bff';
  const userId = 'U77e56cb573085ba79d37b496c6abdb63'; // Father
  
  const dailyLogs = await getDailyContent(groupId);
  const newsContext = await getAccurateNews();
  
  let context = `คุณคือ ยูซุ (Yuzu) ผู้ช่วย AI ประจำร้าน In The Haus นครพนม ทำงานเป็นผู้ช่วยเจ้านายและพนักงาน ข้อมูลแวดล้อม:
- เวลาปัจจุบัน: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')} (เวลาไทย)
ประเด็นเหตุการณ์ที่เกิดขึ้นในแชทกลุ่มวันนี้ (ใช้สำหรับอ้างอิงหรือแซวทีมงาน):
${dailyLogs || 'ไม่มีความเคลื่อนไหว'}
`;

  console.log("Injecting News-Only Context...");
  context += newsContext + "\n";
  
  context += `\n[INSTRUCTION: คุณกำลังสรุปข่าวเด่นประจำวันแบบ Minimal ที่สุดเพื่อรายงานเจ้านาย
  กรุณาตอบกลับโดยลิสต์รายการข่าวสารเด่นๆ ที่เกิดขึ้นในรอบ 24 ชั่วโมงจาก [CRITICAL_CONTEXT_DATA] เป็นข้อๆ ทีละบรรทัดอย่างกระชับที่สุด (ห้ามเกริ่นนำ ห้ามพูดคุยเวิ่นเว้อ ห้ามสรุปเป็นย่อหน้ายาวๆ และห้ามใส่เรื่องราคาน้ำมัน ค่าไฟ หรือวัตถุดิบเด็ดขาด)
  ใส่ Hashtag ที่น่าสนใจท้ายข่าวแต่ละหัวข้อด้วยภาษาพูดสไตล์แมวยูซุสั้นๆ กวนๆ เล็กน้อย
  
  **กฎเหล็กเรื่องความสดใหม่ของข่าว:**
  - ห้ามเอาข่าวเก่าในประวัติการแชท (เช่น พายุลูกเห็บถล่มเรณูนคร, จับยาเสพติดล็อตใหญ่) มาสรุปซ้ำเด็ดขาด!
  - ให้ใช้ข่าวใหม่ของวันนี้ที่อยู่ภายใน [CRITICAL_CONTEXT_DATA] เท่านั้น
  - หากไม่พบข่าวใหม่ในพื้นที่ ให้สรุปเฉพาะข่าวระดับประเทศล่าสุดจาก THE STANDARD ของวันนี้แทน ห้ามมโนข่าวเก่าขึ้นมา
  
  โปรดตอบกลับตามโครงสร้างนี้อย่างเคร่งครัด:
  [FLEX_TITLE]📰 ข่าวเด่นวันนี้โดยน้องยูซุ[/FLEX_TITLE]
  [FLEX_SUBTITLE]ด่วน/สรุปหัวข้อข่าวสารรอบวันเพื่อบอส[/FLEX_SUBTITLE]
  [FLEX_NEWS]
  • ข่าวสั้นที่ 1 #Hashtag
  • ข่าวสั้นที่ 2 #Hashtag
  • ข่าวสั้นที่ 3 #Hashtag
  [/FLEX_NEWS]
  
  ระวัง: ห้ามใส่ Tag FLEX_INDUSTRY, FLEX_COSTS หรือ FLEX_ADVICE ใดๆ เข้ามา และห้ามพิมพ์คำพูดใดๆ นอก Tag FLEX_TITLE, FLEX_SUBTITLE, FLEX_NEWS เด็ดขาด]`;

  const query = "สรุปข่าว";
  console.log("Calling Gemini...");
  const response = await getGeminiResponse(query, context, [], userId);
  console.log("Raw response from Gemini:\n", response);
}

run().catch(console.error);
