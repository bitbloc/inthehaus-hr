import { NextResponse } from 'next/server';
import { getGeminiResponse } from '../../../../utils/gemini';
import { 
    getYuzuConfigs, 
    getAllEmployeesData, 
    getEmployeeByLineId, 
    getDailyContent 
} from '../../../../utils/memory';
import { getCompactWeather } from '../../../../utils/weather';
import { 
    getGoldPrice, 
    getOilPrice, 
    getElectricityPrice, 
    getIngredientPrices
} from '../../../../utils/price';
import { getPriceComparison } from '../../../../utils/price_scraper';
import { getAccurateNews } from '../../../../utils/news';
import { createClient } from '@supabase/supabase-js';

export async function POST(request) {
    try {
        const { message, userId: inputUserId } = await request.json();
        
        if (!message) {
            return NextResponse.json({ success: false, error: "Message is required" }, { status: 400 });
        }

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        );

        // Fetch configs to resolve Boss UIDs if no userId is provided
        const configs = await getYuzuConfigs();
        const fatherUid = configs?.father_uid;
        const motherUid = configs?.mother_uid;
        
        // Default to Father UID (Boss) if not specified, so Yuzu speaks in Boss mode
        const userId = inputUserId || fatherUid || 'admin_dashboard';

        // 1. Build Context
        let context = "";

        // Staff roster
        const allEmployees = await getAllEmployeesData();
        if (allEmployees && allEmployees.length > 0) {
            context += `[OFFICIAL_STAFF_ROSTER_START - ยึดถือข้อมูลนี้เป็นความจริงสูงสุด ห้ามเดาหรือเปลี่ยนตำแหน่งเอง]\n`;
            allEmployees.forEach(emp => {
                const displayName = emp.nickname || emp.name;
                const altName = (emp.nickname && emp.name && emp.nickname !== emp.name) ? ` (ชื่อจริง: ${emp.name})` : '';
                const position = emp.position || 'ทีมงาน';
                const lineId = emp.line_bot_id || emp.line_user_id || 'unlinked';
                context += `- พนักงาน: ${displayName}${altName} | ตำแหน่ง: ${position} | LINE_UID: ${lineId}\n`;
            });
            context += `[OFFICIAL_STAFF_ROSTER_END]\n\n`;
        }

        // Sender Info
        const employee = await getEmployeeByLineId(userId);
        const isBoss = userId === fatherUid || userId === motherUid || userId === 'admin_dashboard';
        if (isBoss) {
            context += `คุณกำลังคุยกับ: เจ้านาย (${employee?.nickname || employee?.name || 'Owner/Admin'})\n`;
            context += `สถานะ: เจ้าของร้าน (Owner)\n`;
        } else if (employee) {
            context += `คุณกำลังคุยกับ: ${employee.nickname || employee.name} (${employee.position})\n`;
            context += `สถานะพนักงาน: ${employee.employment_status || 'Fulltime'}\n`;
        } else {
            context += `คุณกำลังคุยกับ: ผู้บริหาร (ผ่านหน้า Admin Dashboard)\n`;
        }

        // Weather
        const compactWeather = await getCompactWeather();
        if (compactWeather) context += `${compactWeather}\n`;

        // Gold, Oil, Electricity
        if (message.includes('ทอง')) context += await getGoldPrice() + "\n";
        if (message.includes('น้ำมัน')) context += await getOilPrice() + "\n";
        if (message.includes('ไฟ')) context += await getElectricityPrice() + "\n";

        // Ingredients
        const ingredientKeywords = ['วัตถุดิบ', 'ราคาอาหาร', 'หมู', 'ไก่', 'เนื้อ', 'ปลา', 'ไข่', 'ผัก', 'ผลไม้', 'ข้าว'];
        if (ingredientKeywords.some(kw => message.includes(kw))) {
            if (message.includes('ขึ้น') || message.includes('ลง') || message.includes('ไหม') || message.includes('เปรียบเทียบ')) {
                context += await getPriceComparison() + "\n";
            } else {
                context += await getIngredientPrices() + "\n";
            }
        }

        // News
        const newsKeywords = ['ข่าว', 'อัปเดต', 'สรุป', 'ส่อง', 'ติดตาม', 'สถานการณ์'];
        if (newsKeywords.some(kw => message.includes(kw))) {
            context += await getAccurateNews() + "\n";
        }

        // Dynamic Group Chat Logs today - get the most recent group chat log to answer chat summary questions
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
                    context += `\nเหตุการณ์ที่เกิดขึ้นในแชทกลุ่มวันนี้ (ใช้สำหรับอ้างอิงหรือสรุปงาน):\n${dailyLogs}\n`;
                }
            }
        } catch (e) {
            console.error("Failed to query active group chat history for admin console:", e);
        }

        // 2. Call Gemini Response
        const response = await getGeminiResponse(message, context, [], userId);

        // 3. Clean and parse tags
        let cleanedResponse = response
            .split('[YUZU_LEARNING]')[0]
            .split('[ROSTER_ACTION]')[0]
            .split('[STOCK_ACTION]')[0]
            .split('[STOCK_AUDIT_FORM]')[0]
            .split('[YUZU_MEME]')[0]
            .trim();

        // Strip FLEX tags for web client readability
        cleanedResponse = cleanedResponse
            .replace(/\[\/?FLEX_[A-Z]+\]/g, '')
            .trim();

        // Optional metadata parsing for UI features
        let actionMetadata = {};
        if (response.includes('[YUZU_LEARNING]')) {
            try {
                actionMetadata.learning = JSON.parse(response.split('[YUZU_LEARNING]')[1].trim());
            } catch(e) {}
        }
        if (response.includes('[STOCK_ACTION]')) {
            try {
                actionMetadata.stock = JSON.parse(response.split('[STOCK_ACTION]')[1].trim());
            } catch(e) {}
        }
        if (response.includes('[ROSTER_ACTION]')) {
            try {
                actionMetadata.roster = JSON.parse(response.split('[ROSTER_ACTION]')[1].trim());
            } catch(e) {}
        }

        return NextResponse.json({ 
            success: true, 
            response: cleanedResponse,
            metadata: actionMetadata 
        });

    } catch (error) {
        console.error("Yuzu Chat API Error:", error);
        return NextResponse.json({ 
            success: false, 
            error: error.message || "Unknown error" 
        }, { status: 500 });
    }
}
