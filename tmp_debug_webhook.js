require('dotenv').config({ path: '.env.local' });
const { getDailyContent } = require('./utils/memory.js');
const { getAllEmployeesData } = require('./utils/memory.js');

async function testPrompt() {
    const groupId = 'C1210c7a0601b5a675060e312efe10bff';
    const dailyLogs = await getDailyContent(groupId);
    const allEmployees = await getAllEmployeesData();
    
    let contextContent = `\nรายชื่อพนักงานทั้งหมดในระบบตอนนี้ (ทำ mapping UID -> ชื่อ ให้ตรวจสอบ):\n`;
    if (allEmployees && allEmployees.length > 0) {
        allEmployees.forEach(emp => {
            const empName = emp.nickname || emp.name;
            const uid1 = emp.line_user_id || 'ไม่มี';
            const uid2 = emp.line_bot_id || 'ไม่มี';
            contextContent += `- Bot UID: ${uid2} | LIFF UID: ${uid1} | ชื่อ: ${empName} | ตำแหน่ง: ${emp.position}\n`;
        });
        contextContent += `(จบรายชื่อพนักงาน)\n\n`;
    } else {
        contextContent += "ยังไม่มีข้อมูลพนักงาน sync\n";
    }

    const reportPrompt = `ช่วยสรุปรายงานพฤติกรรมและการทำงานของพนักงานจากข้อมูลที่มีหน่อยค่ะ ยึดตามรายชื่อพนักงานที่มีในระบบต่อไปนี้:\n${contextContent}\nและนี่คือประวัติการแชท/ทำงานของวันนี้:\n${dailyLogs || "(วันนี้ยังไม่มีประวัติการแชทให้วิเคราะห์)"}\n\nโปรดเน้นวิเคราะห์แต่ละคนตามรายชื่อที่มี และรายงานความพร้อมให้เจ้านายฟัง (ถ้าประวัติแชทว่างก็บอกสถานะของรายชื่อบุคคลไปก่อน)`;

    console.log("=== PROMPT TO GEMINI ===");
    console.log(reportPrompt);
}

testPrompt();
