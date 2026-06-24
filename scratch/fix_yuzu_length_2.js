import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, '../utils/gemini.js');
let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings to LF first
content = content.replace(/\r\n/g, '\n');

// Use a regex to match the lines regardless of spaces or line endings
const searchPattern = /costAnalysis ต้องเขียนในโทนผู้จัดการร้านสุดเนี๊ยบ[\s\S]*?พี่\${targetPerson}\.\.\."\)/;
const replacement = `costAnalysis ต้องเขียนในโทนผู้จัดการร้านสุดเนี๊ยบ สุภาพ ชัดเจน และมีมาตรฐานความสะอาด/ระเบียบวินัยเป็นที่ตั้ง โดยเน้นความกระชับ ตรงประเด็นที่สุด (ความยาวไม่เกิน 1-2 ประโยค หรือไม่เกิน 80 ตัวอักษร ห้ามเวิ่นเว้อหรือเขียนยาว)
   และต้องเอ่ยถึง/เรียกชื่อคนส่งภาพโดยเรียกตามชื่อ "\${targetPerson}" ที่ระบบระบุไว้ให้เสมอ (ห้ามเรียกอย่างอื่นเด็ดขาด และห้ามเติมคำว่า "พี่" ซ้อนกันเป็น "พี่พี่")`;

if (searchPattern.test(content)) {
  content = content.replace(searchPattern, replacement);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log("Successfully updated vision prompt instructions!");
} else {
  console.log("Error: Search pattern not found in utils/gemini.js");
}
