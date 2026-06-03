import { isEspressoShotReport } from '../app/api/webhook/handlers/espressoHandler.js';

const text = `เทสช็อต ช่วงเช้าค่ะ
18 g 35 ml กาแฟไหลวิที่ 6 จบที่ 36 วินาที ตัวเครื่องมีความชื้น ตัวเมล็ดหลังบดมีความเป็นก้อน
ช่วงแรกไหลเป็นหยด เริ่มไหลเป็นสายวิที่ 9 @All`;

console.log("Input text:\n", text);
console.log("isEspressoShotReport output:", isEspressoShotReport(text));

const lowerText = text.toLowerCase();
const hasGrams = /\d+(\.\d+)?\s*(g|กรัม)/.test(lowerText);
const hasVolume = /\d+(\.\d+)?\s*(ml|มล)/.test(lowerText);
const hasSeconds = /\d+\s*(s|วิ|วินาที|จบ)/.test(lowerText);
const hasCoffeeJargon = /ไหล|สกัด|ช็อต|shot|ครีม่า|crema|บด|แทมป์|tamp|หยด|หยดแรก/i.test(lowerText);

console.log("hasGrams:", hasGrams);
console.log("hasVolume:", hasVolume);
console.log("hasSeconds:", hasSeconds);
console.log("hasCoffeeJargon:", hasCoffeeJargon);
