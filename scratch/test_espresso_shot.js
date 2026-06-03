import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { analyzeEspressoShot } from '../utils/gemini.js';

async function run() {
  const text = `เทสช็อต ช่วงเช้าค่ะ
18 g 35 ml กาแฟไหลวิที่ 6 จบที่ 36 วินาที ตัวเครื่องมีความชื้น ตัวเมล็ดหลังบดมีความเป็นก้อน
ช่วงแรกไหลเป็นหยด เริ่มไหลเป็นสายวิที่ 9 @All`;
  console.log("Analyzing text:\n", text);
  try {
    console.time("analyzeEspressoShot");
    const analysis = await analyzeEspressoShot(text, 'แคสเปอร์');
    console.timeEnd("analyzeEspressoShot");
    console.log("Analysis Result:", JSON.stringify(analysis, null, 2));
  } catch (err) {
    console.error("Test error:", err);
  }
}
run();
