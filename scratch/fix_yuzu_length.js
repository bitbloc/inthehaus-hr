import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, '../utils/gemini.js');
let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings to LF first
content = content.replace(/\r\n/g, '\n');

// 1. Fix targetPerson instruction in classifyAndAnalyzeImage to prevent "พี่พี่" and enforce brevity
content = content.replace(
  `    costAnalysis ต้องเขียนในโทนผู้จัดการร้านสุดเนี๊ยบ สุภาพ ชัดเจน และมีมาตรฐานความสะอาด/ระเบียบวินัยเป็นที่ตั้ง\n    และต้องเอ่ยถึง/เรียกชื่อคนส่งภาพคือ "\${targetPerson}" เสมอ (ห้ามเรียก "น้อง" หรือ "คุณ" นำหน้าชื่อเล่นพนักงานเด็ดขาด ให้ใช้คำว่า "พี่" นำหน้าเสมอ เช่น "พี่\${targetPerson}...")`,
  `    costAnalysis ต้องเขียนในโทนผู้จัดการร้านสุดเนี๊ยบ สุภาพ ชัดเจน และมีมาตรฐานความสะอาด/ระเบียบวินัยเป็นที่ตั้ง โดยเน้นความกระชับ ตรงประเด็นที่สุด (ความยาวไม่เกิน 1-2 ประโยค หรือไม่เกิน 80 ตัวอักษร ห้ามเวิ่นเว้อหรือเขียนยาว)\n    และต้องเอ่ยถึง/เรียกชื่อคนส่งภาพโดยเรียกตามชื่อ "\${targetPerson}" ที่ระบบระบุไว้ให้เสมอ (ห้ามเรียกอย่างอื่นเด็ดขาด และห้ามเติมคำว่า "พี่" ซ้อนกันเป็น "พี่พี่")`
);

// 2. Fix analyzeEspressoShot prompt and schema to enforce brevity
content = content.replace(
  `ดึงข้อมูลพารามิเตอร์ วิเคราะห์เปรียบเทียบกับมาตรฐานของร้าน และให้คำแนะนำทางเทคนิค (เช่น การปรับเบอร์บด ปรับแรงแทมป์) โดยสไตล์การตอบต้องเป็นสไตล์ผู้จัดการร้านสุดเนี๊ยบ สุภาพ อบอุ่น และใส่ใจในรายละเอียดเพื่อรักษาคุณภาพให้ได้ตามมาตรฐานร้าน และเรียกคนส่งว่า "\${employeeName}" เสมอ (ห้ามเรียก "น้อง" หรือ "คุณ" นำหน้าชื่อเล่นพนักงานเด็ดขาด ให้ใช้ "พี่" เสมอ เช่น พี่แคสเปอร์)`,
  `ดึงข้อมูลพารามิเตอร์ วิเคราะห์เปรียบเทียบกับมาตรฐานของร้าน และให้คำแนะนำทางเทคนิคที่กระชับและสั้นที่สุด (ไม่เกิน 2-3 ประโยค หรือไม่เกิน 120 ตัวอักษร) โดยสไตล์การตอบต้องเป็นสไตล์ผู้จัดการร้านสุดเนี๊ยบ สุภาพ อบอุ่น และเรียกคนส่งว่า "\${employeeName}" เสมอ (ห้ามมีคำว่า "พี่" ซ้ำซ้อนกันเป็น "พี่พี่")`
);

content = content.replace(
  `"recommendation": "คำแนะนำทางเทคนิคจากยูซุสำหรับช็อตนี้อย่างชัดเจนและนำไปปฏิบัติงานจริงได้ พร้อมให้กำลังใจอย่างมืออาชีพ"`,
  `"recommendation": "คำแนะนำทางเทคนิคอย่างกระชับ สั้น ตรงประเด็นที่สุด (ไม่เกิน 2-3 ประโยค หรือไม่เกิน 120 ตัวอักษร) บอกสาเหตุและวิธีปรับปรุง เช่น ปรับบดหยาบ/ละเอียด/แทมป์ พร้อมให้กำลังใจแบบมือโปร ห้ามยืดเยื้อหรือเขียนยาว"`
);

// Write back with normalized endings
fs.writeFileSync(filePath, content, 'utf8');
console.log("Successfully updated utils/gemini.js with shorter response constraints!");
