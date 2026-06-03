import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getGenAI } from '../utils/gemini-client.js';

async function run() {
  const instance = getGenAI();
  const model = instance.getGenerativeModel({ 
    model: "gemini-3.5-flash",
  });

  const prompt = `คุณคือ "ยูซุ" แมวส้มผู้เชี่ยวชาญบาริสต้าประจำร้าน In The Haus นครพนม
        หน้าที่ของคุณคือวิเคราะห์ข้อมูลการสกัดช็อตกาแฟ (Espresso Extraction) จากรายงานของพนักงาน

        นี่คือเกณฑ์มาตรฐานสำหรับเมล็ดกาแฟคั่วกลาง (Medium Roast) ของร้าน:
        - ปริมาณผงกาแฟ (Dose): 18.0g - 20.0g (ต่ำกว่า 18.0g ถือว่าน้อยไป/LOW, เกิน 20.0g ถือว่าเยอะไป/HIGH)
        - ปริมาณน้ำกาแฟ (Yield): 36.0ml - 40.0ml (หรือประมาณ 35.0ml - 40.0ml ถือว่ายอมรับได้/OK)
        - หยดแรกที่ไหล (First Drop): วินาทีที่ 5 - 8 (ต่ำกว่า 5 วินาทีถือว่าไหลเร็วไป/FAST, เกิน 8 วินาทีถือว่าช้าไป/SLOW)
        - เวลาสกัดรวม (Total Time): 25 - 30 วินาที (ต่ำกว่า 22 วินาทีถือว่าไหลเร็ว/FAST (Under-extracted), เกิน 30 วินาทีถือว่าไหลช้า/SLOW (Over-extracted))
        - อัตราส่วน Dose ต่อ Yield ในอุดมคติคือประมาณ 1:2

        กรุณาช่วยวิเคราะห์ข้อความต่อไปนี้:
        "เทสช็อต ช่วงเช้าค่ะ
18 g 35 ml กาแฟไหลวิที่ 6 จบที่ 36 วินาที ตัวเครื่องมีความชื้น ตัวเมล็ดหลังบดมีความเป็นก้อน
ช่วงแรกไหลเป็นหยด เริ่มไหลเป็นสายวิที่ 9 @All"

        ดึงข้อมูลพารามิเตอร์ วิเคราะห์เปรียบเทียบกับมาตรฐานของร้าน และให้คำแนะนำทางเทคนิค (เช่น การปรับเบอร์บด ปรับแรงแทมป์) โดยสไตล์การตอบต้องน่ารัก กวนๆ เป็นกันเองแบบแมวส้ม ยูซุ และเรียกคนส่งว่า "แคสเปอร์" อย่างสุภาพสนิทสนม (ห้ามเรียก "น้อง" หรือ "คุณ" นำหน้าชื่อเล่นพนักงานเด็ดขาด ให้ใช้ "พี่" เสมอ เช่น พี่แคสเปอร์)

        ตอบกลับเป็น JSON ในรูปแบบนี้เท่านั้น:
        {
          "dose": {
            "value": 18.0,
            "unit": "g",
            "status": "OK", 
            "comment": "วิเคราะห์ผงกาแฟสั้นๆ"
          },
          "yield": {
            "value": 35.0,
            "unit": "ml",
            "status": "OK",
            "comment": "วิเคราะห์น้ำกาแฟสั้นๆ"
          },
          "firstDrop": {
            "value": 6.0,
            "unit": "s",
            "status": "OK",
            "comment": "วิเคราะห์หยดแรกสั้นๆ"
          },
          "totalTime": {
            "value": 36.0,
            "unit": "s",
            "status": "SLOW",
            "comment": "วิเคราะห์เวลารวมสั้นๆ"
          },
          "grindAdjustment": "ปรับหยาบเพิ่ม 1 คลิก",
          "isGrindAdjustmentCorrect": true,
          "tasteProfile": "ขมไหม้ ฝาดแห้ง หรือเปรี้ยวสว่างมีบอดี้",
          "recommendation": "คำแนะนำทางเทคนิคจากยูซุสำหรับช็อตนี้อย่างชัดเจนและนำไปปฏิบัติงานจริงได้ พร้อมให้กำลังใจหรือแซวเล็กน้อย"
        }`;

  console.time("json_mode");
  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      }
    });
    console.timeEnd("json_mode");
    console.log("Result:", result.response.text());
  } catch (err) {
    console.timeEnd("json_mode");
    console.error("Error:", err.message);
  }
}

run();
