import { NextResponse, after } from 'next/server';
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
import { isEspressoShotReport, handleEspressoShotAnalysis } from './handlers/espressoHandler';

export const maxDuration = 60;

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

// Cache to prevent duplicate vision replies within the same container instance
const lastVisionReplyTime = new Map();

// De-duplication caches
const inProgressEvents = new Set();
const recentlyProcessedEvents = new Map();

function cleanUpOldProcessedEvents() {
  const now = Date.now();
  if (recentlyProcessedEvents.size > 200) {
    for (const [key, val] of recentlyProcessedEvents.entries()) {
      if ((now - val) > 30000) {
        recentlyProcessedEvents.delete(key);
      }
    }
  }
}

function appendBrandingToFlex(msg) {
  if (!msg) return msg;

  if (Array.isArray(msg)) {
    return msg.map(m => appendBrandingToFlex(m));
  }

  if (msg.type !== 'flex' || !msg.contents) {
    return msg;
  }

  const newMsg = JSON.parse(JSON.stringify(msg));
  
  const addFooterToBubble = (bubble) => {
    if (!bubble || bubble.type !== 'bubble') return;

    if (bubble.footer) {
      if (bubble.footer.contents && Array.isArray(bubble.footer.contents)) {
        const hasBranding = bubble.footer.contents.some(
          c => c.type === 'text' && c.text && c.text.includes('ONHAUS SYSTEM')
        );
        if (!hasBranding) {
          const hasButtons = bubble.footer.contents.some(c => c.type === 'button');
          if (hasButtons) {
            const originalLayout = bubble.footer.layout || 'horizontal';
            const originalSpacing = bubble.footer.spacing || 'sm';
            const originalPadding = bubble.footer.paddingAll;
            
            const buttonsBox = {
              type: 'box',
              layout: originalLayout,
              spacing: originalSpacing,
              contents: [...bubble.footer.contents]
            };

            bubble.footer.layout = 'vertical';
            if (bubble.footer.spacing) delete bubble.footer.spacing;
            if (!bubble.footer.paddingAll) bubble.footer.paddingAll = '15px';
            
            bubble.footer.contents = [
              buttonsBox,
              {
                type: 'text',
                text: 'ONHAUS SYSTEM ©',
                size: 'xxs',
                color: '#aaaaaa',
                align: 'center',
                weight: 'bold',
                margin: 'md'
              }
            ];
          } else {
            const textElement = bubble.footer.contents.find(c => c.type === 'text');
            if (textElement) {
              if (textElement.text && !textElement.text.includes('ONHAUS SYSTEM')) {
                textElement.text = `${textElement.text.toUpperCase()} // ONHAUS SYSTEM ©`;
              }
            } else {
              bubble.footer.contents.push({
                type: 'text',
                text: 'ONHAUS SYSTEM ©',
                size: 'xxs',
                color: '#aaaaaa',
                align: 'center',
                weight: 'bold'
              });
            }
          }
        }
      } else {
        bubble.footer = {
          type: 'box',
          layout: 'vertical',
          paddingAll: '15px',
          contents: [
            {
              type: 'text',
              text: 'ONHAUS SYSTEM ©',
              size: 'xxs',
              color: '#aaaaaa',
              align: 'center',
              weight: 'bold'
            }
          ]
        };
      }
    } else {
      bubble.footer = {
        type: 'box',
        layout: 'vertical',
        paddingAll: '15px',
        contents: [
          {
            type: 'text',
            text: 'ONHAUS SYSTEM ©',
            size: 'xxs',
            color: '#aaaaaa',
            align: 'center',
            weight: 'bold'
          }
        ]
      };
    }

    if (!bubble.styles) bubble.styles = {};
    if (!bubble.styles.footer) {
      const bodyBg = bubble.styles.body?.backgroundColor;
      if (bodyBg === '#181818') {
        bubble.styles.footer = { backgroundColor: '#181818' };
        const copyrightText = bubble.footer.contents.find(c => c.type === 'text' && c.text && c.text.includes('ONHAUS SYSTEM'));
        if (copyrightText) {
          copyrightText.color = '#666666';
        }
      } else {
        bubble.styles.footer = { backgroundColor: '#ebebeb' };
      }
    }
  };

  if (newMsg.contents.type === 'bubble') {
    addFooterToBubble(newMsg.contents);
  } else if (newMsg.contents.type === 'carousel' && Array.isArray(newMsg.contents.contents)) {
    newMsg.contents.contents.forEach(b => addFooterToBubble(b));
  }

  return newMsg;
}

const originalReplyMessage = client.replyMessage.bind(client);
const originalPushMessage = client.pushMessage.bind(client);

client.replyMessage = (replyToken, messages, notificationDisabled) => {
  const brandedMessages = appendBrandingToFlex(messages);
  return originalReplyMessage(replyToken, brandedMessages, notificationDisabled);
};

client.pushMessage = (to, messages, notificationDisabled) => {
  const brandedMessages = appendBrandingToFlex(messages);
  return originalPushMessage(to, brandedMessages, notificationDisabled);
};

export async function GET() {
  return NextResponse.json({ status: "active", message: "pong" });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const events = body.events || [];

    if (events.length === 0 || (events.length > 0 && events[0].replyToken === '00000000000000000000000000000000')) {
      return NextResponse.json({ success: true, message: 'Webhook verified' }, { status: 200 });
    }

    after(async () => {
      let handledLocally = false;

      // Run cleanup occasionally
      cleanupOldHistory().catch(e => console.error("Cleanup Error:", e));

      for (const event of events) {
        const eventId = event.webhookEventId || event.message?.id || event.replyToken;
        if (eventId) {
          const now = Date.now();
          if (inProgressEvents.has(eventId)) {
            console.log("Duplicate event ignored (in-progress in memory):", eventId);
            continue;
          }
          const lastProcessed = recentlyProcessedEvents.get(eventId);
          if (lastProcessed && (now - lastProcessed) < 15000) {
            console.log("Duplicate event ignored (recently processed in memory):", eventId);
            continue;
          }
          inProgressEvents.add(eventId);
        }

        try {
          if (event.type === 'message' && event.message?.id) {
            const messageId = event.message.id;
            const { supabase } = await import('../../../lib/supabaseClient');
            const { data: existingLock } = await supabase
              .from('yuzu_chat_history')
              .select('id')
              .eq('content', messageId)
              .eq('message_type', 'lock')
              .limit(1);

            if (existingLock && existingLock.length > 0) {
              console.log("Duplicate event ignored (found lock in DB):", messageId);
              continue;
            }

            const groupId = event.source.groupId || event.source.userId;
            const userId = event.source.userId;
            await supabase.from('yuzu_chat_history').insert({
              group_id: groupId,
              user_id: userId,
              role: 'user',
              content: messageId,
              message_type: 'lock'
            });
          }

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
            
            // 2.5 Espresso Shot Auto-Detection
            else if (isEspressoShotReport(rawText)) {
              if (await handleEspressoShotAnalysis(event, client, rawText, userId, groupId)) {
                handledLocally = true;
              }
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
                  replyMsg += `\n\n📌 ยูซุบันทึกเป็นรายการงาน (Task) ให้เรียบร้อยแล้ว ${result.tasks.length} รายการครับ`;
                }
                
                handledLocally = true;
                await client.replyMessage(event.replyToken, { type: 'text', text: replyMsg });
                await saveMessage(groupId, null, 'model', replyMsg, 'text');
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

              const empData = await getEmployeeByLineId(userId);
              let friendlyName = empData ? (empData.nickname || empData.name) : null;

              // Resolve specific boss role
              let bossRole = null;
              if (userId === configs.father_uid) {
                bossRole = "พี่ฤ (บอส)";
                friendlyName = "พี่ฤ";
              } else if (userId === configs.mother_uid) {
                bossRole = "พี่แหม่ม (บอส)";
                friendlyName = "พี่แหม่ม";
              } else if (isBoss) {
                bossRole = "บอส";
                friendlyName = friendlyName || "บอส";
              }

              if (!friendlyName) {
                friendlyName = "พนักงาน";
              }

              let positionInstruction = "";
              if (!isBoss) {
                const position = empData?.position || "ทีมงาน";
                
                if (position.includes("Bar") || position.includes("Floor")) {
                  positionInstruction = configs['role_instruction_Bar&Floor'];
                } else if (position.includes("Kitchen") || position.includes("ครัว") || position.includes("Cooking")) {
                  positionInstruction = configs['role_instruction_Kitchen'];
                } else if (position.includes("Admin") || position.includes("จัดการ") || position.includes("Owner")) {
                  positionInstruction = configs['role_instruction_Admin'];
                }
              }

              const context = await getIngredientPrices();

              // Wait 1.5 seconds for all images in the same batch to insert their lock rows
              const nowTime = Date.now();
              await new Promise(resolve => setTimeout(resolve, 1500));

              const { supabase } = await import('../../../lib/supabaseClient');
              const sixSecondsAgo = new Date(nowTime - 6000).toISOString();
              const { data: recentLocks } = await supabase
                .from('yuzu_chat_history')
                .select('content, created_at')
                .eq('group_id', groupId)
                .eq('user_id', userId)
                .eq('message_type', 'lock')
                .gte('created_at', sixSecondsAgo);

              const sortedLocks = (recentLocks || []).sort((a, b) => {
                const timeA = new Date(a.created_at).getTime();
                const timeB = new Date(b.created_at).getTime();
                if (timeA !== timeB) return timeA - timeB;
                return a.content.localeCompare(b.content);
              });

              const currentMsgId = event.message.id;
              const isChosenOne = sortedLocks.length === 0 || sortedLocks[0].content === currentMsgId;

              // Local helper to handle non-slip (operational/reports/etc.) images
              const handleNonSlipImage = async (resVal, imgBuffer) => {
                const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
                const { data: recentReports } = await supabase
                  .from('yuzu_chat_history')
                  .select('id')
                  .eq('user_id', userId)
                  .eq('message_type', 'espresso_report')
                  .gte('created_at', oneMinuteAgo)
                  .limit(1);

                if (recentReports && recentReports.length > 0) {
                  console.log("Yuzu Image Redundancy Filter: Uploading espresso shot photo silently.");
                  const fileName = `shot_${Date.now()}_${userId}_${event.message.id}.jpg`;
                  const { error: uploadError } = await supabase.storage
                    .from('yuzu-slips')
                    .upload(fileName, imgBuffer, { contentType: 'image/jpeg' });

                  let imageUrl = null;
                  if (!uploadError) {
                    const { data: linkData } = supabase.storage.from('yuzu-slips').getPublicUrl(fileName);
                    imageUrl = linkData?.publicUrl;
                  }

                  await saveMessage(groupId, userId, 'user', `[ภาพประกอบช็อตกาแฟ] ${imageUrl || ''}`, 'image_description');
                  handledLocally = true;
                  return;
                }

                const now = Date.now();
                const lastReplyTime = lastVisionReplyTime.get(groupId) || 0;
                let hasRecentReply = (now - lastReplyTime) < 8000;

                if (!hasRecentReply) {
                  const eightSecondsAgo = new Date(now - 8000).toISOString();
                  const { data: recentReplies } = await supabase
                    .from('yuzu_chat_history')
                    .select('id')
                    .eq('group_id', groupId)
                    .eq('role', 'model')
                    .gte('created_at', eightSecondsAgo)
                    .limit(1);
                  if (recentReplies && recentReplies.length > 0) {
                    hasRecentReply = true;
                  }
                }

                if (hasRecentReply) {
                  console.log("Yuzu Vision Redundancy Filter: Anti-spam triggered. Logging photo silently.");
                  await saveMessage(groupId, userId, 'user', `[ภาพประกอบ] ${resVal.shortDescription || 'รูปภาพ'}`, 'image_description');
                  handledLocally = true;
                  return;
                }

                await saveMessage(groupId, userId, 'user', resVal.shortDescription, 'image_description');

                if (resVal.shouldReply) {
                  handledLocally = true;
                  lastVisionReplyTime.set(groupId, now);
                  await client.replyMessage(event.replyToken, { type: 'text', text: resVal.analysis });
                  await saveMessage(groupId, null, 'model', resVal.analysis, 'text');
                }
              };

              if (isChosenOne) {
                // The chosen one: Analyze the first image to see if it is a slip
                console.log(`Yuzu Vision Batching: Chosen one (${currentMsgId}) analyzing first image...`);
                const result = await classifyAndAnalyzeImage(base64, "image/jpeg", context, bossRole, positionInstruction, friendlyName);

                if (result.isSlip) {
                  // Write approval flag to DB
                  await supabase.from('yuzu_chat_history').insert({
                    group_id: groupId,
                    user_id: userId,
                    role: 'system',
                    content: currentMsgId,
                    message_type: 'slip_batch_approved'
                  });

                  // Process slip
                  handledLocally = true;
                  await handleSlipImage(event, client, buffer, userId, groupId, result);
                } else {
                  // Write report batch taken flag to DB
                  await supabase.from('yuzu_chat_history').insert({
                    group_id: groupId,
                    user_id: userId,
                    role: 'system',
                    content: currentMsgId,
                    message_type: 'report_batch_taken'
                  });

                  // Gather other images
                  const batchMsgIds = sortedLocks.map(l => l.content);
                  console.log(`Yuzu Vision Batching: Processing batch as report:`, batchMsgIds);

                  const base64Images = [];
                  for (const msgId of batchMsgIds) {
                    if (msgId === currentMsgId) {
                      base64Images.push(base64);
                    } else {
                      try {
                        const imgStream = await client.getMessageContent(msgId);
                        const imgChunks = [];
                        for await (const chunk of imgStream) imgChunks.push(chunk);
                        const imgBuffer = Buffer.concat(imgChunks);
                        base64Images.push(imgBuffer.toString('base64'));
                      } catch (downloadErr) {
                        console.error(`Failed to download image ${msgId} in batch:`, downloadErr);
                      }
                    }
                  }

                  let finalResult = result;
                  if (base64Images.length > 1) {
                    finalResult = await classifyAndAnalyzeImage(base64Images, "image/jpeg", context, bossRole, positionInstruction, friendlyName);
                  }

                  await handleNonSlipImage(finalResult, buffer);
                }
              } else {
                // Not the chosen one: Sleep to allow the chosen one to decide
                console.log(`Yuzu Vision Batching: Message ${currentMsgId} waiting for chosen one's decision...`);
                await new Promise(resolve => setTimeout(resolve, 3500));

                const { data: decision } = await supabase
                  .from('yuzu_chat_history')
                  .select('message_type')
                  .eq('group_id', groupId)
                  .eq('user_id', userId)
                  .in('message_type', ['slip_batch_approved', 'report_batch_taken'])
                  .gte('created_at', sixSecondsAgo);

                const hasReportBatchTaken = decision && decision.some(d => d.message_type === 'report_batch_taken');

                if (hasReportBatchTaken) {
                  // Skip reply as this batch is already handled as a report batch
                  console.log(`Yuzu Vision Batching: Message ${currentMsgId} is part of report batch. Skipping reply.`);
                  await saveMessage(groupId, userId, 'user', `[ภาพประกอบเพิ่มเติม]`, 'image_description');
                  handledLocally = true;
                  continue;
                }

                // If it is a slip batch (or fallback to individual processing)
                console.log(`Yuzu Vision Batching: Message ${currentMsgId} proceeding individually.`);
                const result = await classifyAndAnalyzeImage(base64, "image/jpeg", context, bossRole, positionInstruction, friendlyName);

                if (result.isSlip) {
                  handledLocally = true;
                  await handleSlipImage(event, client, buffer, userId, groupId, result);
                } else {
                  await handleNonSlipImage(result, buffer);
                }
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
              const context = `[Location] Lat: ${latitude}, Lng: ${longitude}, Address: ${address}\n[Home] Shop "In The Haus" is at (17.390083, 104.792944)\n[Source] https://script.google.com/macros/s/AKfycbyJ5WFOFmjwVJWoIUer6dwxHdeSShDvUfSWU0NNfsIH8Ek9WguCAzJG9QSbK5g77MH6/exec`;
              const response = await getGeminiResponse(query, context, [], userId);
              
              await saveMessage(groupId, userId, 'user', `[Location Message] ${address || 'Coordinates'}`, 'location');
              await saveMessage(groupId, null, 'model', response, 'text');
              
              handledLocally = true;
              await client.replyMessage(event.replyToken, { type: 'text', text: response });
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
          const welcomeText = "สวัสดีครับ ยูซุยินดีต้อนรับครับ 🍊 ยูซุเป็นผู้จัดการร้าน AI ประจำร้าน In The Haus ครับ สามารถสอบถามเรื่องตารางงาน สรุปยอดขาย เช็คสภาพอากาศ หรือข้อมูลระบบอื่นๆ ได้เลยครับ";
          await client.replyMessage(event.replyToken, { type: 'text', text: welcomeText });
          handledLocally = true;
        }
        
        // --- Handle Join Group Events ---
        else if (event.type === 'join') {
          const welcomeGroupText = "สวัสดีครับทุกคนในกลุ่ม! 🍊 ยูซุเป็นผู้จัดการร้าน AI ของร้าน In The Haus เข้าร่วมกลุ่มเรียบร้อยครับ ทุกคนสามารถเรียกใช้งานยูซุได้โดยพิมพ์ขึ้นต้นว่า 'yuzu' หรือ 'ยูซุ' นะครับ (เช่น 'yuzu ขอตารางงานวันนี้' หรือ 'yuzu ยอดขายเมื่อวานเป็นอย่างไร') เพื่อให้ระบบและร้านของเราทำงานได้อย่างราบรื่นครับ";
          await client.replyMessage(event.replyToken, { type: 'text', text: welcomeGroupText });
          handledLocally = true;
        }
        
        // --- Handle Member Joined Group Events ---
        else if (event.type === 'memberJoined') {
          const welcomeMemberText = "ยินดีต้อนรับสมาชิกใหม่เข้าสู่กลุ่มครับ! 🍊 ผมชื่อยูซุ เป็นผู้จัดการร้าน AI นะครับ หากมีข้อมูลตารางงานหรือการรายงานระบบจุดไหนให้ช่วยประสานงาน เรียกใช้ผมได้ตลอดเวลาเลยครับ";
          await client.replyMessage(event.replyToken, { type: 'text', text: welcomeMemberText });
          handledLocally = true;
        }
        } catch (err) {
          console.error("Error processing event:", err);
        } finally {
          if (eventId) {
            inProgressEvents.delete(eventId);
            recentlyProcessedEvents.set(eventId, Date.now());
            cleanUpOldProcessedEvents();
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
    });

    return NextResponse.json({ success: true, message: 'Processing in background' });

  } catch (error) {
    console.error("Webhook Proxy Error:", error);
    return NextResponse.json({ success: false }, { status: 200 });
  }
}