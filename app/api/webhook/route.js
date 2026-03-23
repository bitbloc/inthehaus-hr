import { Client } from '@line/bot-sdk';
import { NextResponse } from 'next/server';
import { getGeminiResponse, classifyAndAnalyzeImage } from '../../../utils/gemini';
import { saveMessage, getChatHistory, getYuzuConfigs, getEmployeeByLineId } from '../../../utils/memory';
import { getIngredientPrices } from '../../../utils/price';
import { format, addHours } from 'date-fns';

export async function POST(request) {
  const client = new Client({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
  });

  try {
    const body = await request.json();
    const events = body.events;

    for (const event of events) {
      if (event.type === 'message') {
        const userId = event.source.userId;
        const groupId = event.source.groupId || userId;
        let handledLocally = false;

        // Handle Text Messages
        if (event.message.type === 'text') {
          const rawText = event.message.text;
          const query = rawText.trim();

          // Robust Check for Yuzu mention (case-insensitive)
          const isYuzuMentioned = /yuzu|ยูซุ/i.test(query);
          
          if (isYuzuMentioned) {
            const history = await getChatHistory(groupId, 10);
            const response = await getGeminiResponse(query, "", history, userId);

            await saveMessage(groupId, userId, 'user', query, 'text');
            await saveMessage(groupId, null, 'model', response, 'text');

            await client.replyMessage(event.replyToken, { type: 'text', text: response });
            handledLocally = true;
          } else {
            await saveMessage(groupId, userId, 'user', rawText, 'text');
          }
        } 
        
        // Handle Image Messages
        else if (event.message.type === 'image') {
          try {
            const stream = await client.getMessageContent(event.message.id);
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            const buffer = Buffer.concat(chunks);
            const base64 = buffer.toString('base64');

            const configs = await getYuzuConfigs();
            const { father_uid, mother_uid } = configs;
            const isBoss = userId === father_uid || userId === mother_uid;

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
            const result = await classifyAndAnalyzeImage(base64, "image/jpeg", context, isBoss, positionInstruction);

            await saveMessage(groupId, userId, 'user', result.shortDescription || "Image sent", 'image_description');

            if (result.isSlip) {
              const { supabase } = await import('../../../lib/supabaseClient');
              const { data: emp } = await supabase
                 .from('employees')
                 .select('id, line_user_id, line_bot_id, nickname, name, position')
                 .eq('is_active', true)
                 .or(`line_bot_id.eq.${userId},line_user_id.eq.${userId}`)
                 .maybeSingle();

              const senderName = emp ? (emp.nickname || emp.name) : "บุคคลภายนอก";
              const position = emp?.position?.toLowerCase() || '';
              const isAuthorized = isBoss || position.includes('bar') || position.includes('floor') || position.includes('owner');

              if (!isAuthorized) {
                 await client.replyMessage(event.replyToken, { type: 'text', text: `เมี๊ยว~ คุณ ${senderName} ไม่มีสิทธิ์บันทึกสลิปนะคะ\n[UID: ${userId}] 😾` });
              } else {
                const fileName = `slip_${Date.now()}_${userId}.jpg`;
                const { data: uploadData, error: uploadError } = await supabase.storage
                  .from('yuzu-slips')
                  .upload(fileName, buffer, { contentType: 'image/jpeg' });

                const { data: { publicUrl } } = supabase.storage.from('yuzu-slips').getPublicUrl(fileName);
                const dateStr = format(addHours(new Date(), 7), 'yyyy-MM-dd');
                const parsedAmount = typeof result.amount === 'number' ? result.amount : parseFloat(String(result.amount).replace(/,/g, ''));

                const { error: insertError } = await supabase.from('slip_transactions').insert({
                  group_id: groupId,
                  user_id: emp?.id || null,
                  amount: parsedAmount,
                  slip_url: publicUrl,
                  transaction_ref: result.transactionRef || null,
                  sender_name: result.senderName || null,
                  bank_name: result.bankName || null,
                  date: dateStr
                });

                if (insertError) {
                   const msg = insertError.code === '23505' ? "เมี๊ยว~ สลิปใบนี้บันทึกไปแล้วค่ะ!" : `เมี๊ยว~ บันทึกไม่สำเร็จค่ะ (${insertError.message})`;
                   await client.replyMessage(event.replyToken, { type: 'text', text: msg });
                } else {
                   await client.replyMessage(event.replyToken, { type: 'text', text: `บันทึกยอดโอน ${Number(parsedAmount).toLocaleString()} บาท เรียบร้อยค่ะ เมี๊ยว~ 💸\nโดย: ${senderName}\nธนาคาร: ${result.bankName || 'ไม่ระบุ'}` });
                }
              }
              handledLocally = true;
            } else if (result.shouldReply || result.analysis) {
              await client.replyMessage(event.replyToken, { type: 'text', text: result.analysis || result.shortDescription });
              handledLocally = true;
            }
          } catch (e) { 
            console.error("Vision Error:", e);
            // Fallback for image processing errors to prevent non-responsiveness
            if (!handledLocally) {
              await client.replyMessage(event.replyToken, { type: 'text', text: "เมี๊ยว~ ยูซุประมวลผลรูปภาพไม่สำเร็จค่ะ ลองส่งใหม่อีกครั้งนะคะ! 😿" });
              handledLocally = true;
            }
          }
        }
        
        // Handle Location Messages
        else if (event.message.type === 'location') {
          const { latitude, longitude, address } = event.message;
          const query = `ช่วยหาปั๊มน้ำมันที่ใกล้ที่สุดจาก (${latitude}, ${longitude})`;
          const context = `[Location] ${address} (${latitude}, ${longitude})`;
          const response = await getGeminiResponse(query, context, [], userId);
          await client.replyMessage(event.replyToken, { type: 'text', text: response });
          handledLocally = true;
        }
      }
    }

    // Forward to GAS (Keep existing logic)
    const isFromOriginalGroup = body.events.some(e => e.source?.groupId === 'C1210c7a0601b5a675060e312efe10bff');
    if (isFromOriginalGroup) {
      await fetch('https://script.google.com/macros/s/AKfycbyJ5WFOFmjwVJWoIUer6dwxHdeSShDvUfSWU0NNfsIH8Ek9WguCAzJG9QSbK5g77MH6/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).catch(e => console.error("GAS Forward Error:", e));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook Error:", error);
    return NextResponse.json({ success: false }, { status: 200 });
  }
}