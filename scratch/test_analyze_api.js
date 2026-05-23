const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config({ path: '.env.local' });

// Mock function representing the API logic
async function verifyAppraisalLogic(employeeId) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    console.log("1. Fetching Employee...");
    const { data: employee, error: empError } = await supabase
        .from('employees')
        .select('id, name, nickname, position, line_user_id, line_bot_id')
        .eq('id', employeeId)
        .maybeSingle();

    if (empError || !employee) {
        console.error("Employee not found:", empError);
        return;
    }
    console.log(`Found Employee: ${employee.nickname || employee.name} (${employee.position})`);

    console.log("2. Fetching Attendance...");
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: attendance } = await supabase
        .from('attendance_logs')
        .select('timestamp, action_type, mood_status, mood_note')
        .eq('employee_id', employeeId)
        .gte('timestamp', thirtyDaysAgo.toISOString())
        .order('timestamp', { ascending: false })
        .limit(50);

    console.log(`Found ${attendance?.length || 0} attendance logs.`);

    console.log("3. Fetching Chat History...");
    let chats = [];
    const { line_user_id, line_bot_id } = employee;
    if (line_user_id || line_bot_id) {
        let chatQuery = supabase
            .from('yuzu_chat_history')
            .select('content, role, created_at')
            .gte('created_at', thirtyDaysAgo.toISOString())
            .limit(100);

        if (line_user_id && line_bot_id) {
            chatQuery = chatQuery.or(`user_id.eq.${line_user_id},user_id.eq.${line_bot_id}`);
        } else if (line_user_id) {
            chatQuery = chatQuery.eq('user_id', line_user_id);
        } else {
            chatQuery = chatQuery.eq('user_id', line_bot_id);
        }

        const { data: chatData } = await chatQuery.order('created_at', { ascending: false });
        if (chatData) chats = chatData;
    }
    console.log(`Found ${chats.length} chat logs.`);

    console.log("4. Running Gemini Analysis...");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

    const displayName = employee.nickname || employee.name;
    let context = `พนักงาน: ${displayName} (${employee.position || 'ทั่วไป'})\n\n`;
    
    context += `--- ข้อมูลการเข้างานย้อนหลัง 30 วัน ---\n`;
    if (attendance && attendance.length > 0) {
        attendance.forEach(log => {
            const dateStr = new Date(log.timestamp).toLocaleDateString('th-TH');
            const action = log.action_type === 'check_in' ? 'เข้างาน (Check-In)' : 'ออกงาน (Check-Out)';
            context += `- [${dateStr}] ${action} | อารมณ์: ${log.mood_status || ''} | โน้ต: ${log.mood_note || ''}\n`;
        });
    } else {
        context += `ไม่มีประวัติการเช็คอิน\n`;
    }

    context += `\n--- ตัวอย่างประวัติการพูดคุย/แชทย้อนหลัง ---\n`;
    if (chats && chats.length > 0) {
        chats.forEach(c => {
            const roleLabel = c.role === 'user' ? displayName : 'ยูซุ (AI)';
            context += `- [${roleLabel}]: ${c.content}\n`;
        });
    } else {
        context += `ไม่มีการบันทึกประวัติการแชทในช่วงนี้\n`;
    }

    const systemPrompt = `คุณคือ "ยูซุ" AI แมววิเคราะห์ศักยภาพทีมงานของร้าน In The Haus นครพนม
วิเคราะห์ข้อมูลล็อกการทำงาน อารมณ์ และประวัติการแชทของพนักงานคนนี้
สรุปข้อมูลโดยเน้นย้ำ:
1. หน้าที่ความรับผิดชอบ (duties): บทบาทสำคัญและลักษณะงานที่เขาทำจริง
2. สิ่งที่ดีแล้ว (strengths): จุดเด่น ความมีวินัย ความตรงต่อเวลา ความกระตือรือร้น หรือความน่ารักของเขา (เขียน 2-3 ประโยคย่อย)
3. สิ่งที่ต้องปรับปรุง (improvements): จุดอ่อน พฤติกรรมตอกบัตรสาย อารมณ์เหนื่อยล้าสะสม หรือเรื่องการทำงานที่ต้องการการชี้แนะเชิงบวก (เขียน 2-3 ประโยคย่อย)

ตอบเป็น JSON เท่านั้น:
{
  "duties": "สรุปหน้าที่...",
  "strengths": "สรุปสิ่งที่ดีแล้ว...",
  "improvements": "สรุปสิ่งที่ต้องปรับปรุง..."
}`;

    const result = await model.generateContent([systemPrompt, context]);
    const textResponse = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    console.log("--- AI Response ---");
    console.log(textResponse);
}

// Fetch a sample active employee from DB
async function runTest() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    const { data: emps } = await supabase.from('employees').select('id').eq('is_active', true).limit(1);
    if (emps && emps.length > 0) {
        await verifyAppraisalLogic(emps[0].id);
    } else {
        console.log("No active employees found in DB to test.");
    }
}

runTest();
