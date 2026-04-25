import { NextResponse } from 'next/server';
import { Client } from '@line/bot-sdk';
import { getSchemaWeather, formatWeatherMessage } from '../../../utils/weather';
import { getGeminiResponse, classifyAndAnalyzeImage, getDailySummary, generateImage, transcribeAudio, extractOrderFromText, extractReservationFromText } from '../../../utils/gemini';
import { getGoldPrice, getOilPrice, getElectricityPrice, getIngredientPrices } from '../../../utils/price';
import { getPriceComparison } from '../../../utils/price_scraper';
import { saveMessage, getChatHistory, getDailyContent, cleanupOldHistory, getEmployeeHistory, getEmployeeByLineId, getAllEmployeesData, getYuzuConfigs, checkIsBoss } from '../../../utils/memory';
import { getAccurateNews } from '../../../utils/news';
import { getEffectiveRoster } from '../../../utils/roster';

export const maxDuration = 60;

// Simple in-memory cache to prevent double-clicks
const processedPostbacks = new Set();

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export async function POST(request) {
  try {
    const body = await request.json();
    const events = body.events || [];
    let handledLocally = false;

    if (events.length === 0 || (events.length > 0 && events[0].replyToken === '00000000000000000000000000000000')) {
      return NextResponse.json({ success: true, message: 'Webhook verified' }, { status: 200 });
    }

    // Run cleanup occasionally (simple heuristic: on every webhook call but could be more sophisticated)
    cleanupOldHistory().catch(e => console.error("Cleanup Error:", e));

    for (const event of events) {
      if (event.type === 'message') {
        const groupId = event.source.groupId || event.source.userId;
        const userId = event.source.userId;

        // Handle Text Messages
        if (event.message.type === 'text') {
          const rawText = event.message.text.trim();
          const text = rawText.toLowerCase();
          
          if (text === 'อากาศ' || text === 'weather') {
            const weatherData = await getSchemaWeather();
            const replyText = formatWeatherMessage(weatherData);
            await client.replyMessage(event.replyToken, { type: 'text', text: replyText });
            handledLocally = true;
          } else if (text === 'hr_wrap' || text === 'hrwrap' || text === 'summary') {
            // ... (HR WRAP logic stays as is)
            const { supabase } = await import('../../../lib/supabaseClient');
            const { format, differenceInMinutes, addHours } = await import('date-fns');
            const START_OF_DAY_UTC = new Date();
            START_OF_DAY_UTC.setHours(0, 0, 0, 0);
            const { data: logs, error } = await supabase
              .from('attendance_logs')
              .select('*, employees(name, position)')
              .gte('timestamp', START_OF_DAY_UTC.toISOString())
              .order('timestamp', { ascending: true });

            if (error) {
              await client.replyMessage(event.replyToken, { type: 'text', text: 'Error fetching data: ' + error.message });
              handledLocally = true;
              continue;
            }

            const summary = {};
            logs.forEach(log => {
              const name = log.employees?.name || 'Unknown';
              const position = log.employees?.position || '-';
              if (!summary[name]) summary[name] = { name, position, in: null, out: null };
              if (log.action_type === 'check_in') summary[name].in = new Date(log.timestamp);
              if (log.action_type === 'check_out') summary[name].out = new Date(log.timestamp);
            });

            const summaryList = Object.values(summary).sort((a, b) => (a.in?.getTime() || 0) - (b.in?.getTime() || 0));
            const safeThaiTime = (date) => format(addHours(date, 7), 'HH:mm');
            const todayStr = format(addHours(new Date(), 7), 'dd/MM/yyyy');
            let msg = `สรุปการเข้างาน ${todayStr}\n`;
            let count = 0;

            for (const s of summaryList) {
              count++;
              const inTime = s.in ? safeThaiTime(s.in) : '-';
              const outTime = s.out ? safeThaiTime(s.out) : '-';
              let durationStr = '';
              if (s.in) {
                const diff = differenceInMinutes(s.out || new Date(), s.in);
                durationStr = `(${Math.floor(diff / 60)}ชม. ${diff % 60}น.)`;
                if (!s.out) durationStr += ' [Working]';
              }
              msg += `\n👤 ${s.name} (${s.position})\n   เข้า: ${inTime} | ออก: ${outTime}\n   รวม: ${durationStr}\n`;
            }
            if (count === 0) msg += "\nยังไม่มีการลงเวลาวันนี้";

            await client.replyMessage(event.replyToken, { type: 'text', text: msg });
            handledLocally = true;
          } else if (text.includes('เช็คตาราง') || text.includes('roster') || text.includes('ตารางงาน') || text.includes('ใครเข้ากะ')) {
            const { format, addHours, startOfTomorrow, parseISO } = await import('date-fns');
            const targetDate = text.includes('พรุ่งนี้') ? startOfTomorrow() : addHours(new Date(), 7);
            const dateStr = format(targetDate, 'dd/MM/yyyy');
            const roster = await getEffectiveRoster(targetDate);

            if (roster.length === 0) {
              await client.replyMessage(event.replyToken, { type: 'text', text: `📅 ตารางงานวันที่ ${dateStr}\n\nเมี๊ยว~ ยังไม่มีใครลงเวลายังไงเลยค่ะ` });
            } else {
              const contents = [
                { type: 'text', text: `📅 ตารางงาน ${dateStr}`, weight: 'bold', size: 'lg', color: '#1DB446' },
                { type: 'separator', margin: 'md' }
              ];
              
              roster.forEach(emp => {
                const shiftStart = emp.shift?.start_time?.slice(0,5);
                const shiftEnd = emp.shift?.end_time?.slice(0,5);
                
                let statusEmoji = "⏳";
                let statusColor = "#666666";
                let actualTimeStr = "";

                if (emp.attendance?.check_in) {
                  statusEmoji = "✅";
                  statusColor = "#1DB446";
                  actualTimeStr = format(addHours(new Date(emp.attendance.check_in), 7), "HH:mm");
                  
                  // Late detection: Compare actualTimeStr with shiftStart
                  if (shiftStart && actualTimeStr > shiftStart) {
                    statusColor = "#ff4b00"; // Late
                    statusEmoji = "⚠️"; 
                  }
                }
                if (emp.attendance?.check_out) {
                  statusEmoji = "🛑";
                  statusColor = "#666666";
                }

                contents.push({
                  type: 'box', layout: 'horizontal', margin: 'md',
                  contents: [
                    { type: 'text', text: `${statusEmoji} ${emp.nickname || emp.name}`, flex: 3, size: 'sm', weight: 'bold', color: statusColor },
                    { type: 'text', text: emp.shift?.name || 'Custom', flex: 2, size: 'xs', color: '#aaaaaa', align: 'center' },
                    { type: 'text', text: actualTimeStr ? `${actualTimeStr} (${shiftStart})` : `${shiftStart}-${shiftEnd}`, flex: 3, size: 'sm', align: 'end', color: (statusColor === '#ff4b00') ? '#ff4b00' : (emp.isOverride ? '#007bff' : '#333333') }
                  ]
                });
              });

              await client.replyMessage(event.replyToken, {
                type: 'flex',
                altText: `📅 ตารางงาน ${dateStr}`,
                contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', contents: contents } }
              });
            }
            handledLocally = true;
          } else if (text === 'ลางาน') {
            const { supabase } = await import('../../../lib/supabaseClient');
            const { format, parseISO } = await import('date-fns');
            const { data: leaves, error } = await supabase
              .from('leave_requests')
              .select('*, employees(name, position)')
              .eq('status', 'pending')
              .order('leave_date', { ascending: true });

            if (error) {
              await client.replyMessage(event.replyToken, { type: 'text', text: 'Error fetching data: ' + error.message });
              handledLocally = true;
              continue;
            }

            let msg = `📋 รายการรออนุมัติลางาน\n`;
            if (leaves?.length > 0) {
              leaves.forEach(l => {
                const dateStr = l.leave_date ? format(parseISO(l.leave_date), 'dd/MM/yyyy') : '-';
                msg += `\n👤 ${l.employees?.name} (${l.employees?.position})\n   วันที่: ${dateStr}\n   ประเภท: ${l.leave_type}\n   เหตุผล: ${l.reason || '-'}\n`;
              });
              msg += `\n📌 รวมรออนุมัติ: ${leaves.length} รายการ`;
            } else {
              msg += "\n✅ ไม่มีรายการขอลาหยุดที่รออนุมัติ";
            }
            await client.replyMessage(event.replyToken, { type: 'text', text: msg });
            handledLocally = true;
          } else if (text.startsWith('yuzu') || text.startsWith('ยูซุ')) {
            const query = text.startsWith('yuzu') ? rawText.slice(4).trim() : rawText.slice(4).trim();
            if (!query) {
              await client.replyMessage(event.replyToken, { type: 'text', text: 'ยูซุยินดีให้บริการครับ พิมพ์ "yuzu" หรือ "ยูซุ" ตามด้วยสิ่งที่คุณอยากรู้ได้เลยครับ' });
              handledLocally = true;
              continue;
            }

            // --- Specialized Yuzu Commands ---
            
            // 0. Diagnostic Command
            if (text === 'yuzu who am i' || text === 'yuzu ใครคือฉัน') {
              const { getYuzuConfigs } = await import('../../../utils/memory');
              const { father_uid, mother_uid } = await getYuzuConfigs();
              
              const isFather = userId === father_uid;
              const isMother = userId === mother_uid;
              let identity = "ทีมงานทั่วไปค่ะ";
              if (isFather) identity = "คุณพ่อ (บอสใหญ่) ค่ะ! 🙏";
              if (isMother) identity = "คุณแม่ (บอสใหญ่) ค่ะ! 🙏";
              
              await client.replyMessage(event.replyToken, { 
                type: 'text', 
                text: `คุณคือ: ${identity}\nUser ID: ${userId || 'ไม่พบ ID ค่ะ'}\n(ข้อมูลนี้ใช้เพื่อตรวจสอบสถานะบอสเท่านั้นนะคะ เมี๊ยว~)` 
              });
              handledLocally = true;
              continue;
            }
            
            // 1. Image Generation
            if (text.startsWith('yuzu วาดรูป') || text.startsWith('yuzu generate image')) {
              const imagePrompt = query.replace('วาดรูป', '').trim();
              const result = await generateImage(imagePrompt);

              if (result.success && result.imageUrl) {
                // Send as Image Message
                await client.replyMessage(event.replyToken, [
                  { 
                    type: 'text', 
                    text: `วาดเสร็จแล้วค๊าาา! นี่คือภาพ "${result.prompt}" สไตล์น้องยูซุนะคะ เมี๊ยว~` 
                  },
                  {
                    type: 'image',
                    originalContentUrl: result.imageUrl,
                    previewImageUrl: result.imageUrl
                  }
                ]);
              } else {
                // Send error or text response
                const errorMsg = typeof result === 'string' ? result : (result.message || "วาดไม่สำเร็จค่ะ");
                await client.replyMessage(event.replyToken, { type: 'text', text: errorMsg });
              }
              handledLocally = true;
              continue;
            }

            // 2. Daily Summary
            if (text === 'สรุปประจำวัน' || text === 'summary') {
              console.log("Yuzu: Daily Summary Requested");
              const content = await getDailyContent(groupId);
              const summary = await getDailySummary(content);
              await client.replyMessage(event.replyToken, { type: 'text', text: summary });
              handledLocally = true;
              continue;
            }

            // 2.1 Slip Summary & Export
            const isSlipSummary = text.includes('สรุปยอดโอน') || text.includes('ยอดโอนล่าสุด');
            if (isSlipSummary) {
              console.log("Yuzu: Slip Summary Requested");
              const { supabase } = await import('../../../lib/supabaseClient');
              const { format, addHours, subDays } = await import('date-fns');
              
              let targetDateStr = null;
              let isLatest = false;
              let dateTitle = "วันนี้";
              
              const bkkNow = addHours(new Date(), 7);

              if (text.includes('เมื่อวาน')) {
                  targetDateStr = format(subDays(bkkNow, 1), 'yyyy-MM-dd');
                  dateTitle = "เมื่อวานนี้";
              } else if (text.includes('ล่าสุด')) {
                  isLatest = true;
                  dateTitle = "ล่าสุด";
              } else {
                  // Try to find DD/MM/YYYY or DD-MM-YYYY
                  const dateRegex = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/;
                  const match = text.match(dateRegex);
                  if (match) {
                      let [_, d, m, y] = match;
                      if (y.length === 4 && parseInt(y) > 2500) y = (parseInt(y) - 543).toString(); // Convert Buddhist year to AD
                      targetDateStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
                      dateTitle = `วันที่ ${d}/${m}/${y}`;
                  } else {
                      // Default to today
                      targetDateStr = format(bkkNow, 'yyyy-MM-dd');
                  }
              }
              
              let dbQuery = supabase.from('slip_transactions').select('amount, user_id, timestamp').eq('is_deleted', false);
              
              if (isLatest) {
                  dbQuery = dbQuery.order('timestamp', { ascending: false }).limit(1);
              } else {
                  dbQuery = dbQuery.eq('date', targetDateStr);
              }

              const { data: slips, error } = await dbQuery;

              if (error) {
                await client.replyMessage(event.replyToken, { type: 'text', text: 'เมี๊ยว~ เกิดข้อผิดพลาดในการดึงยอดโอนค่ะ' });
                handledLocally = true;
                continue;
              }

              let total = 0;
              let count = slips.length;
              slips.forEach(s => total += Number(s.amount));
              
              let replyText = `📊 สรุปยอดโอน ${dateTitle}\n\n`;
              if (isLatest) {
                 if (count > 0) {
                     replyText = `💸 ยอดโอนล่าสุด:\n\nจำนวนเงิน: ${Number(slips[0].amount).toLocaleString('th-TH', {minimumFractionDigits: 2})} บาท\nเวลา: ${format(addHours(new Date(slips[0].timestamp), 7), 'HH:mm:ss น.')}`;
                 } else {
                     replyText = `เมี๊ยว~ ยังไม่มียอดโอนเลยค่ะ`;
                 }
              } else {
                 replyText += `✅ จำนวนสลิป: ${count} รายการ\n`;
                 replyText += `💰 ยอดรวมทั้งหมด: ${total.toLocaleString('th-TH', {minimumFractionDigits: 2})} บาท\n\n`;
                 replyText += `⏰ รายละเอียดเวลาโอน:\n`;
                 
                 // Sort slips by timestamp early to late
                 const sortedSlips = [...slips].sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
                 
                 sortedSlips.forEach((s) => {
                     const timeStr = format(addHours(new Date(s.timestamp), 7), 'HH:mm');
                     replyText += `- เวลา ${timeStr} น. : ${Number(s.amount).toLocaleString('th-TH', {minimumFractionDigits: 2})} บาท\n`;
                 });
                 
                 replyText += `\n(พิมพ์ "yuzu export slips" เพื่อดาวน์โหลด Excel ค่ะ)`;
              }

              // Image generation condition
              const wantsImage = (text.includes('ภาพ') || text.includes('รูป')) && !text.includes('ไม่ต้อง') && !text.includes('ไม่เอา');
              
              if (wantsImage && count > 0 && !isLatest) {
                const prompt = `Premium minimalist graphic design summary for "In The Haus" restaurant. White background, bold black typography, high contrast. Large numbers for "สรุปยอดโอนรวม ${total.toLocaleString('th-TH', {minimumFractionDigits: 0})} บาท". Simple clean list of transaction times. Stylized brand name "In The Haus" in script or elegant font. No cats, no 3D, no colorful backgrounds. Professional report aesthetic.`;
                const genResult = await generateImage(prompt);
                
                if (genResult.success && genResult.imageUrl) {
                   await client.replyMessage(event.replyToken, [
                     { type: 'text', text: replyText },
                     { type: 'image', originalContentUrl: genResult.imageUrl, previewImageUrl: genResult.imageUrl }
                   ]);
                } else {
                   await client.replyMessage(event.replyToken, { type: 'text', text: replyText });
                }
              } else {
                await client.replyMessage(event.replyToken, { type: 'text', text: replyText });
              }
              handledLocally = true;
              continue;
            }

            if (text === 'yuzu export slips' || text === 'export slips') {
               const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://inthehaus-hr.vercel.app';
               const rawUrl = `${baseUrl}/admin/yuzu/slips/report`;
               await client.replyMessage(event.replyToken, { type: 'text', text: `📥 ดาวน์โหลดรายงานสรุปยอดโอนแบบ PDF สวยๆ ได้ที่ลิงก์นี้เลยค่ะ เมี๊ยว~\n${rawUrl}` });
               handledLocally = true;
               continue;
            }

            // 2.5 Employee Performance Report (Special Command for Owner)
            if (text.includes('รายงานพนักงาน') || text.includes('ประเมินผล')) {
              console.log("Yuzu: Employee Report Requested");
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
              }
              
              // For now, we use dailyLogs as context, but Gemini is instructed to look for performance
              const reportPrompt = `ช่วยสรุปรายงานพฤติกรรมและการทำงานของพนักงานจากข้อมูลที่มีหน่อยค่ะ ยึดตามรายชื่อพนักงานที่มีในระบบต่อไปนี้:\n${contextContent}\nและนี่คือประวัติการแชท/ทำงานของวันนี้:\n${dailyLogs || "(วันนี้ยังไม่มีประวัติการแชทให้วิเคราะห์)"}\n\nโปรดเน้นวิเคราะห์แต่ละคนตามรายชื่อที่มี และรายงานความพร้อมให้เจ้านายฟัง (ถ้าประวัติแชทว่างก็บอกสถานะของรายชื่อบุคคลไปก่อน)`;
              const report = await getGeminiResponse(reportPrompt, "คุณกำลังทำรายงานประเมินผลพนักงานให้เจ้าของร้าน โปรดวิเคราะห์อย่างละเอียดและเป็นกลาง (แต่ยังคงสไตล์ยูซุปากแซ่บ)", [], userId);
              await client.replyMessage(event.replyToken, { type: 'text', text: report });
              handledLocally = true;
              continue;
            }

            // 3. Standard Yuzu Chat with Memory
            const history = await getChatHistory(groupId, 100);
            
            let context = "";
            
            // CRITICAL: Robust Team Identity (Always at the top)
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

            // Real-time Employee Sync (Identify current sender)
            const employee = await getEmployeeByLineId(userId);
            const isBoss = await checkIsBoss(userId);
            
            if (isBoss) {
              context += `คุณกำลังคุยกับ: เจ้านาย (${employee?.nickname || employee?.name || 'Owner'})\n`;
              context += `สถานะ: เจ้าของร้าน (Owner)\n`;
            } else if (employee) {
              context += `คุณกำลังคุยกับ: ${employee.nickname || employee.name} (${employee.position})\n`;
              context += `สถานะพนักงาน: ${employee.employment_status || 'Fulltime'}\n`;
            } else {
              context += `(ไม่พบข้อมูลพนักงานในระบบสำหรับ LINE ID นี้: ${userId})\n`;
            }

            const dailyLogs = await getDailyContent(groupId);
            if (dailyLogs) context += `\nเหตุการณ์ที่เกิดขึ้นในแชทกลุ่มวันนี้ (ใช้สำหรับอ้างอิงหรือแซวทีมงาน):\n${dailyLogs}\n`;
            if (text.includes('ทอง')) context += await getGoldPrice() + "\n";
            if (text.includes('น้ำมัน')) context += await getOilPrice() + "\n";
            if (text.includes('ไฟ')) context += await getElectricityPrice() + "\n";
            const ingredientKeywords = ['วัตถุดิบ', 'ราคาอาหาร', 'หมู', 'ไก่', 'เนื้อ', 'ปลา', 'ไข่', 'ผัก', 'ผลไม้', 'ข้าว'];
            if (ingredientKeywords.some(kw => text.includes(kw))) {
               if (text.includes('ขึ้น') || text.includes('ลง') || text.includes('ไหม') || text.includes('เปรียบเทียบ')) {
                  context += await getPriceComparison() + "\n";
               } else {
                  context += await getIngredientPrices() + "\n";
               }
            }
            if (text.includes('อากาศ')) context += formatWeatherMessage(await getSchemaWeather()) + "\n";
            
            // NEW: Injected Latest News Context for accurate real-time reporting
            const newsKeywords = ['ข่าว', 'อัปเดต', 'สรุป', 'ส่อง', 'ติดตาม', 'สถานการณ์'];
            if (newsKeywords.some(kw => text.includes(kw))) {
              console.log("Yuzu: Injecting Latest News Context");
              context += await getAccurateNews() + "\n";
            }

            let response = await getGeminiResponse(query, context, history, userId);
            
            // Proactive Learning: Extract and Save
            // Proactive Learning: Extract and Save
            let cleanedResponse = response;
            
            // Extract YUZU_LEARNING
            if (response.includes('[YUZU_LEARNING]')) {
              try {
                const parts = response.split('[YUZU_LEARNING]');
                const learningJson = parts[1].trim();
                const factData = JSON.parse(learningJson);
                const savedFact = await saveLearnedFact(groupId, factData);
                
                if (savedFact) {
                  console.log("Yuzu Learned a New Fact:", savedFact.content);
                  // Proactive LINE Approval Flex Message
                  const insightFlex = {
                    type: 'bubble',
                    size: 'kilo',
                    header: { type: 'box', layout: 'vertical', backgroundColor: '#9333ea', contents: [{ type: 'text', text: '💡 พบความรู้ใหม่แว่วมาจากแชท', color: '#ffffff', weight: 'bold', size: 'sm' }] },
                    body: {
                      type: 'box', layout: 'vertical', spacing: 'md', contents: [
                        { type: 'text', text: savedFact.content, wrap: true, size: 'sm', weight: 'medium', color: '#333333' },
                        { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
                          { type: 'text', text: 'Keywords:', size: 'xxs', color: '#aaaaaa', flex: 0 },
                          { type: 'text', text: (savedFact.metadata?.keywords || []).join(', '), size: 'xxs', color: '#6366f1', flex: 1, wrap: true }
                        ]}
                      ]
                    },
                    footer: {
                      type: 'box', layout: 'horizontal', spacing: 'sm',
                      contents: [
                        { type: 'button', style: 'primary', color: '#10b981', action: { type: 'postback', label: '✅ อนุมัติ', data: `action=approve_insight&id=${savedFact.id}` } },
                        { type: 'button', style: 'secondary', color: '#f43f5e', action: { type: 'postback', label: '❌ ลบออก', data: `action=reject_insight&id=${savedFact.id}` } }
                      ]
                    }
                  };
                  // Push to the same group or the boss if it's private
                  await client.pushMessage(groupId, { type: 'flex', altText: '💡 ยูซุพบความรู้ใหม่ที่ต้องอนุมัติค่ะ!', contents: insightFlex });
                }
              } catch (e) {
                console.error("Error parsing Yuzu Learning block:", e);
              }
            }

            // Robust cleaning for ALL system tags to prevent them from showing in LINE
            cleanedResponse = response
              .split('[YUZU_LEARNING]')[0]
              .split('[ROSTER_ACTION]')[0]
              .split('[STOCK_ACTION]')[0]
              .split('[STOCK_AUDIT_FORM]')[0]
              .split('[YUZU_MEME]')[0]
              .trim();

            // Save Memory (use original response to keep system tags in history if desired, 
            // or cleanedResponse for cleaner memory. Let's use cleanedResponse for history.)
            const isMoodBooster = ['ชม', 'ขอบคุณ', 'ขอบใจ', 'ดีมาก', 'เก่ง'].some(kw => query.includes(kw));
            const messageType = isMoodBooster ? 'mood_booster' : 'text';
            
            await saveMessage(groupId, userId, 'user', query, messageType);
            await saveMessage(groupId, null, 'model', cleanedResponse, 'text');

            await client.replyMessage(event.replyToken, { type: 'text', text: cleanedResponse });
            
            // New: Handle Yuzu Meme
            if (response.includes('[YUZU_MEME]')) {
              try {
                // Extract just the JSON block (it might have trailing characters if something broke, but usually it's at the end)
                const memePart = response.split('[YUZU_MEME]')[1].trim();
                // Match the first valid JSON block
                const jsonMatch = memePart.match(/\{[\s\S]*?\}/);
                if (jsonMatch) {
                   const memeData = JSON.parse(jsonMatch[0]);
                   if (memeData.prompt) {
                     const result = await generateImage(memeData.prompt);
                     if (result.success && result.imageUrl) {
                       await client.pushMessage(groupId, {
                         type: 'image',
                         originalContentUrl: result.imageUrl,
                         previewImageUrl: result.imageUrl
                       });
                     }
                   }
                }
              } catch (e) {
                console.error("Meme Generation Error:", e);
              }
            }
            
            // New: Handle Roster Proposals
            if (response.includes('[ROSTER_ACTION]')) {
              try {
                const rosterPart = response.split('[ROSTER_ACTION]')[1].trim();
                const actionData = JSON.parse(rosterPart);

                // Failsafe: Skip if placeholders are present
                const hasPlaceholders = 
                  actionData.employee_name === 'WAITING_FOR_NAME' || 
                  actionData.date === 'YYYY-MM-DD' || 
                  !actionData.type;

                if (hasPlaceholders) {
                  console.warn("Yuzu: Roster Action skipped due to placeholders:", actionData);
                  continue; // Skip this action but allow other things to happen
                }

                const isBoss = await checkIsBoss(userId);
                
                let summaryText = "";
                if (actionData.type === 'LEAVE') summaryText = `ขอลาหยุด: ${actionData.employee_name}\nวันที่: ${actionData.date}\nเหตุผล: ${actionData.reason || '-'}`;
                else if (actionData.type === 'SWAP') summaryText = `ขอสลับกะ: ${actionData.from} ↔️ ${actionData.to}\nวันที่: ${actionData.date}`;
                else if (actionData.type === 'CHANGE') summaryText = `ขอปรับกะงาน: ${actionData.employee_name}\nวันที่: ${actionData.date}\nรายละเอียด: ${actionData.details?.note || '-'}`;

                const confirmFlex = {
                  type: 'bubble',
                  header: { type: 'box', layout: 'vertical', backgroundColor: isBoss ? '#ffc107' : '#007bff', contents: [{ type: 'text', text: isBoss ? '👑 บอสสั่งแก้ตารางกะ!' : '📝 ยืนยันข้อมูลตารางงาน', color: isBoss ? '#000000' : '#ffffff', weight: 'bold' }] },
                  body: {
                    type: 'box', layout: 'vertical', contents: [
                      { type: 'text', text: summaryText, wrap: true, size: 'sm' },
                      { type: 'text', text: isBoss ? 'ข้อมูลเป๊ะไหมคะบอส? กดอัปเดตเพื่อเปลี่ยนกะทันทีเงียบๆ ค่ะ เมี๊ยว~' : 'ข้อมูลถูกต้องไหมคะ? ถ้าใช่รบกวนกดยืนยันเพื่อส่งเรื่องให้บอสพิจารณาน้ำตาซึมค่ะ เมี๊ยว~', margin: 'md', size: 'xs', color: '#aaaaaa', wrap: true }
                    ]
                  },
                  footer: {
                    type: 'box', layout: 'horizontal', spacing: 'sm',
                    contents: [
                      { type: 'button', style: 'primary', color: '#06c755', action: { type: 'postback', label: isBoss ? '✅ ยืนยัน/อัปเดต' : '✅ ถูกต้อง', data: `action=confirm_roster&payload=${Buffer.from(JSON.stringify(actionData)).toString('base64')}` } },
                      { type: 'button', style: 'secondary', action: { type: 'postback', label: '❌ ยกเลิก', data: 'action=cancel_roster' } }
                    ]
                  }
                };

                await client.pushMessage(groupId, { type: 'flex', altText: isBoss ? '👑 บอสสั่งแก้ตาราง' : '📝 ยืนยันข้อมูลตารางงาน', contents: confirmFlex });
              } catch (e) {
                console.error("Roster Action Error:", e);
              }
            }

            // New: Handle Stock Audit Form Request
            if (response.includes('[STOCK_AUDIT_FORM]')) {
              try {
                const reqOrigin = new URL(request.url).origin;
                const liffUrl = `${reqOrigin}/stock/audit`;
                
                const auditFlex = {
                  type: 'bubble',
                  header: { type: 'box', layout: 'vertical', backgroundColor: '#ec4899', contents: [{ type: 'text', text: '📋 ฟอร์มตรวจนับสต็อก', color: '#ffffff', weight: 'bold' }] },
                  body: {
                    type: 'box', layout: 'vertical', contents: [
                      { type: 'text', text: 'กดที่ปุ่มด้านล่างเพื่อเปิดฟอร์มนับสต็อกผ่านมือถือ ดึงข้อมูลแบบ Real-time ค่ะ เมี๊ยว~', wrap: true, size: 'sm' }
                    ]
                  },
                  footer: {
                    type: 'box', layout: 'vertical',
                    contents: [
                      { type: 'button', style: 'primary', color: '#111827', action: { type: 'uri', label: '📱 เปิดฟอร์มนับสต็อก', uri: liffUrl } }
                    ]
                  }
                };

                await client.pushMessage(groupId, { type: 'flex', altText: '📋 ฟอร์มตรวจนับสต็อกมาแล้ว', contents: auditFlex });
              } catch (e) {
                console.error("Stock Audit Form Error:", e);
              }
            }

            // New: Handle Stock Proposals
            if (response.includes('[STOCK_ACTION]')) {
              try {
                const stockPart = response.split('[STOCK_ACTION]')[1].trim();
                const actionData = JSON.parse(stockPart);
                
                if (actionData.action === 'CHECK_LOW') {
                   const { fetchLowStock } = await import('../../../utils/stock_api');
                   const lowStockData = await fetchLowStock();
                   if (lowStockData.length === 0) {
                      await client.pushMessage(groupId, { type: 'text', text: '✅ เช็คให้แล้วค่ะ ไม่มีรายการสินค้าที่เหลือน้อยเลย สบายใจได้ เมี๊ยว~' });
                   } else {
                      let msg = '⚠️ สินค้าใกล้หมดสต็อก:\n\n';
                      lowStockData.forEach(item => {
                         msg += `- ${item.name} (${item.category || 'ทั่วไป'}): เหลือ ${item.current_quantity} ${item.unit} (จุดสั่งซื้อ: ${item.reorder_point})\n`;
                      });
                      await client.pushMessage(groupId, { type: 'text', text: msg });
                   }
                } else if (actionData.action === 'CHECK_ALL') {
                   const { fetchStockItems } = await import('../../../utils/stock_api');
                   const allItems = await fetchStockItems();
                   let msg = '📦 รายการสินค้าทั้งหมด:\n\n';
                   if (allItems.length > 0) {
                      allItems.slice(0, 50).forEach(item => {
                         msg += `- ${item.name}: ${item.current_quantity} ${item.unit}\n`;
                      });
                      if (allItems.length > 50) msg += `... (และอื่นๆ อีก ${allItems.length - 50} รายการ)`;
                   } else {
                      msg += 'ยังไม่มีสินค้าในระบบค่ะ';
                   }
                   await client.pushMessage(groupId, { type: 'text', text: msg });
                } else if (actionData.action === 'CHECK_HISTORY') {
                   const { fetchStockHistory, fetchStockItems } = await import('../../../utils/stock_api');
                   const { format, addHours } = await import('date-fns');
                   let historyData = [];
                   let title = 'ประวัติอัปเดตสต็อกล่าสุด';
                   
                   if (actionData.itemName && actionData.itemName !== 'ชื่อสินค้า(มีหรือไม่มีก็ได้)') {
                      const searchItems = await fetchStockItems(actionData.itemName);
                      const item = searchItems.find(i => i.name === actionData.itemName) || searchItems[0];
                      if (item) {
                         historyData = await fetchStockHistory(item.id);
                         title = `ประวัติอัปเดตสต็อก: ${item.name}`;
                      } else {
                         await client.pushMessage(groupId, { type: 'text', text: `❌ หาประวัติของ "${actionData.itemName}" ไม่เจอค่ะ ไม่มีสินค้านี้ในระบบ เมี๊ยว~` });
                         return;
                      }
                   } else {
                      historyData = await fetchStockHistory();
                   }
                   
                   if (historyData.length === 0) {
                      await client.pushMessage(groupId, { type: 'text', text: `ไม่มีการเคลื่อนไหวสต็อกเลยค่ะ สงบเงียบมาก เมี๊ยว~` });
                   } else {
                      let msg = `🕒 ${title}:\n\n`;
                      // Sort latest first and take top 10
                      historyData.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
                      historyData.slice(0, 10).forEach(h => {
                         const tTime = format(addHours(new Date(h.created_at), 7), 'dd/MM HH:mm');
                         const sign = h.transaction_type === 'in' ? '📈+' : '📉';
                         const itemName = h.stock_items ? h.stock_items.name : 'สินค้า';
                         msg += `[${tTime}] ${itemName}\n  👉 ${sign}${h.quantity_change} (โดย ${h.performed_by || 'ไม่ทราบ'})\n  💬 ${h.note || '-'}\n\n`;
                      });
                      await client.pushMessage(groupId, { type: 'text', text: msg.trim() });
                   }
                } else if (['RESTOCK', 'DEDUCT', 'UPDATE_ITEM', 'CREATE_ITEM'].includes(actionData.action)) {
                   let confirmMsg = '';
                   if (actionData.action === 'RESTOCK') confirmMsg = `ยืนยันการรับเข้า (In) สต็อก [${actionData.itemName}] จำนวน ${actionData.quantity} หน่วย`;
                   if (actionData.action === 'DEDUCT') confirmMsg = `ยืนยันการเบิก/หักจ่าย (Out) สต็อก [${actionData.itemName}] จำนวน ${actionData.quantity} หน่วย`;
                   if (actionData.action === 'UPDATE_ITEM') confirmMsg = `ยืนยันการอัปเดตข้อมูล [${actionData.itemName}] Reorder: ${actionData.reorder_point}`;
                   if (actionData.action === 'CREATE_ITEM') confirmMsg = `ยืนยันการสร้างรายการสินค้าใหม่: [${actionData.itemName}]`;
                   
                   const confirmFlex = {
                     type: 'bubble',
                     header: { type: 'box', layout: 'vertical', backgroundColor: '#e91e63', contents: [{ type: 'text', text: '📦 อัปเดตคลังสินค้า (Stock)', color: '#ffffff', weight: 'bold' }] },
                     body: {
                       type: 'box', layout: 'vertical', contents: [
                         { type: 'text', text: confirmMsg, wrap: true, size: 'sm', weight: 'bold' },
                         { type: 'text', text: 'ข้อมูลจะถูกส่งเข้า API ทันที โปรดตรวจสอบให้ถูกต้อง เมี๊ยว~', margin: 'md', size: 'xs', color: '#aaaaaa', wrap: true }
                       ]
                     },
                     footer: {
                       type: 'box', layout: 'horizontal', spacing: 'sm',
                       contents: [
                         { type: 'button', style: 'primary', color: '#06c755', action: { type: 'postback', label: '✅ ยืนยัน', data: `action=confirm_stock&payload=${Buffer.from(JSON.stringify(actionData)).toString('base64')}` } },
                         { type: 'button', style: 'secondary', action: { type: 'postback', label: '❌ ยกเลิก', data: 'action=cancel_stock' } }
                       ]
                     }
                   };
                   await client.pushMessage(groupId, { type: 'flex', altText: '📦 ยืนยันการอัปเดตคลังสินค้า', contents: confirmFlex });
                }
              } catch (e) {
                console.error("Stock Action Error:", e);
                await client.pushMessage(groupId, { type: 'text', text: `เกิดข้อผิดพลาดในการดึงข้อมูลจาก API สต็อกค่ะ บอสเช็คโค้ดหรือแจ้งทีมงานทีนะคะ เมี๊ยว~ 😿\nError: ${e.message}` });
              }
            }

            handledLocally = true;
          } else {
            // Save all messages for the daily summary (even non-yuzu ones)
            await saveMessage(groupId, userId, 'user', rawText, 'text');

            // --- AUTO DETECTION: Phone Orders ---
            // Pattern: 10-digit phone number or keywords like "สั่ง"
            const phoneRegex = /(0\d{1,2}-?\d{3,4}-?\d{3,4})/;
            
            const hasPhoneRegex = phoneRegex.test(rawText);
            const isOrderIntent = rawText.startsWith('สั่ง') || rawText.includes('สั่งทางโทรศัพท์') || rawText.includes('สั่งทางโทรสัพท์');
            
            if ((hasPhoneRegex && (rawText.includes('สั่ง') || rawText.length > 20)) || isOrderIntent) {
               console.log("Yuzu: Potential Phone Order Detected");
               const orderData = await extractOrderFromText(rawText);
               if (orderData && orderData.items?.length > 0) {
                  const { supabase } = await import('../../../lib/supabaseClient');
                  const { data: order, error } = await supabase.from('phone_orders').insert({
                    items_json: orderData.items,
                    customer_phone: orderData.phone,
                    customer_name: orderData.customerName,
                    staff_id: userId
                  }).select().single();

                  if (!error && order) {
                    const itemsText = orderData.items.map(i => `- ${i.name} (x${i.qty})`).join('\n');
                    const orderFlex = {
                      type: 'bubble',
                      header: { type: 'box', layout: 'vertical', backgroundColor: '#e8f5e9', contents: [{ type: 'text', text: '📞 พบรายการโทรสั่งอาหาร', weight: 'bold', color: '#2e7d32' }] },
                      body: {
                        type: 'box', layout: 'vertical', contents: [
                          { type: 'text', text: `👤 ลูกค้า: ${orderData.customerName || 'ไม่ระบุ'}`, size: 'sm', weight: 'bold' },
                          { type: 'text', text: `📱 เบอร์โทร: ${orderData.phone || 'ไม่ระบุ'}`, size: 'sm' },
                          { type: 'separator', margin: 'md' },
                          { type: 'text', text: itemsText, wrap: true, margin: 'md', size: 'sm' }
                        ]
                      },
                      footer: {
                        type: 'box', layout: 'horizontal', spacing: 'sm',
                        contents: [
                          { type: 'button', style: 'primary', color: '#1DB446', action: { type: 'postback', label: '✅ รับออเดอร์', data: `action=confirm_phone_order&id=${order.id}` } },
                          { type: 'button', style: 'secondary', action: { type: 'postback', label: '✅ ทำเสร็จแล้ว', data: `action=done_phone_order&id=${order.id}` } }
                        ]
                      }
                    };
                    await client.replyMessage(event.replyToken, { type: 'flex', altText: '📞 บันทึกออเดอร์โทรศัพท์', contents: orderFlex });
                    handledLocally = true;
                  }
               }
            }

            // --- AUTO DETECTION: Table Reservations ---
            const reserveKeywords = ['จองโต๊ะ', 'จองไว้', 'กี่ที่', 'กี่คน', 'จองที่'];
            if (reserveKeywords.some(kw => rawText.includes(kw))) {
               console.log("Yuzu: Potential Reservation Detected");
               const resData = await extractReservationFromText(rawText);
               if (resData && resData.date) {
                  const { supabase } = await import('../../../lib/supabaseClient');
                  const { data: reservation, error } = await supabase.from('table_reservations').insert({
                    customer_name: resData.name,
                    customer_phone: resData.phone,
                    reservation_date: resData.date,
                    reservation_time: resData.time,
                    guests: resData.guests,
                    staff_id: userId
                  }).select().single();

                  if (!error && reservation) {
                    const resFlex = {
                      type: 'bubble',
                      header: { type: 'box', layout: 'vertical', backgroundColor: '#fff3e0', contents: [{ type: 'text', text: '🗓️ พบการจองโต๊ะใหม่', weight: 'bold', color: '#e65100' }] },
                      body: {
                        type: 'box', layout: 'vertical', contents: [
                          { type: 'text', text: `👤 ลูกค้า: ${resData.name || 'ไม่ระบุ'}`, size: 'sm', weight: 'bold' },
                          { type: 'text', text: `📱 เบอร์โทร: ${resData.phone || 'ไม่ระบุ'}`, size: 'sm' },
                          { type: 'text', text: `📅 วันที่: ${resData.date}`, size: 'sm' },
                          { type: 'text', text: `⏰ เวลา: ${resData.time || 'ไม่ระบุ'}`, size: 'sm' },
                          { type: 'text', text: `👥 จำนวน: ${resData.guests} ท่าน`, size: 'sm' }
                        ]
                      },
                      footer: {
                        type: 'box', layout: 'horizontal', spacing: 'sm',
                        contents: [
                          { type: 'button', style: 'primary', color: '#ff9800', action: { type: 'postback', label: '✅ ยืนยันจอง', data: `action=confirm_table_reservation&id=${reservation.id}` } },
                          { type: 'button', style: 'secondary', action: { type: 'postback', label: '❌ ยกเลิก', data: `action=cancel_table_reservation&id=${reservation.id}` } }
                        ]
                      }
                    };
                    await client.replyMessage(event.replyToken, { type: 'flex', altText: '🗓️ บันทึกการจองโต๊ะ', contents: resFlex });
                    handledLocally = true;
                  }
               }
            }
          }
        } 
        
        // Handle Audio Messages
        else if (event.message.type === 'audio') {
          console.log("Yuzu Audio: Voice Message Received");
          try {
            const stream = await client.getMessageContent(event.message.id);
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            const buffer = Buffer.concat(chunks);
            const base64 = buffer.toString('base64');

            const result = await transcribeAudio(base64, "audio/m4a");
            
            if (result.transcript) {
              await saveMessage(groupId, userId, 'user', `[Audio Transcribed] ${result.transcript}`, 'audio_transcript');
              
              let replyMsg = `👂 ยูซุฟังแล้ว สรุปได้ว่า:\n"${result.transcript}"`;
              
              if (result.hasTasks && result.tasks.length > 0) {
                const { supabase } = await import('../../../lib/supabaseClient');
                for (const task of result.tasks) {
                  await supabase.from('staff_tasks').insert({
                    description: task,
                    source_message_id: event.message.id
                  });
                }
                replyMsg += `\n\n📌 ยูซุจดเป็น Task ให้แล้ว ${result.tasks.length} รายการค่ะ เมี๊ยว~`;
              }
              
              await client.replyMessage(event.replyToken, { type: 'text', text: replyMsg });
              handledLocally = true;
            }
          } catch (audioError) {
            console.error("Audio Processing Error:", audioError);
          }
        }

        // Handle Image Messages
        else if (event.message.type === 'image') {
          console.log("Yuzu Vision: Image Received");
          try {
            const stream = await client.getMessageContent(event.message.id);
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            const buffer = Buffer.concat(chunks);
            const base64 = buffer.toString('base64');

            const configs = await getYuzuConfigs();
            const isBoss = await checkIsBoss(userId);

            let positionInstruction = "";
            let empDataForVision = null;

            if (!isBoss) {
              empDataForVision = await getEmployeeByLineId(userId);
              const position = empDataForVision?.position || "ทีมงาน";
              
              if (position.includes("Bar") || position.includes("Floor")) {
                positionInstruction = configs['role_instruction_Bar&Floor'];
              } else if (position.includes("Kitchen") || position.includes("ครัว") || position.includes("Cooking")) {
                positionInstruction = configs['role_instruction_Kitchen'];
              } else if (position.includes("Admin") || position.includes("จัดการ") || position.includes("Owner")) {
                positionInstruction = configs['role_instruction_Admin'];
              }
            }

            const context = await getIngredientPrices();

            // Resolve specific boss role
            let bossRole = null;
            if (userId === configs.father_uid) bossRole = "คุณพ่อ";
            else if (userId === configs.mother_uid) bossRole = "คุณแม่";
            else if (isBoss) bossRole = "บอส";

            // Refined Vision Logic with Role Context
            const result = await classifyAndAnalyzeImage(base64, "image/jpeg", context, bossRole, positionInstruction);

            // Always save image description for summary (Retention 2 days handled in cleanup)
            await saveMessage(groupId, userId, 'user', result.shortDescription, 'image_description');

            // Handle Slips
            if (result.isSlip) {
              const { supabase } = await import('../../../lib/supabaseClient');
              // Resolve the user_id for the database (mapping line_bot_id to line_user_id)
              let mappedDbUserId = userId;
              let senderName = "บุคคลภายนอก (ไม่มีในระบบ)";
              let isAuthorized = false;

              // Aggressive Cache Bypass: Direct query within the slip block with unique fetch options
              const { data: emp, error: empErr } = await supabase
                 .from('employees')
                 .select('line_user_id, line_bot_id, name, nickname, position')
                 .eq('is_active', true)
                 .or(`line_bot_id.eq.${userId},line_user_id.eq.${userId}`)
                 .maybeSingle();

              if (emp) {
                 if (emp.line_user_id) {
                   mappedDbUserId = emp.line_user_id;
                 }
                 if (emp.nickname || emp.name) {
                   senderName = emp.nickname || emp.name;
                 }
                 const position = emp.position ? emp.position.toLowerCase().replace(/\s/g, '') : '';
                 if (position.includes('bar&floor') || position.includes('owner')) {
                    isAuthorized = true;
                 }
              }

              if (!isAuthorized) {
                 await client.replyMessage(event.replyToken, { type: 'text', text: `เมี๊ยว~ คุณ ${senderName} ไม่มีสิทธิ์บันทึกสลิปนะคะ (รับเฉพาะตำแหน่ง Bar&Floor และ Owner ค่ะ)\n[UID: ${userId}] 😾` });
                 handledLocally = true;
                 continue;
              }

              const fileName = `slip_${Date.now()}_${mappedDbUserId}.jpg`;
              const { data: uploadData, error: uploadError } = await supabase.storage
                .from('yuzu-slips')
                .upload(fileName, buffer, { contentType: 'image/jpeg' });

              let slipUrl = null;
              if (!uploadError) {
                const { data: { publicUrl } } = supabase.storage.from('yuzu-slips').getPublicUrl(fileName);
                slipUrl = publicUrl;
              } else {
                console.error("Slip Upload Error:", uploadError);
              }

              // Parse amount safely
              let parsedAmount = 0;
              if (typeof result.amount === 'number') {
                parsedAmount = result.amount;
              } else if (typeof result.amount === 'string') {
                parsedAmount = parseFloat(result.amount.replace(/,/g, ''));
              }

              // Get current date in 'YYYY-MM-DD' format
              const today = new Date();
              const dateStr = today.toISOString().split('T')[0];

              const { error: insertError } = await supabase.from('slip_transactions').insert({
                group_id: groupId,
                user_id: mappedDbUserId,
                amount: parsedAmount,
                slip_url: slipUrl,
                transaction_ref: result.transactionRef || null,
                sender_name: result.senderName || null,
                bank_name: result.bankName || null,
                date: dateStr
              });

              if (insertError) {
                 console.error("Slip Insert Error:", insertError);
                 if (insertError.code === '23505') {
                     await client.replyMessage(event.replyToken, { type: 'text', text: `เมี๊ยว~ สลิปใบนี้ (อ้างอิง: ${result.transactionRef || 'ไม่ทราบ'}) ถูกบันทึกเข้าระบบไปแล้วนะคะ ห้ามส่งซ้ำและห้ามโกงค่ะ! 😾` });
                 } else {
                     await client.replyMessage(event.replyToken, { type: 'text', text: `เมี๊ยว~ บันทึกสลิปไม่สำเร็จค่ะ (Error: ${insertError.message || insertError.code || 'Unknown DB Error'})` });
                 }
              } else {
                 const slipFlexMsg = {
                   type: 'flex',
                   altText: `บันทึกยอดโอน ${parsedAmount.toLocaleString('th-TH', {minimumFractionDigits: 2})} บาท เรียบร้อยค่ะ`,
                   contents: {
                     type: 'bubble',
                     size: 'kilo',
                     header: {
                       type: 'box',
                       layout: 'vertical',
                       backgroundColor: '#1DB446',
                       paddingAll: '20px',
                       contents: [
                         {
                           type: 'text',
                           text: 'RECEIPT',
                           color: '#ffffff80',
                           size: 'xs',
                           weight: 'bold'
                         },
                         {
                           type: 'text',
                           text: 'บันทึกยอดเงินสำเร็จ',
                           color: '#ffffff',
                           size: 'lg',
                           weight: 'bold',
                           margin: 'xs'
                         }
                       ]
                     },
                     body: {
                       type: 'box',
                       layout: 'vertical',
                       paddingAll: '20px',
                       contents: [
                         {
                           type: 'box',
                           layout: 'horizontal',
                           contents: [
                             {
                               type: 'text',
                               text: 'ยอดโอน',
                               color: '#8c8c8c',
                               size: 'sm',
                               gravity: 'center',
                               flex: 1
                             },
                             {
                               type: 'text',
                               text: `฿${parsedAmount.toLocaleString('th-TH', {minimumFractionDigits: 2})}`,
                               align: 'end',
                               color: '#1DB446',
                               size: 'xl',
                               weight: 'bold',
                               flex: 2
                             }
                           ]
                         },
                         { type: 'separator', margin: 'lg' },
                         {
                           type: 'box',
                           layout: 'vertical',
                           margin: 'lg',
                           spacing: 'sm',
                           contents: [
                             {
                               type: 'box',
                               layout: 'horizontal',
                               contents: [
                                 { type: 'text', text: 'ธนาคาร', size: 'sm', color: '#8c8c8c', flex: 1 },
                                 { type: 'text', text: result.bankName || 'ไม่ระบุ', size: 'sm', color: '#333333', align: 'end', flex: 2, wrap: true }
                               ]
                             },
                             {
                               type: 'box',
                               layout: 'horizontal',
                               contents: [
                                 { type: 'text', text: 'ผู้โอน', size: 'sm', color: '#8c8c8c', flex: 1 },
                                 { type: 'text', text: result.senderName || 'ไม่ระบุ', size: 'sm', color: '#333333', align: 'end', flex: 2, wrap: true }
                               ]
                             },
                             {
                               type: 'box',
                               layout: 'horizontal',
                               contents: [
                                 { type: 'text', text: 'ผู้ส่งสลิป', size: 'sm', color: '#8c8c8c', flex: 1 },
                                 { type: 'text', text: senderName, size: 'sm', color: '#333333', align: 'end', flex: 2, wrap: true }
                               ]
                             }
                           ]
                         }
                       ]
                     },
                     footer: {
                       type: 'box',
                       layout: 'vertical',
                       paddingAll: '20px',
                       contents: [
                         {
                           type: 'text',
                           text: 'Yuzu AI จัดการให้แล้วค่ะ เมี๊ยว~ 🐾',
                           size: 'xs',
                           align: 'center',
                           color: '#b0b0b0'
                         }
                       ]
                     }
                   }
                 };
                 await client.replyMessage(event.replyToken, slipFlexMsg);
              }
              handledLocally = true;
            } 
            // Only reply if the AI determined this is a clear photo of food or a cat
            else if (result.shouldReply) {
              await client.replyMessage(event.replyToken, { type: 'text', text: result.analysis });
              handledLocally = true;
            } else {
            }
          } catch (visionError) {
            console.error("Vision Processing Error:", visionError);
          }
        }
        
        // Handle Location Messages
        else if (event.message.type === 'location') {
          console.log("Yuzu Location: Received");
          const { latitude, longitude, address } = event.message;
          const query = `ฉันอยู่ที่นี่: ${address || 'ตำแหน่งปัจจุบัน'} (${latitude}, ${longitude}) ช่วยหาปั๊มน้ำมันที่ใกล้ที่สุดและน้ำมันยังไม่หมดจาก Dashboard หรือข้อมูลล่าสุดให้หน่อยค่ะ`;
          
          try {
            const context = `[Location] Lat: ${latitude}, Lng: ${longitude}, Address: ${address}\n[Home] Shop "In The Haus" is at (17.390083, 104.792944)\n[Source] https://script.google.com/macros/s/AKfycbyC8vSspmwSUc83QJpdaADrkr3b-mtI2d6qt7QAF2eP8IogWFKe1lXpfLCxEoK6tENVsQ/exec`;
            
            const response = await getGeminiResponse(query, context, [], userId);
            
            await saveMessage(groupId, userId, 'user', `[Location Message] ${address || 'Coordinates'}`, 'location');
            await saveMessage(groupId, null, 'model', response, 'text');
            
            await client.replyMessage(event.replyToken, { type: 'text', text: response });
            handledLocally = true;
          } catch (locationError) {
            console.error("Location Processing Error:", locationError);
          }
        }
      } else if (event.type === 'postback') {
        const groupId = event.source.groupId || event.source.userId;
        const userId = event.source.userId;
        const queryParams = new URLSearchParams(event.postback.data);
        const action = queryParams.get('action');

        if (action === 'confirm_roster') {
          try {
            const payload = JSON.parse(Buffer.from(queryParams.get('payload'), 'base64').toString());
            const { supabase } = await import('../../../lib/supabaseClient');
            const isBoss = await checkIsBoss(userId);
            
            // Resolve employee id
            let targetEmpId = null;
            let targetNickname = payload.employee_name;

            if (isBoss && payload.employee_name) {
              const { data: targetEmp } = await supabase.from('employees').select('id, nickname').ilike('nickname', `%${payload.employee_name}%`).limit(1).maybeSingle();
              targetEmpId = targetEmp?.id;
            }

            if (!targetEmpId) {
              const { data: senderEmp } = await supabase.from('employees').select('id, name, nickname').or(`line_bot_id.eq.${userId},line_user_id.eq.${userId}`).maybeSingle();
              targetEmpId = senderEmp?.id;
              targetNickname = senderEmp?.nickname || senderEmp?.name;
            }
            
            if (!targetEmpId) {
              await client.replyMessage(event.replyToken, { type: 'text', text: 'เมี๊ยว~ หาข้อมูลพนักงานไม่เจอค่ะ รบกวนแจ้งบอสให้ผูก ID ก่อนนะ' });
              continue;
            }

            // Create Request (Status: APPROVED if Boss, PENDING if Staff)
            const { data: request, error: reqErr } = await supabase.from('roster_requests').insert({
              type: payload.type,
              requester_id: (await getEmployeeByLineId(userId))?.id || targetEmpId,
              target_date: payload.date,
              reason: payload.reason || payload.details?.note || null,
              new_shift_id: payload.details?.shift_id || null,
              custom_start_time: payload.details?.start_time || null,
              custom_end_time: payload.details?.end_time || null,
              status: isBoss ? 'APPROVED' : 'PENDING',
              manager_id: isBoss ? (await getEmployeeByLineId(userId))?.id : null
            }).select().single();

            if (reqErr) throw reqErr;

            if (isBoss) {
              // Boss Direct Update
              if (payload.type === 'LEAVE') {
                await supabase.from('roster_overrides').upsert({ employee_id: targetEmpId, date: payload.date, is_off: true, reference_request_id: request.id });
              } else {
                await supabase.from('roster_overrides').upsert({ 
                  employee_id: targetEmpId, 
                  date: payload.date, 
                  shift_id: payload.details?.shift_id || null,
                  custom_start_time: payload.details?.start_time || null,
                  custom_end_time: payload.details?.end_time || null,
                  is_off: false,
                  reference_request_id: request.id 
                });
              }
              await client.replyMessage(event.replyToken, { type: 'text', text: `✅ บอสสั่งมา ยูซุจัดให้! อัปเดตตารางของ "${targetNickname}" เรียบร้อยแล้วค่ะ เมี๊ยว~` });
            } else {
              // Notify Group for Approval
              const approvalFlex = {
                type: 'bubble',
                header: { type: 'box', layout: 'vertical', backgroundColor: '#ffc107', contents: [{ type: 'text', text: '🔔 คำขอปรับตารางกะ', color: '#000000', weight: 'bold' }] },
                body: {
                  type: 'box', layout: 'vertical', contents: [
                    { type: 'text', text: `👤 ผู้ขอ: ${targetNickname}`, weight: 'bold' },
                    { type: 'text', text: `📅 วันที่: ${payload.date}`, size: 'sm' },
                    { type: 'text', text: `📝 รายละเอียด: ${payload.reason || payload.details?.note || '-'}`, size: 'sm', wrap: true, margin: 'sm' }
                  ]
                },
                footer: {
                  type: 'box', layout: 'horizontal', spacing: 'sm',
                  contents: [
                    { type: 'button', style: 'primary', color: '#06c755', action: { type: 'postback', label: '✅ อนุมัติ', data: `action=approve_roster&id=${request.id}` } },
                    { type: 'button', style: 'secondary', color: '#ff3b30', action: { type: 'postback', label: '❌ ปฏิเสธ', data: `action=reject_roster&id=${request.id}` } }
                  ]
                }
              };

              await client.replyMessage(event.replyToken, { type: 'text', text: 'รับทราบค่ะ! ยูซุส่งเรื่องให้บอสพิจารณาในกลุ่มเรียบร้อยแล้วนะคะ เมี๊ยว~' });
              await client.pushMessage(groupId, { type: 'flex', altText: '🔔 คำขอปรับตารางใหม่', contents: approvalFlex });
            }
            handledLocally = true;
          } catch (e) {
            console.error("Confirm Roster Error:", e);
            await client.replyMessage(event.replyToken, { type: 'text', text: `เเม๊! เกิดข้อผิดพลาด: ${e.message}` });
          }
        } else if (action === 'approve_roster') {
          const requestId = queryParams.get('id');
          const { supabase } = await import('../../../lib/supabaseClient');
          const isBoss = await checkIsBoss(userId);

          if (!isBoss) {
             await client.replyMessage(event.replyToken, { type: 'text', text: 'เมี๊ยว~ สิทธิ์ไม่พอค่ะ ต้องให้บอส (คุณพ่อ/คุณแม่) กดเท่านั้นนะคะ!' });
             continue;
          }

          const { data: req } = await supabase.from('roster_requests').select('*').eq('id', requestId).single();
          if (req && req.status === 'PENDING') {
            await supabase.from('roster_requests').update({ status: 'APPROVED', manager_id: (await getEmployeeByLineId(userId))?.id }).eq('id', requestId);
            
            if (req.type === 'LEAVE') {
              await supabase.from('roster_overrides').upsert({ employee_id: req.requester_id, date: req.target_date, is_off: true, reference_request_id: req.id });
            } else {
              await supabase.from('roster_overrides').upsert({ 
                employee_id: req.requester_id, 
                date: req.target_date, 
                shift_id: req.new_shift_id,
                custom_start_time: req.custom_start_time,
                custom_end_time: req.custom_end_time,
                is_off: false,
                reference_request_id: req.id 
              });
            }
            await client.replyMessage(event.replyToken, { type: 'text', text: '✅ อนุมัติเรียบร้อย! อัปเดตตารางให้แล้วค่ะ เมี๊ยว~' });
          }
          handledLocally = true;
        } else if (action === 'reject_roster') {
          const requestId = queryParams.get('id');
          const { supabase } = await import('../../../lib/supabaseClient');
          if (await checkIsBoss(userId)) {
             await supabase.from('roster_requests').update({ status: 'REJECTED', manager_id: (await getEmployeeByLineId(userId))?.id }).eq('id', requestId);
             await client.replyMessage(event.replyToken, { type: 'text', text: '❌ ปฏิเสธคำขอเรียบร้อยค่ะ' });
          }
          handledLocally = true;
        } else if (action === 'cancel_roster') {
          await client.replyMessage(event.replyToken, { type: 'text', text: 'โอเคค่ะ ยกเลิกรายการให้นะคะ เมี๊ยว~' });
          handledLocally = true;
        } else if (action === 'confirm_phone_order') {
          const orderId = queryParams.get('id');
          const { supabase } = await import('../../../lib/supabaseClient');
          await supabase.from('phone_orders').update({ status: 'CONFIRMED', confirmed_at: new Date().toISOString() }).eq('id', orderId);
          await client.replyMessage(event.replyToken, { type: 'text', text: '✅ รับออเดอร์เรียบรวยค่ะ! กำลังเตรียมอาหารให้ลูกค้านะคะ เมี๊ยว~ 🐾' });
          handledLocally = true;
        } else if (action === 'done_phone_order') {
          const orderId = queryParams.get('id');
          const { supabase } = await import('../../../lib/supabaseClient');
          await supabase.from('phone_orders').update({ status: 'DONE', done_at: new Date().toISOString() }).eq('id', orderId);
          await client.replyMessage(event.replyToken, { type: 'text', text: '✅ ออเดอร์เสร็จเรียบร้อย! คุ้มค่าแก่การรอยคอยค่ะ เมี๊ยว~ 🏁' });
          handledLocally = true;
        } else if (action === 'confirm_table_reservation') {
          const resId = queryParams.get('id');
          const { supabase } = await import('../../../lib/supabaseClient');
          await supabase.from('table_reservations').update({ status: 'CONFIRMED' }).eq('id', resId);
          await client.replyMessage(event.replyToken, { type: 'text', text: '✅ ยืนยันการจองคืนนี้เรียบร้อยค่ะ! เตรียมจัดโต๊ะรอรับบอสและลูกค้าเลยค่ะ เมี๊ยว~ 🥂' });
          handledLocally = true;
        } else if (action === 'cancel_table_reservation') {
          const resId = queryParams.get('id');
          const { supabase } = await import('../../../lib/supabaseClient');
          await supabase.from('table_reservations').update({ status: 'CANCELLED' }).eq('id', resId);
          await client.replyMessage(event.replyToken, { type: 'text', text: '🌑 ยกเลิกการจองให้แล้วนะคะ เมี๊ยว~' });
          handledLocally = true;
          handledLocally = true;
        } else if (action === 'approve_insight') {
          const insightId = queryParams.get('id');
          const { supabase } = await import('../../../lib/supabaseClient');
          const isBoss = await checkIsBoss(userId);

          if (!isBoss) {
            await client.replyMessage(event.replyToken, { type: 'text', text: 'เมี๊ยว~ เฉพาะบอสเท่านั้นที่อนุมัติความรู้ได้นะคะ! 🐾' });
            continue;
          }

          const { error } = await supabase
            .from('yuzu_knowledge')
            .update({ 
               metadata: { status: 'verified', verified_at: new Date().toISOString() } 
            })
            .eq('id', insightId);

          if (!error) {
            await client.replyMessage(event.replyToken, { type: 'text', text: '✅ บันทึกความรู้เข้าคลังหลักเรียบร้อยค่ะ~ บอสนี่ตาถึงจริงๆ! ✨' });
          } else {
             await client.replyMessage(event.replyToken, { type: 'text', text: 'เเมี๊ยว~ บันทึกไม่สำเร็จค่ะ: ' + error.message });
          }
          handledLocally = true;
        } else if (action === 'reject_insight') {
          const insightId = queryParams.get('id');
          const { supabase } = await import('../../../lib/supabaseClient');
          const isBoss = await checkIsBoss(userId);

          if (!isBoss) {
            await client.replyMessage(event.replyToken, { type: 'text', text: 'เมี๊ยว~ เฉพาะบอสเท่านั้นที่สั่งลบได้นะคะ! 🐾' });
            continue;
          }

          const { error } = await supabase.from('yuzu_knowledge').delete().eq('id', insightId);
          if (!error) {
            await client.replyMessage(event.replyToken, { type: 'text', text: '🗑️ ลืมข้อมูลนี้เรียบร้อยค่ะ! ยูซุก็ว่าแล้วว่ามันแปลกๆ เมี๊ยว~' });
          }
          handledLocally = true;
        } else if (action === 'cancel_stock') {
          await client.replyMessage(event.replyToken, { type: 'text', text: '✅ ยกเลิกการจัดการสต็อกแล้วค่ะ เมี๊ยว~' });
          handledLocally = true;
        } else if (action === 'confirm_stock') {
          const payloadRaw = queryParams.get('payload');
          if (processedPostbacks.has(payloadRaw)) {
            // Already processed this exact payload recently! Ignore to prevent double-click duplicates.
            return NextResponse.json({ success: true, handler: 'local_duplicate' });
          }
          processedPostbacks.add(payloadRaw);
          setTimeout(() => processedPostbacks.delete(payloadRaw), 60000); // Clear after 60s

          try {
            const payload = JSON.parse(Buffer.from(payloadRaw, 'base64').toString());
            const { fetchStockItems, addStockTransaction, updateStockItem, createStockItem } = await import('../../../utils/stock_api');
            const empName = await getEmployeeByLineId(userId).then(e => e?.nickname || e?.name || "LINE User") || "LINE User";
            
            if (payload.action === 'CREATE_ITEM') {
               await createStockItem({
                 name: payload.itemName,
                 category: payload.category || 'ทั่วไป',
                 unit: payload.unit || 'ชิ้น',
                 current_quantity: 0,
                 reorder_point: payload.reorder_point || 0
               });
               await client.replyMessage(event.replyToken, { type: 'text', text: `✅ สร้างรายการสินค้า [${payload.itemName}] สำเร็จแล้วจ้า เมี๊ยว~` });
            } else {
               // Find item uuid more strictly
               const searchItems = await fetchStockItems(payload.itemName);
               const exactMatch = searchItems.find(i => i.name === payload.itemName);
               // If there's an exact match, use it. Otherwise, if there is exactly 1 search result, use it. Otherwise, null.
               const item = exactMatch || (searchItems.length === 1 ? searchItems[0] : null);
               
               if (!item) {
                 const optionsText = searchItems.length > 0 ? ` เล็งตัวไหนไว้คะ: ${searchItems.slice(0,3).map(i => i.name).join(', ')}?` : "";
                 await client.replyMessage(event.replyToken, { type: 'text', text: `❌ ไม่พบรายการสินค้า "${payload.itemName}" ที่ชัดเจนในระบบค่ะ${optionsText} ลองตรวจสอบชื่อให้แม่นๆ อีกทีนะ เมี๊ยว~` });
                 return NextResponse.json({ success: true, handler: 'local' });
               }

               if (payload.action === 'UPDATE_ITEM') {
                 await updateStockItem(item.id, { reorder_point: payload.reorder_point });
                 await client.replyMessage(event.replyToken, { type: 'text', text: `✅ อัปเดตข้อมูลของ [${item.name}] สำเร็จแล้วค๊า!` });
               } else if (payload.action === 'RESTOCK' || payload.action === 'DEDUCT') {
                 const tType = payload.action === 'RESTOCK' ? 'in' : 'out';
                 await addStockTransaction(item.id, tType, payload.quantity, empName, payload.note || `ปรับผ่านแชท Yuzu`);
                 await client.replyMessage(event.replyToken, { type: 'text', text: `✅ บันทึกยอดคลังสินค้า [${item.name}] สำเร็จแล้วจ้า ยูซุหิวเลย! เมี๊ยว~` });
               }
            }
            handledLocally = true;
          } catch (err) {
            console.error("Stock Postback Error:", err);
            await client.replyMessage(event.replyToken, { type: 'text', text: `⚠️ ว้าย! เกิดข้อผิดพลาดจากฝั่ง API สินค้าค่ะ:\n${err.message}` });
            handledLocally = true; // Error handled by telling user
          }
        }
      }
    }

    const isFromOriginalGroup = events.some(e => e.source?.groupId === 'C1210c7a0601b5a675060e312efe10bff');
    if (isFromOriginalGroup && !handledLocally) {
      try {
        await fetch('https://script.google.com/macros/s/AKfycbyJ5WFOFmjwVJWoIUer6dwxHdeSShDvUfSWU0NNfsIH8Ek9WguCAzJG9QSbK5g77MH6/exec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (gasError) {
        console.error("Error forwarding to GAS:", gasError);
      }
    }

    if (handledLocally) return NextResponse.json({ success: true, handler: 'local' });
    return NextResponse.json({ success: true, forwardedToGas: true });

  } catch (error) {
    console.error("Webhook Proxy Error:", error);
    return NextResponse.json({ success: false }, { status: 200 });
  }
}