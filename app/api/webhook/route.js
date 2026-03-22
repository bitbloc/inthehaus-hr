import { NextResponse } from 'next/server';
import { Client } from '@line/bot-sdk';
import { getSchemaWeather, formatWeatherMessage } from '../../../utils/weather';
import { getGeminiResponse, classifyAndAnalyzeImage, getDailySummary, generateImage } from '../../../utils/gemini';
import { getGoldPrice, getOilPrice, getElectricityPrice, getIngredientPrices } from '../../../utils/price';
import { saveMessage, getChatHistory, getDailyContent, cleanupOldHistory, getEmployeeHistory, getEmployeeByLineId, getAllEmployeesData } from '../../../utils/memory';
import { getAccurateNews } from '../../../utils/news';

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
          } else if (text.startsWith('yuzu')) {
            const query = rawText.slice(4).trim();
            if (!query) {
              await client.replyMessage(event.replyToken, { type: 'text', text: 'ยูซุยินดีให้บริการครับ พิมพ์ "yuzu" ตามด้วยสิ่งที่คุณอยากรู้ได้เลยครับ' });
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
                const prompt = `ภาพกราฟิกข้อความ ไม่มีรูปแมวเด็ดขาด ให้ออกแบบสวยงามพรีเมียมตัวอักษร 3D "สรุปยอดโอน ${dateTitle} ยอด ${total.toLocaleString('th-TH', {minimumFractionDigits: 2})} บาท" แสดงผลตารางเวลาโอนเงินย่อยๆ ร่วมด้วย สีสันสดใส ชัดเจน`;
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
            
            // Real-time Employee Sync (HR Accuracy)
            const employee = await getEmployeeByLineId(userId);
            if (employee) {
              context += `คุณกำลังคุยกับ: ${employee.nickname || employee.name} (${employee.position})\n`;
              context += `สถานะพนักงาน: ${employee.employment_status || 'Fulltime'}\n`;
            } else {
              context += `(ไม่พบข้อมูลพนักงานในระบบสำหรับ LINE ID นี้: ${userId})\n`;
            }

            // Provide all UIDs mapping so Yuzu knows who is who if asked
            const allEmployees = await getAllEmployeesData();
            if (allEmployees && allEmployees.length > 0) {
              context += `\nรายชื่อพนักงานทั้งหมดในระบบตอนนี้ (ทำ mapping UID -> ชื่อ ให้ตรวจสอบ):\n`;
              allEmployees.forEach(emp => {
                const empName = emp.nickname || emp.name;
                const uid1 = emp.line_user_id || 'ไม่มี';
                const uid2 = emp.line_bot_id || 'ไม่มี';
                context += `- Bot UID: ${uid2} | LIFF UID: ${uid1} | ชื่อ: ${empName} | ตำแหน่ง: ${emp.position}\n`;
              });
              context += `(จบรายชื่อพนักงาน)\n`;
            }

            const dailyLogs = await getDailyContent(groupId);
            if (dailyLogs) context += `\nเหตุการณ์ที่เกิดขึ้นในแชทกลุ่มวันนี้ (ใช้สำหรับอ้างอิงหรือแซวทีมงาน):\n${dailyLogs}\n`;
            if (text.includes('ทอง')) context += await getGoldPrice() + "\n";
            if (text.includes('น้ำมัน')) context += await getOilPrice() + "\n";
            if (text.includes('ไฟ')) context += await getElectricityPrice() + "\n";
            const ingredientKeywords = ['วัตถุดิบ', 'ราคาอาหาร', 'หมู', 'ไก่', 'เนื้อ', 'ปลา', 'ไข่', 'ผัก', 'ผลไม้', 'ข้าว'];
            if (ingredientKeywords.some(kw => text.includes(kw))) context += await getIngredientPrices() + "\n";
            if (text.includes('อากาศ')) context += formatWeatherMessage(await getSchemaWeather()) + "\n";
            
            // NEW: Injected Latest News Context for accurate real-time reporting
            const newsKeywords = ['ข่าว', 'อัปเดต', 'สรุป', 'ส่อง', 'ติดตาม', 'สถานการณ์'];
            if (newsKeywords.some(kw => text.includes(kw))) {
              console.log("Yuzu: Injecting Latest News Context");
              context += await getAccurateNews() + "\n";
            }

            const response = await getGeminiResponse(query, context, history, userId);

            // Save Memory
            // If it's a praise/compliment command, tag it as mood_booster
            const isMoodBooster = ['ชม', 'ขอบคุณ', 'ขอบใจ', 'ดีมาก', 'เก่ง'].some(kw => query.includes(kw));
            const messageType = isMoodBooster ? 'mood_booster' : 'text';
            
            await saveMessage(groupId, userId, 'user', query, messageType);
            await saveMessage(groupId, null, 'model', response, 'text');

            await client.replyMessage(event.replyToken, { type: 'text', text: response });
            handledLocally = true;
          } else {
            // Save all messages for the daily summary (even non-yuzu ones)
            await saveMessage(groupId, userId, 'user', rawText, 'text');
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

            const context = await getIngredientPrices();

            // Refined Vision Logic
            const result = await classifyAndAnalyzeImage(base64, "image/jpeg", context);

            // Always save image description for summary (Retention 2 days handled in cleanup)
            await saveMessage(groupId, userId, 'user', result.shortDescription, 'image_description');

            // Handle Slips
            if (result.isSlip) {
              const { supabase } = await import('../../../lib/supabaseClient');
              
              // Resolve the user_id for the database (mapping line_bot_id to line_user_id)
              let mappedDbUserId = userId;
              const allEmployees = await getAllEmployeesData();
              if (allEmployees) {
                const emp = allEmployees.find(e => e.line_bot_id === userId || e.line_user_id === userId);
                if (emp && emp.line_user_id) {
                   mappedDbUserId = emp.line_user_id;
                }
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

              const { error: insertError } = await supabase.from('slip_transactions').insert({
                group_id: groupId,
                user_id: mappedDbUserId,
                amount: parsedAmount,
                slip_url: slipUrl,
                transaction_ref: result.transactionRef || undefined,
                sender_name: result.senderName || undefined
              });

              if (insertError) {
                 console.error("Slip Insert Error:", insertError);
                 if (insertError.code === '23505') {
                     await client.replyMessage(event.replyToken, { type: 'text', text: `เมี๊ยว~ สลิปใบนี้ (อ้างอิง: ${result.transactionRef || 'ไม่ทราบ'}) ถูกบันทึกเข้าระบบไปแล้วนะคะ ห้ามส่งซ้ำและห้ามโกงค่ะ! 😾` });
                 } else {
                     await client.replyMessage(event.replyToken, { type: 'text', text: `เมี๊ยว~ บันทึกสลิปไม่สำเร็จค่ะ (Error: ${insertError.message || insertError.code || 'Unknown DB Error'})` });
                 }
              } else {
                 let senderName = "บุคคลภายนอก (ไม่มีในระบบ)";
                 if (allEmployees) {
                    const empNameData = allEmployees.find(e => e.line_bot_id === userId || e.line_user_id === userId);
                    if (empNameData && empNameData.name) {
                        senderName = empNameData.nickname || empNameData.name;
                    }
                 }
                 await client.replyMessage(event.replyToken, { type: 'text', text: `บันทึกยอดโอน ${parsedAmount.toLocaleString('th-TH', {minimumFractionDigits: 2})} บาท เรียบร้อยค่ะ เมี๊ยว~ 💸\nผู้ส่งสลิป: ${senderName}` });
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
      }
    }

    // Always attempt to forward to Google Apps Script
    // Forward to Google Apps Script ONLY IF it comes from the original group
    const isFromOriginalGroup = events.some(e => e.source?.groupId === 'C1210c7a0601b5a675060e312efe10bff');

    if (isFromOriginalGroup) {
      try {
        const gasResponse = await fetch('https://script.google.com/macros/s/AKfycbyJ5WFOFmjwVJWoIUer6dwxHdeSShDvUfSWU0NNfsIH8Ek9WguCAzJG9QSbK5g77MH6/exec', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        console.log(`Forwarded to GAS, status: ${gasResponse.status}`);
      } catch (gasError) {
        console.error("Error forwarding to Google Apps Script:", gasError);
      }
    } else {
      console.log("Skipped GAS forwarding for non-primary group");
    }

    if (handledLocally) {
      return NextResponse.json({ success: true, handler: 'local' });
    }

    // Return success to avoid LINE retries
    return NextResponse.json({ success: true, forwardedToGas: true });

  } catch (error) {
    console.error("Webhook Proxy Error:", error);
    // Always return 200 to LINE to prevent retries
    return NextResponse.json({ success: false }, { status: 200 });
  }
}