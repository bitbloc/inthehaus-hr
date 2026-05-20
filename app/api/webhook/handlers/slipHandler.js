import { supabase } from '../../../../lib/supabaseClient';

export async function handleSlipImage(event, client, buffer, userId, groupId, result) {
  if (!result.isSlip) return false;

  let mappedDbUserId = userId;
  let senderName = "บุคคลภายนอก (ไม่มีในระบบ)";
  let isAuthorized = false;

  // Direct query to ensure fresh database check
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
     if (position.includes('bar&floor') || position.includes('owner') || position.includes('ceo') || position.includes('manager')) {
        isAuthorized = true;
     }
  }

  if (!isAuthorized) {
     await client.replyMessage(event.replyToken, { type: 'text', text: `เมี๊ยว~ คุณ ${senderName} ไม่มีสิทธิ์บันทึกสลิปนะคะ (รับเฉพาะตำแหน่ง Bar&Floor และ Owner ค่ะ)\n[UID: ${userId}] 😾` });
     return true;
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
             { type: 'text', text: 'RECEIPT', color: '#ffffff80', size: 'xs', weight: 'bold' },
             { type: 'text', text: 'บันทึกยอดเงินสำเร็จ', color: '#ffffff', size: 'lg', weight: 'bold', margin: 'xs' }
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
                 { type: 'text', text: 'ยอดโอน', color: '#8c8c8c', size: 'sm', gravity: 'center', flex: 1 },
                 { type: 'text', text: `฿${parsedAmount.toLocaleString('th-TH', {minimumFractionDigits: 2})}`, align: 'end', color: '#1DB446', size: 'xl', weight: 'bold', flex: 2 }
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
             { type: 'text', text: 'Yuzu AI จัดการให้แล้วค่ะ เมี๊ยว~ 🐾', size: 'xs', align: 'center', color: '#b0b0b0' }
           ]
         }
       }
     };
     await client.replyMessage(event.replyToken, slipFlexMsg);
  }
  return true;
}
