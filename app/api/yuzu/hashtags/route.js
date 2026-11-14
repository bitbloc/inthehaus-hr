import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabaseClient';
import { getGenAI, GEMINI_MODELS } from '../../../../utils/gemini-client';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const monthParam = searchParams.get('month'); // 'YYYY-MM'
        const tagParam = searchParams.get('tag'); // e.g. '#StaffInsight'
        const searchParam = (searchParams.get('search') || '').trim().toLowerCase();

        // Determine current or requested month
        const now = new Date();
        const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const targetMonth = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : currentMonthStr;

        // Month start & end in +07:00
        const start = new Date(`${targetMonth}-01T00:00:00+07:00`);
        const year = start.getFullYear();
        const monthIndex = start.getMonth();
        const lastDay = new Date(year, monthIndex + 1, 0).getDate();
        const end = new Date(`${targetMonth}-${String(lastDay).padStart(2, '0')}T23:59:59.999+07:00`);

        // 1. Fetch available months from chat history with hashtags
        const { data: monthSample } = await supabase
            .from('yuzu_chat_history')
            .select('created_at')
            .ilike('content', '%#%')
            .order('created_at', { ascending: false });

        const monthSet = new Set();
        if (monthSample && monthSample.length > 0) {
            monthSample.forEach(m => {
                if (m.created_at) {
                    monthSet.add(m.created_at.slice(0, 7));
                }
            });
        }
        // Always include current month
        monthSet.add(currentMonthStr);
        const availableMonths = Array.from(monthSet).sort().reverse();

        // 2. Fetch all hashtag messages for the targeted month
        const { data: monthRecords, error: fetchErr } = await supabase
            .from('yuzu_chat_history')
            .select('id, user_id, role, content, message_type, created_at, group_id')
            .gte('created_at', start.toISOString())
            .lte('created_at', end.toISOString())
            .ilike('content', '%#%')
            .order('created_at', { ascending: false });

        if (fetchErr) {
            throw fetchErr;
        }

        // 3. Fetch employees to map names
        const { data: employees } = await supabase
            .from('employees')
            .select('id, line_user_id, line_bot_id, name, nickname, position, photo_url');

        const nameMap = {};
        if (employees) {
            employees.forEach(emp => {
                const label = emp.nickname ? `${emp.name} (${emp.nickname})` : emp.name;
                if (emp.id) nameMap[String(emp.id)] = { name: label, position: emp.position, photo_url: emp.photo_url };
                if (emp.line_bot_id) nameMap[emp.line_bot_id.toLowerCase()] = { name: label, position: emp.position, photo_url: emp.photo_url };
                if (emp.line_user_id) nameMap[emp.line_user_id.toLowerCase()] = { name: label, position: emp.position, photo_url: emp.photo_url };
            });
        }

        // 4. Calculate Hashtag distribution in this month
        const tagMap = {};
        const recordsWithMeta = [];

        (monthRecords || []).forEach(record => {
            const rawContent = record.content || '';
            const tags = rawContent.match(/#[a-zA-Z0-9_\u0E00-\u0E7F]+/g) || [];
            
            tags.forEach(t => {
                tagMap[t] = (tagMap[t] || 0) + 1;
            });

            const staffInfo = (record.user_id && nameMap[record.user_id.toLowerCase()]) || null;

            recordsWithMeta.push({
                ...record,
                tags,
                senderName: staffInfo?.name || (record.role === 'model' ? 'Yuzu (AI Assistant)' : 'พนักงาน / สมาชิกกลุ่ม'),
                senderPosition: staffInfo?.position || '',
                senderPhoto: staffInfo?.photo_url || null
            });
        });

        const hashtagList = Object.entries(tagMap)
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count);

        // 5. Filter records by tag and/or search query
        let filteredRecords = recordsWithMeta;

        if (tagParam && tagParam !== 'ALL') {
            const normalizedTag = tagParam.startsWith('#') ? tagParam.toLowerCase() : `#${tagParam.toLowerCase()}`;
            filteredRecords = filteredRecords.filter(r => 
                r.tags.some(t => t.toLowerCase() === normalizedTag)
            );
        }

        if (searchParam) {
            filteredRecords = filteredRecords.filter(r =>
                r.content.toLowerCase().includes(searchParam) ||
                (r.senderName && r.senderName.toLowerCase().includes(searchParam))
            );
        }

        return NextResponse.json({
            success: true,
            selectedMonth: targetMonth,
            availableMonths,
            totalMonthHashtagCount: monthRecords?.length || 0,
            hashtags: hashtagList,
            records: filteredRecords
        });

    } catch (error) {
        console.error("Yuzu Hashtag API Error:", error);
        return NextResponse.json({
            success: false,
            error: error.message || "Failed to fetch hashtag records"
        }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { month, tag, records } = body;

        if (!records || !Array.isArray(records) || records.length === 0) {
            return NextResponse.json({
                success: false,
                error: "ไม่พบรายการบันทึกสำหรับวิเคราะห์และสรุปผล"
            }, { status: 400 });
        }

        const instance = getGenAI();
        if (!instance) {
            return NextResponse.json({
                success: false,
                error: "ไม่สามารถเชื่อมต่อ Gemini API ได้ (Missing API Key)"
            }, { status: 500 });
        }

        const formattedLogs = records.slice(0, 40).map((r, i) => {
            const dateStr = new Date(r.created_at).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
            return `${i + 1}. [${dateStr}] ผู้ส่ง: ${r.senderName || 'นิรนาม'} | ข้อความ: ${r.content}`;
        }).join('\n');

        const systemPrompt = `คุณคือผู้เชี่ยวชาญด้านการตรวจสอบและพัฒนาการปฏิบัติงานของร้านอาหาร/คาเฟ่ (Restaurant Operations & HR Auditor) ของร้าน "In The Haus" (นครพนม)
หน้าที่ของคุณคือวิเคราะห์ Log ข้อความของแท็ก "${tag || 'ทั้งหมด'}" ประจำเดือน "${month}" และสรุปเป็นรายงานเชิงบริหารที่กระชับ ชัดเจน และนำไปปฏิบัติได้จริง

กรุณาตอบเป็น JSON รูปแบบนี้เท่านั้น:
{
  "executiveSummary": "สรุปภาพรวม 2-3 บรรทัดว่าเกิดอะไรขึ้นในเดือนนี้เกี่ยวกับแท็กนี้ มีแนวโน้มดีขึ้นหรือมีจุดน่ากังวลอย่างไร",
  "keyIncidents": [
    "รายการเหตุการณ์สำคัญประเด็นที่ 1 พร้อมระบุบุคคลหรืออุปกรณ์ที่เกี่ยวข้อง (ถ้ามี)",
    "รายการเหตุการณ์สำคัญประเด็นที่ 2"
  ],
  "recurringPatterns": "รูปแบบปัญหาหรือพฤติกรรมที่เกิดขึ้นซ้ำๆ (เช่น วันที่มีปัญหาบ่อย หรือบุคคลที่เกี่ยวข้องบ่อย)",
  "rootCauseAnalysis": "การวิเคราะห์สาเหตุที่แท้จริงเบื้องหลังเหตุการณ์เหล่านี้",
  "recommendations": [
    "ข้อเสนอแนะเชิงปฏิบัติการข้อที่ 1 สำหรับผู้จัดการ/เจ้าของร้าน",
    "ข้อเสนอแนะเชิงปฏิบัติการข้อที่ 2"
  ],
  "severityLevel": "LOW | MEDIUM | HIGH"
}
กฎสำคัญ:
- ห้ามใส่ Markdown code block หรือดอกจันในเนื้อหา ให้ตอบเป็น JSON ล้วนๆ
- ภาษาไทยสุภาพ ชัดเจน ตรงไปตรงมาแบบมืออาชีพ`;

        let summaryResult = null;
        const models = GEMINI_MODELS.FALLBACKS;

        for (const modelName of models) {
            try {
                const model = instance.getGenerativeModel({
                    model: modelName,
                    generationConfig: { responseMimeType: "application/json" }
                });

                const result = await model.generateContent(`${systemPrompt}\n\n--- ข้อมูลบันทึกเหตุการณ์ ---\n${formattedLogs}`);
                const rawText = result.response.text();
                const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
                summaryResult = JSON.parse(cleanJson);
                break;
            } catch (err) {
                console.warn(`Gemini Hashtag Summary error with ${modelName}:`, err);
            }
        }

        if (!summaryResult) {
            return NextResponse.json({
                success: false,
                error: "ระบบ AI ไม่สามารถประมวลผลข้อความสรุปได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง"
            }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            summary: summaryResult
        });

    } catch (error) {
        console.error("Yuzu Hashtag Summary POST Error:", error);
        return NextResponse.json({
            success: false,
            error: error.message || "Failed to generate AI summary"
        }, { status: 500 });
    }
}

