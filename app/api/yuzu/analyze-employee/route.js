import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getGenAI } from '../../../../utils/gemini-client';

export async function POST(request) {
    try {
        const body = await request.json();
        const { employeeId } = body;

        if (!employeeId) {
            return NextResponse.json({ success: false, error: "Missing employeeId" }, { status: 400 });
        }

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        );

        // 1. Fetch Employee Details
        const { data: employee, error: empError } = await supabase
            .from('employees')
            .select('name, nickname, position, line_user_id, line_bot_id')
            .eq('id', employeeId)
            .maybeSingle();

        if (empError || !employee) {
            return NextResponse.json({ success: false, error: "Employee not found: " + (empError?.message || '') }, { status: 404 });
        }

        // 2. Fetch last 30 days of attendance logs
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: attendance, error: attError } = await supabase
            .from('attendance_logs')
            .select('timestamp, action_type, mood_status, mood_note')
            .eq('employee_id', employeeId)
            .gte('timestamp', thirtyDaysAgo.toISOString())
            .order('timestamp', { ascending: false })
            .limit(50);

        // 3. Fetch last 30 days of chat history
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

            const { data: chatData, error: chatError } = await chatQuery.order('created_at', { ascending: false });
            if (!chatError && chatData) {
                chats = chatData;
            }
        }

        // 4. Construct Context for AI
        const displayName = employee.nickname || employee.name;
        let context = `พนักงาน: ${displayName} (${employee.position || 'ทั่วไป'})\n\n`;
        
        context += `--- ข้อมูลการเข้างานย้อนหลัง 30 วัน ---\n`;
        if (attendance && attendance.length > 0) {
            attendance.forEach(log => {
                const dateStr = new Date(log.timestamp).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' });
                const timeStr = new Date(log.timestamp).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
                const action = log.action_type === 'check_in' ? 'เข้างาน (Check-In)' : 'ออกงาน (Check-Out)';
                const mood = log.mood_status ? `อารมณ์: ${log.mood_status}` : '';
                const note = log.mood_note ? `บันทึกความรู้สึก: "${log.mood_note}"` : '';
                context += `- [${dateStr} ${timeStr}] ${action} | ${mood} ${note}\n`;
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

        // 5. Query Gemini for summary
        const instance = getGenAI();
        if (!instance) {
            return NextResponse.json({ success: false, error: "Failed to initialize Gemini instance" }, { status: 500 });
        }

        const model = instance.getGenerativeModel({ model: "gemini-3.5-flash" });
        const systemPrompt = `คุณคือ "ยูซุ" AI แมววิเคราะห์ศักยภาพทีมงานของร้าน In The Haus นครพนม
วิเคราะห์ข้อมูลล็อกการทำงาน อารมณ์ และประวัติการแชทของพนักงานคนนี้
สรุปข้อมูลโดยเน้นย้ำ:
1. หน้าที่ความรับผิดชอบ (duties): บทบาทสำคัญและลักษณะงานที่เขาทำจริง
2. สิ่งที่ดีแล้ว (strengths): จุดเด่น ความมีวินัย ความตรงต่อเวลา ความกระตือรือร้น หรือความน่ารักของเขา (เขียน 2-3 ประโยคย่อย)
3. สิ่งที่ต้องปรับปรุง (improvements): จุดอ่อน พฤติกรรมตอกบัตรสาย อารมณ์เหนื่อยล้าสะสม หรือเรื่องการทำงานที่ต้องการการชี้แนะเชิงบวก (เขียน 2-3 ประโยคย่อย)

คุณต้องตอบกลับเป็นไฟล์ JSON รูปแบบนี้เท่านั้น (ห้ามใส่สัญลักษณ์ markdown หรือปลาทู 🐟):
{
  "duties": "สรุปหน้าที่...",
  "strengths": "สรุปสิ่งที่ดีแล้ว...",
  "improvements": "สรุปสิ่งที่ต้องปรับปรุง..."
}
เขียนเป็นภาษาไทยที่เป็นมิตร ตรงไปตรงมา และกระตุ้นเชิงบวกเพื่อช่วยเหลือพนักงาน`;

        const result = await model.generateContent([systemPrompt, context]);
        const textResponse = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        
        let analysis;
        try {
            analysis = JSON.parse(textResponse);
        } catch (e) {
            console.error("Failed to parse Gemini JSON output:", textResponse);
            // Fallback parsing if there are extra characters
            throw new Error("AI response format was invalid. Please try again.");
        }

        return NextResponse.json({
            success: true,
            analysis
        });

    } catch (error) {
        console.error("Employee Analysis API Error:", error);
        return NextResponse.json({ success: false, error: error.message || "Internal server error" }, { status: 500 });
    }
}
