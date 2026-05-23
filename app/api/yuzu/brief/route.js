import { NextResponse } from 'next/server';
import { getDailySummary } from '../../../../utils/gemini';
import { getDailyContent } from '../../../../utils/memory';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
    try {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        );

        const bangkokDateStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
        const startOfDay = new Date(`${bangkokDateStr}T00:00:00+07:00`);

        // 1. Fetch Today's Attendance Logs
        const { data: attendance, error: attError } = await supabase
            .from('attendance_logs')
            .select('timestamp, action_type, mood_status, mood_note, employees(name, nickname, position)')
            .gte('timestamp', startOfDay.toISOString())
            .order('timestamp', { ascending: true });

        if (attError) throw attError;

        let attendanceStr = "--- บันทึกการเข้า-ออกงานและอารมณ์วันนี้ ---\n";
        if (attendance && attendance.length > 0) {
            attendance.forEach(log => {
                const empName = log.employees?.nickname || log.employees?.name || 'พนักงานนิรนาม';
                const position = log.employees?.position || 'ทั่วไป';
                const time = new Date(log.timestamp).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
                const action = log.action_type === 'check_in' ? 'เข้างาน' : 'ออกงาน';
                const mood = log.mood_status ? ` อารมณ์: ${log.mood_status}` : '';
                const note = log.mood_note ? ` (โน้ต: ${log.mood_note})` : '';
                attendanceStr += `- [${time}] ${empName} (${position}) ${action}${mood}${note}\n`;
            });
        } else {
            attendanceStr += "ไม่มีการลงเวลางานในวันนี้\n";
        }
        attendanceStr += "\n";

        // 2. Fetch Chat Logs
        let chatStr = "--- ล็อกการพูดคุยในร้านวันนี้ ---\n";
        try {
            const { data: latestChat } = await supabase
                .from('yuzu_chat_history')
                .select('group_id')
                .not('group_id', 'is', null)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            const groupId = latestChat?.group_id;
            if (groupId) {
                const dailyLogs = await getDailyContent(groupId);
                if (dailyLogs) {
                    chatStr += dailyLogs;
                } else {
                    chatStr += "ไม่มีประวัติการพูดคุยในวันนี้\n";
                }
            } else {
                chatStr += "ไม่มีประวัติการพูดคุยในวันนี้\n";
            }
        } catch (chatErr) {
            console.error("Brief API: Failed to get chat logs:", chatErr);
            chatStr += "ไม่สามารถดึงข้อมูลแชทได้\n";
        }

        const combinedContent = attendanceStr + chatStr;

        // 3. Generate Brief using Gemini 3.5
        const briefText = await getDailySummary(combinedContent);

        return NextResponse.json({
            success: true,
            brief: briefText,
            contentAnalyzed: combinedContent
        });

    } catch (error) {
        console.error("Yuzu Brief API Error:", error);
        return NextResponse.json({
            success: false,
            error: error.message || "Unknown error"
        }, { status: 500 });
    }
}
