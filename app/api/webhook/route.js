import { NextResponse } from 'next/server';
import { Client } from '@line/bot-sdk';
import { getSchemaWeather, formatWeatherMessage } from '../../../utils/weather';
import { getGeminiResponse, classifyAndAnalyzeImage, transcribeAudio } from '../../../utils/gemini';
import { getIngredientPrices } from '../../../utils/price';
import { saveMessage, cleanupOldHistory, getEmployeeByLineId, getYuzuConfigs, checkIsBoss } from '../../../utils/memory';
import { handleRosterCommand, handleRosterPostback } from './handlers/rosterHandler';
import { handleStockPostback } from './handlers/stockHandler';
import { handleSlipImage } from './handlers/slipHandler';
import { handleOrderAndReservationDetection, handleOrderAndReservationPostback } from './handlers/orderHandler';
import { handleChatCommand, handleChatPostback } from './handlers/chatHandler';

export const maxDuration = 60;

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

    // Run cleanup occasionally
    cleanupOldHistory().catch(e => console.error("Cleanup Error:", e));

    for (const event of events) {
      if (event.type === 'message') {
        const groupId = event.source.groupId || event.source.userId;
        const userId = event.source.userId;

        // --- Handle Text Messages ---
        if (event.message.type === 'text') {
          const rawText = event.message.text.trim();
          const text = rawText.toLowerCase();
          
          // 1. Weather check (local helper)
          if (text === 'อากาศ' || text === 'weather') {
            const weatherData = await getSchemaWeather();
            const replyText = formatWeatherMessage(weatherData);
            await client.replyMessage(event.replyToken, { type: 'text', text: replyText });
            handledLocally = true;
          } 
          
          // 2. HR Wrap Attendance Summary (local helper)
          else if (text === 'hr_wrap' || text === 'hrwrap' || text === 'summary') {
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
          } 
          
          // 3. Delegate Roster Commands
          else if (await handleRosterCommand(event, client, text, rawText, userId)) {
            handledLocally = true;
          } 
          
          // 4. Delegate Yuzu AI Chat Commands
          else if (await handleChatCommand(event, client, text, rawText, userId, groupId, request)) {
            handledLocally = true;
          } 
          
          // 5. Delegate Order and Table Reservation detection
          else {
            const isOrderOrReserve = await handleOrderAndReservationDetection(event, client, rawText, userId, groupId);
            if (isOrderOrReserve) {
              handledLocally = true;
            } else {
              // Save non-yuzu regular chats to daily logs
              await saveMessage(groupId, userId, 'user', rawText, 'text');
            }
          }
        } 
        
        // --- Handle Audio Messages ---
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

        // --- Handle Image Messages ---
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

            // Refined Vision Logic
            const result = await classifyAndAnalyzeImage(base64, "image/jpeg", context, bossRole, positionInstruction);

            await saveMessage(groupId, userId, 'user', result.shortDescription, 'image_description');

            if (result.isSlip) {
              handledLocally = await handleSlipImage(event, client, buffer, userId, groupId, result);
            } else if (result.shouldReply) {
              await client.replyMessage(event.replyToken, { type: 'text', text: result.analysis });
              handledLocally = true;
            }
          } catch (visionError) {
            console.error("Vision Processing Error:", visionError);
          }
        }

        // --- Handle Location Messages ---
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
      
      // --- Handle Postback Events ---
      else if (event.type === 'postback') {
        const groupId = event.source.groupId || event.source.userId;
        const userId = event.source.userId;
        const queryParams = new URLSearchParams(event.postback.data);
        const action = queryParams.get('action');

        // 1. Roster postbacks
        if (await handleRosterPostback(event, client, action, queryParams, userId, groupId)) {
          handledLocally = true;
        } 
        // 2. Stock postbacks
        else {
          const stockResult = await handleStockPostback(event, client, action, queryParams, userId);
          if (stockResult.handled) {
            handledLocally = true;
            if (stockResult.duplicate) {
              return NextResponse.json({ success: true, handler: 'local_duplicate' });
            }
          } 
          // 3. Order postbacks
          else if (await handleOrderAndReservationPostback(event, client, action, queryParams)) {
            handledLocally = true;
          } 
          // 4. Chat postbacks
          else if (await handleChatPostback(event, client, action, queryParams, userId)) {
            handledLocally = true;
          }
        }
      }
    }

    // Forward to GAS if it's from the original Nakhon Phanom chat group and wasn't local-only
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