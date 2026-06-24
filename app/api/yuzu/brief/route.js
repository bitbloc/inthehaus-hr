import { NextResponse } from 'next/server';
import { getDailySummary } from '../../../../utils/gemini';
import { getDailyContent } from '../../../../utils/memory';
import { createClient } from '@supabase/supabase-js';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const dateStr = searchParams.get('date'); // 'YYYY-MM-DD'

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        );

        let startOfDay, endOfDay;
        let queryDateStr;
        if (dateStr) {
            queryDateStr = dateStr;
            startOfDay = new Date(`${dateStr}T00:00:00+07:00`);
            endOfDay = new Date(`${dateStr}T23:59:59.999+07:00`);
        } else {
            queryDateStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
            startOfDay = new Date(`${queryDateStr}T00:00:00+07:00`);
            endOfDay = new Date(`${queryDateStr}T23:59:59.999+07:00`);
        }

        // 1. Fetch Attendance Logs for the target day
        const { data: attendance, error: attError } = await supabase
            .from('attendance_logs')
            .select('timestamp, action_type, mood_status, mood_note, employees(name, nickname, position)')
            .gte('timestamp', startOfDay.toISOString())
            .lte('timestamp', endOfDay.toISOString())
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
        let chatStr = "";
        try {
            // Find all unique group IDs that had messages on this target date
            const { data: chatsToday } = await supabase
                .from('yuzu_chat_history')
                .select('group_id')
                .gte('created_at', startOfDay.toISOString())
                .lte('created_at', endOfDay.toISOString())
                .not('group_id', 'is', null);

            const uniqueGroupIds = Array.from(new Set((chatsToday || []).map(c => c.group_id)))
                .filter(gid => gid.startsWith('C') || gid.startsWith('c')); // Only group chats (starting with C)

            if (uniqueGroupIds.length > 0) {
                for (const gid of uniqueGroupIds) {
                    const dailyLogs = await getDailyContent(gid, queryDateStr);
                    if (dailyLogs) {
                        chatStr += `--- ล็อกการพูดคุยในกลุ่มร้าน (${gid}) ---\n${dailyLogs}\n\n`;
                    }
                }
            } else {
                // Fallback to the overall latest group_id if no messages today
                const { data: latestChat } = await supabase
                    .from('yuzu_chat_history')
                    .select('group_id')
                    .not('group_id', 'is', null)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                const groupId = latestChat?.group_id;
                if (groupId) {
                    const dailyLogs = await getDailyContent(groupId, queryDateStr);
                    if (dailyLogs) {
                        chatStr += `--- ล็อกการพูดคุยในร้านวันนี้ ---\n${dailyLogs}\n`;
                    } else {
                        chatStr += "--- ล็อกการพูดคุยในร้านวันนี้ ---\nไม่มีประวัติการพูดคุยในวันนี้\n";
                    }
                } else {
                    chatStr += "--- ล็อกการพูดคุยในร้านวันนี้ ---\nไม่มีประวัติการพูดคุยในวันนี้\n";
                }
            }
        } catch (chatErr) {
            console.error("Brief API: Failed to get chat logs:", chatErr);
            chatStr += "--- ล็อกการพูดคุยในร้านวันนี้ ---\nไม่สามารถดึงข้อมูลแชทได้\n";
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
