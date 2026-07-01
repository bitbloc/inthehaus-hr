import { NextResponse } from 'next/server';
import { getMonthlySummary } from '../../../../utils/gemini';
import { createClient } from '@supabase/supabase-js';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const monthStr = searchParams.get('month'); // Expects format 'YYYY-MM'

        if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) {
            return NextResponse.json({ success: false, error: 'Valid Month parameter (YYYY-MM) is required' }, { status: 400 });
        }

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        );

        // Calculate start and end date boundaries in +07:00 timezone
        const start = new Date(`${monthStr}-01T00:00:00+07:00`);
        const year = start.getFullYear();
        const month = start.getMonth(); // 0-indexed
        
        // Get last day of month in +07:00
        const lastDay = new Date(year, month + 1, 0).getDate();
        const end = new Date(`${monthStr}-${String(lastDay).padStart(2, '0')}T23:59:59.999+07:00`);

        // 1. Fetch Attendance Logs for the entire month
        const { data: attendance, error: attError } = await supabase
            .from('attendance_logs')
            .select('timestamp, action_type, mood_status, mood_note, employees(name, nickname, position)')
            .gte('timestamp', start.toISOString())
            .lte('timestamp', end.toISOString())
            .order('timestamp', { ascending: true });

        if (attError) throw attError;

        let attendanceStr = "--- บันทึกการเข้า-ออกงานและอารมณ์ในเดือนนี้ ---\n";
        if (attendance && attendance.length > 0) {
            attendance.forEach(log => {
                const empName = log.employees?.nickname || log.employees?.name || 'พนักงานนิรนาม';
                const position = log.employees?.position || 'ทั่วไป';
                const date = new Date(log.timestamp).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit' });
                const time = new Date(log.timestamp).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
                const action = log.action_type === 'check_in' ? 'เข้างาน' : 'ออกงาน';
                const mood = log.mood_status ? ` อารมณ์: ${log.mood_status}` : '';
                const note = log.mood_note ? ` (โน้ต: ${log.mood_note})` : '';
                attendanceStr += `- [${date} ${time}] ${empName} (${position}) ${action}${mood}${note}\n`;
            });
        } else {
            attendanceStr += "ไม่มีการลงเวลางานในเดือนนี้\n";
        }
        attendanceStr += "\n";

        // 2. Fetch Chat History for the entire month
        const { data: chatData, error: chatError } = await supabase
            .from('yuzu_chat_history')
            .select('user_id, role, content, message_type, created_at, group_id')
            .gte('created_at', start.toISOString())
            .lte('created_at', end.toISOString())
            .order('created_at', { ascending: true });

        if (chatError) throw chatError;

        // Fetch employees to resolve names
        const { data: employees } = await supabase
            .from('employees')
            .select('line_user_id, line_bot_id, name, nickname');
        
        const nameMap = {};
        if (employees) {
            employees.forEach(emp => {
                if (emp.line_bot_id) nameMap[emp.line_bot_id.toLowerCase()] = emp.nickname || emp.name;
                if (emp.line_user_id) nameMap[emp.line_user_id.toLowerCase()] = emp.nickname || emp.name;
            });
        }

        const formattedChats = (chatData || [])
            .filter(item => item.group_id && (item.group_id.startsWith('C') || item.group_id.startsWith('c')))
            .map(item => {
                const date = new Date(item.created_at).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit' });
                const time = new Date(item.created_at).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
                let prefix = '🤖: ';
                if (item.message_type === 'image_description') prefix = '[ภาพ]: ';
                else if (item.message_type === 'mood_booster') prefix = '💖 [คำชม]: ';
                else if (item.role === 'user') {
                    const name = (item.user_id && nameMap[item.user_id.toLowerCase()]) || '(บุคคลนิรนาม)';
                    prefix = `👤 ${name}: `;
                }
                return `[${date} ${time}] ${prefix}${item.content}`;
            }).join('\n');

        const combinedContent = attendanceStr + "--- ประวัติการสนทนาในกลุ่มร้านเดือนนี้ ---\n" + (formattedChats || "ไม่มีประวัติการพูดคุยในเดือนนี้\n");

        // 3. Generate monthly brief using Gemini 3.5
        const briefText = await getMonthlySummary(combinedContent);

        return NextResponse.json({
            success: true,
            brief: briefText,
            contentAnalyzedLength: combinedContent.length
        });
    } catch (error) {
        console.error("Yuzu Monthly Brief API Error:", error);
        return NextResponse.json({
            success: false,
            error: error.message || "Unknown error"
        }, { status: 500 });
    }
}
