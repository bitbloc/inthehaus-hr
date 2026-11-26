import { lowStockFlex, allStockFlex, historyFlex, selectionFlex, singleItemFlex, searchResultFlex, confirmFlex, auditFormFlex } from './stockFlex.js';
import { format, addHours } from 'date-fns';
import { getEmployeeByLineId } from '../../../../utils/memory';
import { buildPayloadPostbackData, readPostbackPayload, payloadKey, PAYLOAD_TOO_LONG_TEXT } from '../../../../utils/postbackPayload';

const processedPostbacks = new Set();

const cleanString = (str) => str.toLowerCase().replace(/[^a-zA-Z0-9\u0e00-\u0e7f]/g, '');

function filterStockItemsByQuery(allItems, searchQuery) {
  const cleanSearch = cleanString(searchQuery);
  if (!cleanSearch) return [];

  const tokens = searchQuery
    .toLowerCase()
    .split(/\s+|และ|,|，|、|\/|\|/g)
    .map(t => cleanString(t))
    .filter(t => t.length > 1);

  return allItems.filter(item => {
    const cleanItemName = cleanString(item.name);
    if (cleanItemName.includes(cleanSearch) || cleanSearch.includes(cleanItemName)) {
      return true;
    }
    return tokens.some(token => cleanItemName.includes(token));
  });
}

export async function handleStockResponseTags(response, request, query = "") {
  // 1. Handle Stock Proposals
  if (response.includes('[STOCK_ACTION]')) {
    try {
      const stockPart = response.split('[STOCK_ACTION]')[1].trim();
      const actionData = JSON.parse(stockPart);
      
      const { fetchLowStock, fetchStockItems, fetchStockHistory } = await import('../../../../utils/stock_api');

      if (actionData.action === 'CHECK_LOW') {
         const lowStockData = await fetchLowStock();
         if (lowStockData.length === 0) {
            return { type: 'text', text: '✅ ตรวจสอบสต็อกเรียบร้อยครับ ไม่มีรายการสินค้าที่เหลือน้อยกว่าจุดสั่งซื้อขั้นต่ำครับ' };
         } else {
            return lowStockFlex(lowStockData);
         }
      } else if (actionData.action === 'CHECK_ALL') {
         const allItems = await fetchStockItems();
         if (allItems.length === 0) {
            return { type: 'text', text: 'ยังไม่มีสินค้าในระบบค่ะ' };
         } else {
            return allStockFlex(allItems);
         }
      } else if (actionData.action === 'CHECK_ITEM') {
         const search = actionData.itemName || '';
         if (!search) {
            return { type: 'text', text: '❌ กรุณาระบุชื่อสินค้าที่ต้องการตรวจสอบด้วยครับ' };
         } else {
            const allItems = await fetchStockItems();
            let matchedItems = [];
            if (query) {
               matchedItems = filterStockItemsByQuery(allItems, query);
            }
            if (matchedItems.length === 0) {
               matchedItems = filterStockItemsByQuery(allItems, search);
            }

            if (matchedItems.length === 1) {
               return singleItemFlex(matchedItems[0]);
            } else if (matchedItems.length > 1) {
               return searchResultFlex(search, matchedItems);
            } else {
               return { type: 'text', text: `❌ ไม่พบสินค้าชื่อ "${search}" ในระบบคลังสินค้าครับ` };
            }
         }
      } else if (actionData.action === 'CHECK_HISTORY') {
         let historyData = [];
         let title = 'ประวัติอัปเดตสต็อกล่าสุด';
         
         if (actionData.itemName && actionData.itemName !== 'ชื่อสินค้า(มีหรือไม่มีก็ได้)') {
            const allItems = await fetchStockItems();
            let matchedItems = [];
            if (query) {
               matchedItems = filterStockItemsByQuery(allItems, query);
            }
            if (matchedItems.length === 0) {
               matchedItems = filterStockItemsByQuery(allItems, actionData.itemName);
            }
            const item = matchedItems[0] || null;
            
            if (item) {
               historyData = await fetchStockHistory(item.id);
               title = `ประวัติอัปเดตสต็อก: ${item.name}`;
            } else if (matchedItems.length > 1) {
               return selectionFlex(actionData.itemName, matchedItems);
            } else {
               return { type: 'text', text: `❌ ไม่พบประวัติความเคลื่อนไหวของสินค้า "${actionData.itemName}" เนื่องจากไม่มีสินค้ารายการนี้ในคลังครับ` };
            }
         } else {
            historyData = await fetchStockHistory();
         }
         
         if (historyData.length === 0) {
            return { type: 'text', text: `ไม่มีประวัติความเคลื่อนไหวสำหรับสินค้าดังกล่าวในระบบครับ` };
         } else {
            return historyFlex(historyData, title);
         }
      } else if (['RESTOCK', 'DEDUCT', 'UPDATE_ITEM', 'CREATE_ITEM'].includes(actionData.action)) {
         let confirmMsg = '';
         if (actionData.action === 'RESTOCK') confirmMsg = `ยืนยันการรับเข้า (In) สต็อก [${actionData.itemName}] จำนวน ${actionData.quantity} หน่วย`;
         if (actionData.action === 'DEDUCT') confirmMsg = `ยืนยันการเบิก/หักจ่าย (Out) สต็อก [${actionData.itemName}] จำนวน ${actionData.quantity} หน่วย`;
         if (actionData.action === 'UPDATE_ITEM') confirmMsg = `ยืนยันการอัปเดตข้อมูล [${actionData.itemName}] Reorder: ${actionData.reorder_point}`;
         if (actionData.action === 'CREATE_ITEM') confirmMsg = `ยืนยันการสร้างรายการสินค้าใหม่: [${actionData.itemName}]`;
         
         const postbackData = await buildPayloadPostbackData('confirm_stock', actionData);
         return postbackData ? confirmFlex(confirmMsg, postbackData) : { type: 'text', text: PAYLOAD_TOO_LONG_TEXT };
      }
    } catch (e) {
      console.error("Stock Action Error:", e);
      return { type: 'text', text: `เกิดข้อผิดพลาดในการดึงข้อมูลจากระบบสต็อกครับ บอสสามารถตรวจสอบระบบหรือแจ้งทีมงานผู้ดูแลระบบได้ครับ\nError: ${e.message}` };
    }
  }

  // 2. Handle Stock Audit Form Request
  if (response.includes('[STOCK_AUDIT_FORM]')) {
    try {
      const reqOrigin = new URL(request.url).origin;
      const liffUrl = `${reqOrigin}/stock/audit`;
      
      return auditFormFlex(liffUrl);
    } catch (e) {
      console.error("Stock Audit Form Error:", e);
      return null;
    }
  }

  return null;
}

export async function handleStockPostback(event, client, action, queryParams, userId) {
  if (action === 'cancel_stock') {
    await client.replyMessage(event.replyToken, { type: 'text', text: '✅ ยกเลิกการทำรายการจัดการสต็อกเรียบร้อยครับ' });
    return { handled: true };
  }

  if (action === 'confirm_stock') {
    const payloadRaw = payloadKey(queryParams);
    if (!payloadRaw) {
      await client.replyMessage(event.replyToken, { type: 'text', text: 'ไม่พบข้อมูลรายการนี้แล้วครับ รบกวนส่งคำขอใหม่อีกครั้งครับ' });
      return { handled: true };
    }
    if (processedPostbacks.has(payloadRaw)) {
      return { handled: true, duplicate: true };
    }
    processedPostbacks.add(payloadRaw);
    setTimeout(() => processedPostbacks.delete(payloadRaw), 60000); // Clear after 60s

    try {
      const payload = await readPostbackPayload(queryParams);
      if (!payload) {
        await client.replyMessage(event.replyToken, { type: 'text', text: 'ไม่พบข้อมูลรายการนี้แล้วครับ รบกวนส่งคำขอใหม่อีกครั้งครับ' });
        return { handled: true };
      }
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
         await client.replyMessage(event.replyToken, { type: 'text', text: `✅ ดำเนินการเพิ่มรายการสินค้าใหม่ [${payload.itemName}] เข้าระบบคลังสินค้าเรียบร้อยครับ` });
      } else {
         const searchItems = await fetchStockItems(payload.itemName);
         const exactMatch = searchItems.find(i => i.name === payload.itemName);
         const item = exactMatch || (searchItems.length === 1 ? searchItems[0] : null);
         
         if (!item) {
           const optionsText = searchItems.length > 0 ? ` เล็งตัวไหนไว้คะ: ${searchItems.slice(0,3).map(i => i.name).join(', ')}?` : "";
           await client.replyMessage(event.replyToken, { type: 'text', text: `❌ ไม่พบรายการสินค้า "${payload.itemName}" ที่ตรงกันในระบบครับ${optionsText} รบกวนตรวจสอบตัวสะกดชื่อสินค้าอีกครั้งครับ` });
           return { handled: true };
         }

         if (payload.action === 'UPDATE_ITEM') {
           await updateStockItem(item.id, { reorder_point: payload.reorder_point });
           await client.replyMessage(event.replyToken, { type: 'text', text: `✅ อัปเดตข้อมูลของ [${item.name}] สำเร็จแล้วค๊า!` });
         } else if (payload.action === 'RESTOCK' || payload.action === 'DEDUCT') {
           const tType = payload.action === 'RESTOCK' ? 'in' : 'out';
           await addStockTransaction(item.id, tType, payload.quantity, empName, payload.note || `ปรับผ่านแชท Yuzu`);
           await client.replyMessage(event.replyToken, { type: 'text', text: `✅ บันทึกยอดคลังสินค้า [${item.name}] สำเร็จแล้วครับ การทำรายการถูกบันทึกเข้าระบบประวัติเรียบร้อย` });
         }
      }
      return { handled: true };
    } catch (err) {
      console.error("Stock Postback Error:", err);
      await client.replyMessage(event.replyToken, { type: 'text', text: `⚠️ ว้าย! เกิดข้อผิดพลาดจากฝั่ง API สินค้าค่ะ:\n${err.message}` });
      return { handled: true };
    }
  }

  if (action === 'check_exact_stock') {
    try {
      const itemName = queryParams.get('itemName');
      const { fetchStockItems } = await import('../../../../utils/stock_api');
      const items = await fetchStockItems(itemName);
      const exactMatch = items.find(i => i.name === itemName);

      if (exactMatch) {
        const flexMsg = singleItemFlex(exactMatch);
        await client.replyMessage(event.replyToken, flexMsg);
      } else {
        await client.replyMessage(event.replyToken, { type: 'text', text: `❌ ไม่พบข้อมูลระดับสต็อกสำหรับ "${itemName}" ในระบบครับ` });
      }
      return { handled: true };
    } catch (err) {
      console.error("Check Exact Stock Postback Error:", err);
      await client.replyMessage(event.replyToken, { type: 'text', text: `⚠️ เกิดข้อผิดพลาดในการดึงข้อมูลสินค้าค่ะ: ${err.message}` });
      return { handled: true };
    }
  }

  return { handled: false };
}
