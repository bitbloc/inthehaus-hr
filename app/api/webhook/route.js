import { NextResponse } from 'next/server';
import { Client } from '@line/bot-sdk';
import { getSchemaWeather, formatWeatherMessage, formatWeatherFlex } from '../../../utils/weather';
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

export async function GET() {
  return NextResponse.json({ status: "active", message: "pong" });
}

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
          
          // 0. Diagnostic Ping-Pong
          if (text === 'ping') {
            await client.replyMessage(event.replyToken, { type: 'text', text: 'pong 🏓' });
            handledLocally = true;
          } 
          
          // 1. Weather check (local helper)
          else if (text === 'อากาศ' || text === 'weather') {
            const weatherData = await getSchemaWeather();
            if (!weatherData) {
              await client.replyMessage(event.replyToken, { type: 'text', text: 'ไม่สามารถดึงข้อมูลสภาพอากาศได้ในขณะนี้' });
            } else {
              const flexMsg = formatWeatherFlex(weatherData);
              await client.replyMessage(event.replyToken, flexMsg);
            }
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
              .select('*, employees(id, name, position)')
              .gte('timestamp', START_OF_DAY_UTC.toISOString())
              .order('timestamp', { ascending: true });

            if (error) {
              await client.replyMessage(event.replyToken, { type: 'text', text: 'Error fetching data: ' + error.message });
              handledLocally = true;
              continue;
            }

            // Fetch today's roster transactions for shift time comparison
            const todayDateStr = format(addHours(new Date(), 7), 'yyyy-MM-dd');
            const todayDayOfWeek = addHours(new Date(), 7).getDay();
            const { data: rosterTxs } = await supabase
              .from('roster_transactions')
              .select('*, shifts(name, start_time, end_time)')
              .eq('date', todayDateStr);
            const { data: weeklyScheds } = await supabase
              .from('employee_schedules')
              .select('*, shifts(name, start_time, end_time)')
              .eq('day_of_week', todayDayOfWeek);

            const getScheduledStart = (empId) => {
              // 1. Check roster transaction first
              const tx = rosterTxs?.find(t => t.employee_id === empId && !t.is_off);
              if (tx) {
                return tx.custom_start_time?.slice(0,5) || tx.shifts?.start_time?.slice(0,5) || null;
              }
              // 2. Fallback to weekly schedule
              const sch = weeklyScheds?.find(s => s.employee_id === empId && !s.is_off);
              if (sch) return sch.shifts?.start_time?.slice(0,5) || null;
              return null;
            };

            const summary = {};
            logs.forEach(log => {
              const name = log.employees?.name || 'Unknown';
              const empId = log.employees?.id || log.employee_id;
              const position = log.employees?.position || '-';
              if (!summary[name]) summary[name] = { name, empId, position, in: null, out: null };
              if (log.action_type === 'check_in') summary[name].in = new Date(log.timestamp);
              if (log.action_type === 'check_out') summary[name].out = new Date(log.timestamp);
            });

            const summaryList = Object.values(summary).sort((a, b) => (a.in?.getTime() || 0) - (b.in?.getTime() || 0));
            const safeThaiTime = (date) => format(addHours(date, 7), 'HH:mm');
            const todayStr = format(addHours(new Date(), 7), 'dd/MM/yyyy');
            
            const contents = [
              { type: 'text', text: `📊 สรุปการเข้างาน`, weight: 'bold', size: 'lg', color: '#1DB446' },
              { type: 'text', text: todayStr, size: 'xs', color: '#555555', margin: 'sm' },
              { type: 'separator', margin: 'md' }
            ];

            let count = 0;
            for (const s of summaryList) {
              count++;
              const inTime = s.in ? safeThaiTime(s.in) : '-';
              const outTime = s.out ? safeThaiTime(s.out) : '-';
              let durationStr = '-';
              if (s.in) {
                const diff = differenceInMinutes(s.out || new Date(), s.in);
                durationStr = `${Math.floor(diff / 60)}h ${diff % 60}m`;
                if (!s.out) durationStr = 'กำลังทำงาน ⏳';
              }

              // Calculate late/on-time status
              let statusText = '';
              let statusColor = '#999999';
              const scheduledStart = getScheduledStart(s.empId);
              if (s.in && scheduledStart) {
                const inTimeStr = safeThaiTime(s.in);
                const [schH, schM] = scheduledStart.split(':').map(Number);
                const [inH, inM] = inTimeStr.split(':').map(Number);
                const schMinutes = schH * 60 + schM;
                const inMinutes = inH * 60 + inM;
                const diffMin = inMinutes - schMinutes;
                if (diffMin > 15) {
                  statusText = `สาย +${diffMin} นาที`;
                  statusColor = '#ff4b00';
                } else if (diffMin < -5) {
                  statusText = `มาเร็ว ${Math.abs(diffMin)} นาที`;
                  statusColor = '#007bff';
                } else {
                  statusText = `✓ ตรงเวลา`;
                  statusColor = '#1DB446';
                }
              }

              const rowContents = [
                {
                  type: 'box', layout: 'horizontal',
                  contents: [
                    { type: 'text', text: `👤 ${s.name}`, weight: 'bold', size: 'sm', color: '#333333', flex: 3 },
                    { type: 'text', text: s.position, size: 'xs', color: '#555555', align: 'end', flex: 2 }
                  ]
                },
                {
                  type: 'box', layout: 'horizontal',
                  contents: [
                    { type: 'text', text: `เข้า: ${inTime}`, size: 'xs', color: '#1DB446', flex: 1 },
                    { type: 'text', text: `ออก: ${outTime}`, size: 'xs', color: '#ff4b00', flex: 1 },
                    { type: 'text', text: durationStr, size: 'xs', color: (durationStr.includes('กำลัง') ? '#007bff' : '#333333'), align: 'end', flex: 1, weight: 'bold' }
                  ]
                }
              ];

              if (statusText) {
                rowContents.push({
                  type: 'box', layout: 'horizontal', margin: 'xs',
                  contents: [
                    { type: 'text', text: statusText, size: 'xs', weight: 'bold', color: statusColor, flex: 2 },
                    ...(scheduledStart ? [{ type: 'text', text: `(กะ ${scheduledStart})`, size: 'xxs', color: '#888888', align: 'end', flex: 1 }] : [])
                  ]
                });
              }

              contents.push({
                type: 'box', layout: 'vertical', margin: 'md', spacing: 'sm',
                contents: rowContents
              });
              contents.push({ type: 'separator', margin: 'sm' });
            }

            if (count === 0) {
              contents.push({ type: 'text', text: 'ยังไม่มีการลงเวลาวันนี้', margin: 'md', size: 'sm', color: '#aaaaaa', align: 'center' });
            }

            await client.replyMessage(event.replyToken, {
              type: 'flex',
              altText: `สรุปการเข้างาน ${todayStr}`,
              contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', contents: contents } }
            });
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
      
      // --- Handle Follow (Add Friend) Events ---
      else if (event.type === 'follow') {
        const welcomeText = "สวัสดีค่ะ! ยูซุยินดีต้อนรับนะคะ 🍊🐱 ยูซุเป็นผู้ช่วย AI ประจำร้าน In The Haus ค่ะ สามารถถามเรื่องตารางงาน สรุปยอดขาย เช็คสภาพอากาศ วาดรูป หรือพิมพ์คุยเล่นกับยูซุได้เลยนะคะ พิมพ์ 'yuzu คุยด้วยหน่อย' เพื่อเริ่มต้นได้เลยค่ะ เมี๊ยว~";
        await client.replyMessage(event.replyToken, { type: 'text', text: welcomeText });
        handledLocally = true;
      }
      
      // --- Handle Join Group Events ---
      else if (event.type === 'join') {
        const welcomeGroupText = "สวัสดีค่าทุกคนในกลุ่ม! 🍊🐱 ยูซุเป็นผู้ช่วย AI ประจำร้าน In The Haus เข้าร่วมกลุ่มแล้วค่ะ! ทุกคนสามารถเรียกใช้ยูซุได้โดยการพิมพ์ขึ้นต้นว่า 'yuzu' หรือ 'ยูซุ' นะคะ (เช่น 'yuzu พรุ่งนี้ฝนตกไหม' หรือ 'yuzu ช่วยสลับกะให้หน่อย') ฝากเนื้อฝากตัวด้วยนะคะ เมี๊ยว~";
        await client.replyMessage(event.replyToken, { type: 'text', text: welcomeGroupText });
        handledLocally = true;
      }
      
      // --- Handle Member Joined Group Events ---
      else if (event.type === 'memberJoined') {
        const welcomeMemberText = "ยินดีต้อนรับสมาชิกใหม่เข้าสู่กลุ่มค่ะ! 🍊🐱 หนูชื่อยูซุ เป็น AI ผู้ช่วยประจำร้านนะคะ ถ้ามีอะไรให้หนูช่วยเรื่องตารางงานหรือข้อมูลร้าน เรียกใช้หนูได้ตลอดเลยค่ะ เมี๊ยว~";
        await client.replyMessage(event.replyToken, { type: 'text', text: welcomeMemberText });
        handledLocally = true;
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