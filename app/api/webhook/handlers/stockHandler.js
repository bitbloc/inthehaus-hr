import { format, addHours } from 'date-fns';
import { getEmployeeByLineId } from '../../../../utils/memory';

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
            return { type: 'text', text: '✅ เช็คให้แล้วค่ะ ไม่มีรายการสินค้าที่เหลือน้อยเลย สบายใจได้ เมี๊ยว~' };
         } else {
            return formatLowStockFlex(lowStockData);
         }
      } else if (actionData.action === 'CHECK_ALL') {
         const allItems = await fetchStockItems();
         if (allItems.length === 0) {
            return { type: 'text', text: 'ยังไม่มีสินค้าในระบบค่ะ' };
         } else {
            return formatAllStockFlex(allItems);
         }
      } else if (actionData.action === 'CHECK_ITEM') {
         const search = actionData.itemName || '';
         if (!search) {
            return { type: 'text', text: '❌ ระบุชื่อสินค้าที่ต้องการเช็คด้วยนะ เมี๊ยว~' };
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
               return formatSingleItemStockFlex(matchedItems[0]);
            } else if (matchedItems.length > 1) {
               return formatMultiItemsStockFlex(search, matchedItems);
            } else {
               return { type: 'text', text: `❌ ไม่พบสินค้าชื่อ "${search}" ในคลังค่ะ เมี๊ยว~` };
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
               return formatStockSelectionFlex(actionData.itemName, matchedItems);
            } else {
               return { type: 'text', text: `❌ หาประวัติของ "${actionData.itemName}" ไม่เจอค่ะ ไม่มีสินค้านี้ในระบบ เมี๊ยว~` };
            }
         } else {
            historyData = await fetchStockHistory();
         }
         
         if (historyData.length === 0) {
            return { type: 'text', text: `ไม่มีการเคลื่อนไหวสต็อกเลยค่ะ สงบเงียบมาก เมี๊ยว~` };
         } else {
            return formatStockHistoryFlex(historyData, title);
         }
      } else if (['RESTOCK', 'DEDUCT', 'UPDATE_ITEM', 'CREATE_ITEM'].includes(actionData.action)) {
         let confirmMsg = '';
         if (actionData.action === 'RESTOCK') confirmMsg = `ยืนยันการรับเข้า (In) สต็อก [${actionData.itemName}] จำนวน ${actionData.quantity} หน่วย`;
         if (actionData.action === 'DEDUCT') confirmMsg = `ยืนยันการเบิก/หักจ่าย (Out) สต็อก [${actionData.itemName}] จำนวน ${actionData.quantity} หน่วย`;
         if (actionData.action === 'UPDATE_ITEM') confirmMsg = `ยืนยันการอัปเดตข้อมูล [${actionData.itemName}] Reorder: ${actionData.reorder_point}`;
         if (actionData.action === 'CREATE_ITEM') confirmMsg = `ยืนยันการสร้างรายการสินค้าใหม่: [${actionData.itemName}]`;
         
         const confirmFlex = {
            type: 'flex',
            altText: 'ยืนยันการอัปเดตคลังสินค้า',
            contents: {
              type: 'bubble',
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
                  { type: 'text', text: 'STOCK INVENTORY UPDATE REQUEST', color: '#1c1c1c', weight: 'bold', size: 'sm' },
                  { type: 'text', text: 'STATUS: PENDING CONFIRMATION', color: '#ef6c00', size: 'xxs', weight: 'bold', margin: 'xs' }
                ]
              },
              body: {
                type: 'box',
                layout: 'vertical',
                paddingAll: '20px',
                contents: [
                  { type: 'text', text: confirmMsg, wrap: true, size: 'xs', color: '#1c1c1c', weight: 'bold' },
                  { type: 'text', text: 'PLEASE CONFIRM THE TRANSACTION DETAILS BEFORE SUBMITTING TO API.', margin: 'md', size: 'xxs', color: '#888888', wrap: true }
                ]
              },
              footer: {
                type: 'box',
                layout: 'horizontal',
                paddingAll: '15px',
                spacing: 'sm',
                contents: [
                  { type: 'button', style: 'primary', color: '#1c1c1c', action: { type: 'postback', label: 'CONFIRM UPDATE', data: `action=confirm_stock&payload=${Buffer.from(JSON.stringify(actionData)).toString('base64')}` } },
                  { type: 'button', style: 'secondary', action: { type: 'postback', label: 'CANCEL', data: 'action=cancel_stock' } }
                ]
              }
            }
          };
          return confirmFlex;
      }
    } catch (e) {
      console.error("Stock Action Error:", e);
      return { type: 'text', text: `เกิดข้อผิดพลาดในการดึงข้อมูลจาก API สต็อกค่ะ บอสเช็คโค้ดหรือแจ้งทีมงานทีนะคะ เมี๊ยว~ 😿\nError: ${e.message}` };
    }
  }

  // 2. Handle Stock Audit Form Request
  if (response.includes('[STOCK_AUDIT_FORM]')) {
    try {
      const reqOrigin = new URL(request.url).origin;
      const liffUrl = `${reqOrigin}/stock/audit`;
      
      const auditFlex = {
        type: 'bubble',
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
            { type: 'text', text: 'STOCK AUDIT REGISTRY', color: '#1c1c1c', weight: 'bold', size: 'sm' },
            { type: 'text', text: 'SYSTEM TYPE: INTERACTIVE FORM', color: '#666666', size: 'xxs', weight: 'bold', margin: 'xs' }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '20px',
          contents: [
            { type: 'text', text: 'LAUNCH THE STOCK AUDIT INTERFACE TO REPORT INVENTORY COUNTS IN REAL-TIME.', wrap: true, size: 'xs', color: '#1c1c1c' }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '15px',
          contents: [
            { type: 'button', style: 'primary', color: '#1c1c1c', action: { type: 'uri', label: 'LAUNCH AUDIT FORM', uri: liffUrl } }
          ]
        }
      };

      return { type: 'flex', altText: '📋 ฟอร์มตรวจนับสต็อกมาแล้ว', contents: auditFlex };
    } catch (e) {
      console.error("Stock Audit Form Error:", e);
      return null;
    }
  }

  return null;
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

  if (action === 'check_exact_stock') {
    try {
      const itemName = queryParams.get('itemName');
      const { fetchStockItems } = await import('../../../../utils/stock_api');
      const items = await fetchStockItems(itemName);
      const exactMatch = items.find(i => i.name === itemName);

      if (exactMatch) {
        const flexMsg = formatSingleItemStockFlex(exactMatch);
        await client.replyMessage(event.replyToken, flexMsg);
      } else {
        await client.replyMessage(event.replyToken, { type: 'text', text: `❌ ไม่พบข้อมูลสต็อกสำหรับ "${itemName}" ในระบบค่ะ เมี๊ยว~` });
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

// ==========================================
// LINE Flex Message Formatters for Stock API
// ==========================================

function formatLowStockFlex(lowStockData) {
  const contents = [
    {
      type: "text",
      text: "STOCK LEVEL WARNING // REORDER REQUIRED",
      weight: "bold",
      size: "sm",
      color: "#c62828"
    },
    {
      type: "text",
      text: `ITEMS BELOW MINIMUM SPECIFICATION: ${lowStockData.length}`,
      color: "#666666",
      size: "xxs",
      weight: "bold",
      margin: "xs"
    },
    {
      type: "separator",
      margin: "md",
      color: "#cccccc"
    }
  ];

  const itemRows = lowStockData.slice(0, 15).map(item => {
    return {
      type: "box",
      layout: "horizontal",
      margin: "md",
      contents: [
        {
          type: "box",
          layout: "vertical",
          flex: 3,
          contents: [
            {
              type: "text",
              text: item.name.toUpperCase(),
              weight: "bold",
              size: "xs",
              color: "#1c1c1c",
              wrap: true
            },
            {
              type: "text",
              text: (item.category || "GENERAL").toUpperCase(),
              size: "xxs",
              color: "#888888"
            }
          ]
        },
        {
          type: "box",
          layout: "vertical",
          flex: 2,
          contents: [
            {
              type: "text",
              text: `${item.current_quantity} ${item.unit.toUpperCase()}`,
              align: "end",
              weight: "bold",
              size: "xs",
              color: "#c62828"
            },
            {
              type: "text",
              text: `MIN: ${item.reorder_point}`,
              align: "end",
              size: "xxs",
              color: "#888888"
            }
          ]
        }
      ]
    };
  });

  contents.push(...itemRows);

  if (lowStockData.length > 15) {
    contents.push(
      {
        type: "separator",
        margin: "md",
        color: "#cccccc"
      },
      {
        type: "text",
        text: `AND ${lowStockData.length - 15} OTHER ITEMS`,
        size: "xxs",
        color: "#888888",
        margin: "md",
        align: "center",
        weight: "bold"
      }
    );
  }

  return {
    type: "flex",
    altText: `แจ้งเตือน: สินค้าใกล้หมดสต็อก ${lowStockData.length} รายการ`,
    contents: {
      type: "bubble",
      size: "mega",
      styles: {
        header: { backgroundColor: "#f3f3f3" },
        body: { backgroundColor: "#f3f3f3" }
      },
      header: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        contents: [
          {
            type: "text",
            text: "INVENTORY STATUS ALERT",
            weight: "bold",
            color: "#c62828",
            size: "sm"
          }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        spacing: "xs",
        contents: contents
      }
    }
  };
}

function formatAllStockFlex(allItems) {
  const contents = [
    {
      type: "text",
      text: "STOCK REGISTRY INVENTORY",
      weight: "bold",
      size: "sm",
      color: "#1c1c1c"
    },
    {
      type: "text",
      text: `TOTAL REGISTERED ITEMS: ${allItems.length}`,
      color: "#666666",
      size: "xxs",
      weight: "bold",
      margin: "xs"
    },
    {
      type: "separator",
      margin: "md",
      color: "#cccccc"
    }
  ];

  const itemRows = allItems.slice(0, 15).map(item => {
    const isLow = item.current_quantity <= (item.reorder_point || 0);
    return {
      type: "box",
      layout: "horizontal",
      margin: "sm",
      contents: [
        {
          type: "text",
          text: item.name.toUpperCase(),
          weight: "bold",
          size: "xs",
          color: "#1c1c1c",
          flex: 3,
          wrap: true
        },
        {
          type: "text",
          text: `${item.current_quantity} ${item.unit.toUpperCase()}`,
          align: "end",
          weight: "bold",
          size: "xs",
          color: isLow ? "#c62828" : "#2e7d32",
          flex: 1
        }
      ]
    };
  });

  contents.push(...itemRows);

  if (allItems.length > 15) {
    contents.push(
      {
        type: "separator",
        margin: "md",
        color: "#cccccc"
      },
      {
        type: "text",
        text: `AND ${allItems.length - 15} OTHER ITEMS`,
        size: "xxs",
        color: "#888888",
        margin: "md",
        align: "center",
        weight: "bold"
      }
    );
  }

  return {
    type: "flex",
    altText: `คลังสินค้าทั้งหมด (${allItems.length} รายการ)`,
    contents: {
      type: "bubble",
      size: "mega",
      styles: {
        header: { backgroundColor: "#f3f3f3" },
        body: { backgroundColor: "#f3f3f3" }
      },
      header: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        contents: [
          {
            type: "text",
            text: "INVENTORY GENERAL REPORT",
            weight: "bold",
            color: "#1c1c1c",
            size: "sm"
          }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        spacing: "xs",
        contents: contents
      }
    }
  };
}

function formatStockHistoryFlex(historyData, title) {
  const contents = [
    {
      type: "text",
      text: "STOCK INVENTORY LOGS // MOVEMENTS",
      weight: "bold",
      size: "sm",
      color: "#1c1c1c"
    },
    {
      type: "text",
      text: title.toUpperCase(),
      color: "#666666",
      size: "xxs",
      weight: "bold",
      margin: "xs"
    },
    {
      type: "separator",
      margin: "md",
      color: "#cccccc"
    }
  ];

  const sorted = [...historyData].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  const historyRows = sorted.slice(0, 7).map(h => {
    const tTime = format(addHours(new Date(h.created_at), 7), 'dd/MM HH:mm');
    const isRestock = h.transaction_type === 'in';
    const signText = isRestock ? `INFLOW +${h.quantity_change}` : `OUTFLOW -${h.quantity_change}`;
    const badgeColor = isRestock ? "#2e7d32" : "#c62828";
    const itemName = h.stock_items ? h.stock_items.name.toUpperCase() : 'ITEM';

    return {
      type: "box",
      layout: "vertical",
      margin: "md",
      spacing: "xs",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            {
              type: "text",
              text: itemName,
              weight: "bold",
              size: "xs",
              color: "#1c1c1c",
              flex: 3,
              wrap: true
            },
            {
              type: "text",
              text: tTime,
              align: "end",
              size: "xxs",
              color: "#666666",
              flex: 1
            }
          ]
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            {
              type: "text",
              text: signText,
              size: "xxs",
              color: badgeColor,
              weight: "bold",
              flex: 2
            },
            {
              type: "text",
              text: `BY: ${h.performed_by ? h.performed_by.toUpperCase() : 'UNKNOWN'}`,
              align: "end",
              size: "xxs",
              color: "#666666",
              flex: 2,
              wrap: true
            }
          ]
        },
        ...(h.note ? [{
          type: "text",
          text: `NOTE: ${h.note.toUpperCase()}`,
          size: "xxs",
          color: "#888888",
          margin: "xs",
          wrap: true
        }] : [])
      ]
    };
  });

  contents.push(...historyRows);

  if (sorted.length > 7) {
    contents.push(
      {
        type: "separator",
        margin: "md",
        color: "#cccccc"
      },
      {
        type: "text",
        text: `SHOWING 7 OF ${sorted.length} MOVEMENT ENTRIES`,
        size: "xxs",
        color: "#888888",
        margin: "md",
        align: "center",
        weight: "bold"
      }
    );
  }

  return {
    type: "flex",
    altText: `ประวัติสต็อกสินค้า: ${title}`,
    contents: {
      type: "bubble",
      size: "mega",
      styles: {
        header: { backgroundColor: "#f3f3f3" },
        body: { backgroundColor: "#f3f3f3" }
      },
      header: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        contents: [
          {
            type: "text",
            text: "TRANSACTION HISTORY REGISTER",
            weight: "bold",
            color: "#1c1c1c",
            size: "sm"
          }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        spacing: "xs",
        contents: contents
      }
    }
  };
}

function formatStockSelectionFlex(searchQuery, matchingItems) {
  return {
    type: "flex",
    altText: "เลือกสินค้าที่ต้องการเช็คสต็อก",
    contents: {
      type: "bubble",
      size: "mega",
      styles: {
        header: { backgroundColor: "#f3f3f3" },
        body: { backgroundColor: "#f3f3f3" }
      },
      header: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        contents: [
          {
            type: "text",
            text: "QUERY MATCH RESOLUTION",
            weight: "bold",
            color: "#1c1c1c",
            size: "sm"
          },
          {
            type: "text",
            text: `MULTIPLE MATCHES FOUND FOR "${searchQuery.toUpperCase()}"`,
            color: "#666666",
            size: "xxs",
            weight: "bold",
            margin: "xs"
          }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "SELECT THE TARGET ITEM SPECIFICATION FOR RESOLUTION:",
            size: "xs",
            color: "#333333",
            wrap: true
          },
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: matchingItems.slice(0, 5).map(item => {
              return {
                type: "button",
                style: "primary",
                color: "#1c1c1c",
                height: "sm",
                action: {
                  type: "postback",
                  label: item.name.toUpperCase(),
                  data: `action=check_exact_stock&itemName=${encodeURIComponent(item.name)}`
                }
              };
            })
          }
        ]
      }
    }
  };
}

function formatSingleItemStockFlex(item) {
  const isLow = item.current_quantity <= (item.reorder_point || 0);
  const statusText = isLow ? "WARNING: REORDER REQUIRED" : "STATUS: NOMINAL";
  const statusColor = isLow ? "#c62828" : "#2e7d32";
  
  return {
    type: "flex",
    altText: `เช็คสต็อก: ${item.name} มี ${item.current_quantity} ${item.unit}`,
    contents: {
      type: "bubble",
      size: "mega",
      styles: {
        header: { backgroundColor: "#f3f3f3" },
        body: { backgroundColor: "#f3f3f3" }
      },
      header: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        contents: [
          {
            type: "text",
            text: `STOCK REGISTRY ITEM REPORT`,
            weight: "bold",
            color: "#1c1c1c",
            size: "sm"
          },
          {
            type: "text",
            text: `SPECIFICATION: ${item.name.toUpperCase()}`,
            color: "#666666",
            size: "xxs",
            weight: "bold",
            margin: "xs"
          }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        spacing: "md",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: "STOCK STATUS",
                size: "xs",
                color: "#666666",
                flex: 1
              },
              {
                type: "text",
                text: statusText,
                size: "xs",
                color: statusColor,
                align: "end",
                weight: "bold",
                flex: 2
              }
            ]
          },
          {
            type: "separator",
            color: "#cccccc"
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: "CURRENT BALANCE",
                size: "xs",
                color: "#1c1c1c",
                weight: "bold",
                flex: 1
              },
              {
                type: "text",
                text: `${item.current_quantity} ${item.unit.toUpperCase()}`,
                align: "end",
                weight: "bold",
                size: "sm",
                color: statusColor,
                flex: 2
              }
            ]
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: "REORDER POINT (MIN)",
                size: "xs",
                color: "#666666",
                flex: 1
              },
              {
                type: "text",
                text: `${item.reorder_point || 0} ${item.unit.toUpperCase()}`,
                align: "end",
                size: "xs",
                color: "#666666",
                flex: 2
              }
            ]
          }
        ]
      }
    }
  };
}

function formatMultiItemsStockFlex(searchQuery, items) {
  const contents = [
    {
      type: "text",
      text: "STOCK INVENTORY SEARCH RESULT",
      weight: "bold",
      size: "sm",
      color: "#1c1c1c"
    },
    {
      type: "text",
      text: `MATCHES FOR "${searchQuery.toUpperCase()}" (${items.length} ITEMS)`,
      color: "#666666",
      size: "xxs",
      weight: "bold",
      margin: "xs"
    },
    {
      type: "separator",
      margin: "md",
      color: "#cccccc"
    }
  ];

  const itemRows = items.slice(0, 15).map(item => {
    const isLow = item.current_quantity <= (item.reorder_point || 0);
    return {
      type: "box",
      layout: "horizontal",
      margin: "sm",
      contents: [
        {
          type: "text",
          text: item.name.toUpperCase(),
          weight: "bold",
          size: "xs",
          color: "#1c1c1c",
          flex: 3,
          wrap: true
        },
        {
          type: "text",
          text: `${item.current_quantity} ${item.unit.toUpperCase()}`,
          align: "end",
          weight: "bold",
          size: "xs",
          color: isLow ? "#c62828" : "#2e7d32",
          flex: 2
        }
      ]
    };
  });

  contents.push(...itemRows);

  if (items.length > 15) {
    contents.push(
      {
        type: "separator",
        margin: "md",
        color: "#cccccc"
      },
      {
        type: "text",
        text: `AND ${items.length - 15} OTHER ITEMS`,
        size: "xxs",
        color: "#888888",
        margin: "md",
        align: "center",
        weight: "bold"
      }
    );
  }

  return {
    type: "flex",
    altText: `ค้นหาสินค้า: ${searchQuery} (${items.length} รายการ)`,
    contents: {
      type: "bubble",
      size: "mega",
      styles: {
        header: { backgroundColor: "#f3f3f3" },
        body: { backgroundColor: "#f3f3f3" }
      },
      header: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        contents: [
          {
            type: "text",
            text: "INVENTORY QUERY MATCHES",
            weight: "bold",
            color: "#1c1c1c",
            size: "sm"
          }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        spacing: "xs",
        contents: contents
      }
    }
  };
}

