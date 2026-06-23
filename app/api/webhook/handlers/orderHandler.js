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
          const itemsText = orderData.items.map((i, idx) => `${String(idx + 1).padStart(2, '0')}  ${i.name} [x${i.qty}]`).join('\n');
          const orderFlex = {
            type: 'bubble',
            cornerRadius: 'none',
            styles: {
              header: { backgroundColor: '#f3f3f3' },
              body: { backgroundColor: '#f3f3f3' },
              footer: { backgroundColor: '#ebebeb' }
            },
            header: {
              type: 'box',
              layout: 'vertical',
              paddingAll: '20px',
              contents: [
                { type: 'text', text: 'PHONE ORDER INCOMING', weight: 'bold', color: '#1c1c1c', size: 'sm' },
                { type: 'text', text: 'STATUS: PENDING ACCEPTANCE', color: '#ef6c00', size: 'xxs', weight: 'bold', margin: 'xs' }
              ]
            },
            body: {
              type: 'box',
              layout: 'vertical',
              paddingAll: '20px',
              spacing: 'sm',
              contents: [
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: 'CUSTOMER', size: 'xs', color: '#666666', flex: 1 },
                    { type: 'text', text: orderData.customerName || 'UNSPECIFIED', size: 'xs', color: '#1c1c1c', align: 'end', flex: 2 }
                  ]
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: 'PHONE', size: 'xs', color: '#666666', flex: 1 },
                    { type: 'text', text: orderData.phone || 'UNSPECIFIED', size: 'xs', color: '#1c1c1c', align: 'end', flex: 2 }
                  ]
                },
                { type: 'separator', margin: 'md', color: '#cccccc' },
                { type: 'text', text: 'ORDER ITEMS', size: 'xxs', color: '#666666', weight: 'bold', margin: 'md' },
                { type: 'text', text: itemsText, wrap: true, size: 'xs', color: '#1c1c1c', style: 'normal' }
              ]
            },
            footer: {
              type: 'box',
              layout: 'horizontal',
              paddingAll: '15px',
              spacing: 'sm',
              contents: [
                { type: 'button', style: 'primary', color: '#1c1c1c', action: { type: 'postback', label: 'ACCEPT ORDER', data: `action=confirm_phone_order&id=${order.id}` } },
                { type: 'button', style: 'secondary', action: { type: 'postback', label: 'MARK COMPLETE', data: `action=done_phone_order&id=${order.id}` } }
              ]
            }
          };
          await client.replyMessage(event.replyToken, { type: 'flex', altText: 'พบรายการโทรสั่งอาหาร', contents: orderFlex });
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
            cornerRadius: 'none',
            styles: {
              header: { backgroundColor: '#f3f3f3' },
              body: { backgroundColor: '#f3f3f3' },
              footer: { backgroundColor: '#ebebeb' }
            },
            header: {
              type: 'box',
              layout: 'vertical',
              paddingAll: '20px',
              contents: [
                { type: 'text', text: 'TABLE RESERVATION INCOMING', weight: 'bold', color: '#1c1c1c', size: 'sm' },
                { type: 'text', text: 'STATUS: PENDING CONFIRMATION', color: '#ef6c00', size: 'xxs', weight: 'bold', margin: 'xs' }
              ]
            },
            body: {
              type: 'box',
              layout: 'vertical',
              paddingAll: '20px',
              spacing: 'sm',
              contents: [
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: 'CUSTOMER', size: 'xs', color: '#666666', flex: 1 },
                    { type: 'text', text: resData.name || 'UNSPECIFIED', size: 'xs', color: '#1c1c1c', align: 'end', flex: 2 }
                  ]
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: 'PHONE', size: 'xs', color: '#666666', flex: 1 },
                    { type: 'text', text: resData.phone || 'UNSPECIFIED', size: 'xs', color: '#1c1c1c', align: 'end', flex: 2 }
                  ]
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: 'DATE', size: 'xs', color: '#666666', flex: 1 },
                    { type: 'text', text: resData.date, size: 'xs', color: '#1c1c1c', align: 'end', flex: 2 }
                  ]
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: 'TIME', size: 'xs', color: '#666666', flex: 1 },
                    { type: 'text', text: resData.time || 'UNSPECIFIED', size: 'xs', color: '#1c1c1c', align: 'end', flex: 2 }
                  ]
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: 'GUESTS', size: 'xs', color: '#666666', flex: 1 },
                    { type: 'text', text: `${resData.guests} PAX`, size: 'xs', color: '#1c1c1c', align: 'end', weight: 'bold', flex: 2 }
                  ]
                }
              ]
            },
            footer: {
              type: 'box',
              layout: 'horizontal',
              paddingAll: '15px',
              spacing: 'sm',
              contents: [
                { type: 'button', style: 'primary', color: '#1c1c1c', action: { type: 'postback', label: 'CONFIRM BOOKING', data: `action=confirm_table_reservation&id=${reservation.id}` } },
                { type: 'button', style: 'secondary', action: { type: 'postback', label: 'CANCEL', data: `action=cancel_table_reservation&id=${reservation.id}` } }
              ]
            }
          };
          await client.replyMessage(event.replyToken, { type: 'flex', altText: 'บันทึกการจองโต๊ะ', contents: resFlex });
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
