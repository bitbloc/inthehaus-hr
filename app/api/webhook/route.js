import { NextResponse } from 'next/server';
import { Client } from '@line/bot-sdk';
import { getSchemaWeather, formatWeatherMessage } from '../../../utils/weather';
import { getGeminiResponse, classifyAndAnalyzeImage, getDailySummary, generateImage } from '../../../utils/gemini';
import { getGoldPrice, getOilPrice, getElectricityPrice, getIngredientPrices } from '../../../utils/price';
import { saveMessage, getChatHistory, getDailyContent, cleanupOldHistory } from '../../../utils/memory';

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
            
            // 1. Image Generation
            if (text.startsWith('yuzu วาดรูป') || text.startsWith('yuzu generate image')) {
              const imagePrompt = query.replace('วาดรูป', '').trim();
              const response = await generateImage(imagePrompt);
              await client.replyMessage(event.replyToken, { type: 'text', text: response });
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

            // 3. Standard Yuzu Chat with Memory
            const history = await getChatHistory(groupId);
            
            let context = "";
            if (text.includes('ทอง')) context += await getGoldPrice() + "\n";
            if (text.includes('น้ำมัน')) context += await getOilPrice() + "\n";
            if (text.includes('ไฟ')) context += await getElectricityPrice() + "\n";
            const ingredientKeywords = ['วัตถุดิบ', 'ราคาอาหาร', 'หมู', 'ไก่', 'เนื้อ', 'ปลา', 'ไข่', 'ผัก', 'ผลไม้', 'ข้าว'];
            if (ingredientKeywords.some(kw => text.includes(kw))) context += await getIngredientPrices() + "\n";
            if (text.includes('อากาศ')) context += formatWeatherMessage(await getSchemaWeather()) + "\n";

            const response = await getGeminiResponse(query, context, history);

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

            // Only reply if it's food/ingredients OR a cat
            if (result.isFood || result.isCat) {
              await client.replyMessage(event.replyToken, { type: 'text', text: result.analysis });
              handledLocally = true;
            } else {
              console.log("Yuzu: Non-critical image, staying silent but saved description.");
            }
          } catch (visionError) {
            console.error("Vision Processing Error:", visionError);
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