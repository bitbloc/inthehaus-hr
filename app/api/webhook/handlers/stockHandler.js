import { format, addHours } from 'date-fns';
import { getEmployeeByLineId } from '../../../../utils/memory';

const processedPostbacks = new Set();

export async function handleStockResponseTags(response, client, groupId, request) {
  // 1. Handle Stock Proposals
  if (response.includes('[STOCK_ACTION]')) {
    try {
      const stockPart = response.split('[STOCK_ACTION]')[1].trim();
      const actionData = JSON.parse(stockPart);
      
      const { fetchLowStock, fetchStockItems, fetchStockHistory } = await import('../../../../utils/stock_api');

      if (actionData.action === 'CHECK_LOW') {
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
               return true;
            }
         } else {
            historyData = await fetchStockHistory();
         }
         
         if (historyData.length === 0) {
            await client.pushMessage(groupId, { type: 'text', text: `ไม่มีการเคลื่อนไหวสต็อกเลยค่ะ สงบเงียบมาก เมี๊ยว~` });
         } else {
            let msg = `🕒 ${title}:\n\n`;
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
      return true;
    } catch (e) {
      console.error("Stock Action Error:", e);
      await client.pushMessage(groupId, { type: 'text', text: `เกิดข้อผิดพลาดในการดึงข้อมูลจาก API สต็อกค่ะ บอสเช็คโค้ดหรือแจ้งทีมงานทีนะคะ เมี๊ยว~ 😿\nError: ${e.message}` });
      return true;
    }
  }

  // 2. Handle Stock Audit Form Request
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
      return true;
    } catch (e) {
      console.error("Stock Audit Form Error:", e);
      return true;
    }
  }

  return false;
}

export async function handleStockPostback(event, client, action, queryParams, userId) {
  if (action === 'cancel_stock') {
    await client.replyMessage(event.replyToken, { type: 'text', text: '✅ ยกเลิกการจัดการสต็อกแล้วค่ะ เมี๊ยว~' });
    return { handled: true };
  }

  if (action === 'confirm_stock') {
    const payloadRaw = queryParams.get('payload');
    if (processedPostbacks.has(payloadRaw)) {
      return { handled: true, duplicate: true };
    }
    processedPostbacks.add(payloadRaw);
    setTimeout(() => processedPostbacks.delete(payloadRaw), 60000); // Clear after 60s

    try {
      const payload = JSON.parse(Buffer.from(payloadRaw, 'base64').toString());
      const { fetchStockItems, addStockTransaction, updateStockItem, createStockItem } = await import('../../../../utils/stock_api');
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
         const searchItems = await fetchStockItems(payload.itemName);
         const exactMatch = searchItems.find(i => i.name === payload.itemName);
         const item = exactMatch || (searchItems.length === 1 ? searchItems[0] : null);
         
         if (!item) {
           const optionsText = searchItems.length > 0 ? ` เล็งตัวไหนไว้คะ: ${searchItems.slice(0,3).map(i => i.name).join(', ')}?` : "";
           await client.replyMessage(event.replyToken, { type: 'text', text: `❌ ไม่พบรายการสินค้า "${payload.itemName}" ที่ชัดเจนในระบบค่ะ${optionsText} ลองตรวจสอบชื่อให้แม่นๆ อีกทีนะ เมี๊ยว~` });
           return { handled: true };
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
      return { handled: true };
    } catch (err) {
      console.error("Stock Postback Error:", err);
      await client.replyMessage(event.replyToken, { type: 'text', text: `⚠️ ว้าย! เกิดข้อผิดพลาดจากฝั่ง API สินค้าค่ะ:\n${err.message}` });
      return { handled: true };
    }
  }

  return { handled: false };
}
