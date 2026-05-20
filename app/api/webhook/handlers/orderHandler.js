import { extractOrderFromText, extractReservationFromText } from '../../../../utils/gemini';
import { supabase } from '../../../../lib/supabaseClient';

export async function handleOrderAndReservationDetection(event, client, rawText, userId, groupId) {
  // 1. Phone Orders Auto-Detection
  const phoneRegex = /(0\d{1,2}-?\d{3,4}-?\d{3,4})/;
  const hasPhoneRegex = phoneRegex.test(rawText);
  const isOrderIntent = rawText.startsWith('สั่ง') || rawText.includes('สั่งทางโทรศัพท์') || rawText.includes('สั่งทางโทรสัพท์');
  
  if ((hasPhoneRegex && (rawText.includes('สั่ง') || rawText.length > 20)) || isOrderIntent) {
     console.log("Yuzu: Potential Phone Order Detected");
     const orderData = await extractOrderFromText(rawText);
     if (orderData && orderData.items?.length > 0) {
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
          return true;
        }
     }
  }

  // 2. Table Reservations Auto-Detection
  const reserveKeywords = ['จองโต๊ะ', 'จองไว้', 'กี่ที่', 'กี่คน', 'จองที่'];
  if (reserveKeywords.some(kw => rawText.includes(kw))) {
     console.log("Yuzu: Potential Reservation Detected");
     const resData = await extractReservationFromText(rawText);
     if (resData && resData.date) {
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
          return true;
       }
     }
  }

  return false;
}

export async function handleOrderAndReservationPostback(event, client, action, queryParams) {
  if (action === 'confirm_phone_order') {
    const orderId = queryParams.get('id');
    await supabase.from('phone_orders').update({ status: 'CONFIRMED', confirmed_at: new Date().toISOString() }).eq('id', orderId);
    await client.replyMessage(event.replyToken, { type: 'text', text: '✅ รับออเดอร์เรียบร้อยค่ะ! กำลังเตรียมอาหารให้ลูกค้านะคะ เมี๊ยว~ 🐾' });
    return true;
  }

  if (action === 'done_phone_order') {
    const orderId = queryParams.get('id');
    await supabase.from('phone_orders').update({ status: 'DONE', done_at: new Date().toISOString() }).eq('id', orderId);
    await client.replyMessage(event.replyToken, { type: 'text', text: '✅ ออเดอร์เสร็จเรียบร้อย! คุ้มค่าแก่การรอยคอยค่ะ เมี๊ยว~ 🏁' });
    return true;
  }

  if (action === 'confirm_table_reservation') {
    const resId = queryParams.get('id');
    await supabase.from('table_reservations').update({ status: 'CONFIRMED' }).eq('id', resId);
    await client.replyMessage(event.replyToken, { type: 'text', text: '✅ ยืนยันการจองคืนนี้เรียบร้อยค่ะ! เตรียมจัดโต๊ะรอรับบอสและลูกค้าเลยค่ะ เมี๊ยว~ 🥂' });
    return true;
  }

  if (action === 'cancel_table_reservation') {
    const resId = queryParams.get('id');
    await supabase.from('table_reservations').update({ status: 'CANCELLED' }).eq('id', resId);
    await client.replyMessage(event.replyToken, { type: 'text', text: '🌑 ยกเลิกการจองให้แล้วนะคะ เมี๊ยว~' });
    return true;
  }

  return false;
}
