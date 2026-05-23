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
            const flexMsg = formatLowStockFlex(lowStockData);
            await client.pushMessage(groupId, flexMsg);
         }
      } else if (actionData.action === 'CHECK_ALL') {
         const allItems = await fetchStockItems();
         if (allItems.length === 0) {
            await client.pushMessage(groupId, { type: 'text', text: 'ยังไม่มีสินค้าในระบบค่ะ' });
         } else {
            const flexMsg = formatAllStockFlex(allItems);
            await client.pushMessage(groupId, flexMsg);
         }
      } else if (actionData.action === 'CHECK_ITEM') {
         const search = actionData.itemName || '';
         if (!search) {
            await client.pushMessage(groupId, { type: 'text', text: '❌ ระบุชื่อสินค้าที่ต้องการเช็คด้วยนะ เมี๊ยว~' });
         } else {
            const items = await fetchStockItems(search);
            const exactMatch = items.find(i => i.name.toLowerCase() === search.toLowerCase());
            
            if (exactMatch) {
               const flexMsg = formatSingleItemStockFlex(exactMatch);
               await client.pushMessage(groupId, flexMsg);
            } else if (items.length === 1) {
               const flexMsg = formatSingleItemStockFlex(items[0]);
               await client.pushMessage(groupId, flexMsg);
            } else if (items.length > 1) {
               const flexMsg = formatStockSelectionFlex(search, items);
               await client.pushMessage(groupId, flexMsg);
            } else {
               await client.pushMessage(groupId, { type: 'text', text: `❌ ไม่พบสินค้าชื่อ "${search}" ในคลังค่ะ เมี๊ยว~` });
            }
         }
      } else if (actionData.action === 'CHECK_HISTORY') {
         let historyData = [];
         let title = 'ประวัติอัปเดตสต็อกล่าสุด';
         
         if (actionData.itemName && actionData.itemName !== 'ชื่อสินค้า(มีหรือไม่มีก็ได้)') {
            const searchItems = await fetchStockItems(actionData.itemName);
            const exactMatch = searchItems.find(i => i.name.toLowerCase() === actionData.itemName.toLowerCase());
            const item = exactMatch || (searchItems.length === 1 ? searchItems[0] : null);
            
            if (item) {
               historyData = await fetchStockHistory(item.id);
               title = `ประวัติอัปเดตสต็อก: ${item.name}`;
            } else if (searchItems.length > 1) {
               const selectionFlex = formatStockSelectionFlex(actionData.itemName, searchItems);
               await client.pushMessage(groupId, selectionFlex);
               return true;
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
            const flexMsg = formatStockHistoryFlex(historyData, title);
            await client.pushMessage(groupId, flexMsg);
         }
      } else if (['RESTOCK', 'DEDUCT', 'UPDATE_ITEM', 'CREATE_ITEM'].includes(actionData.action)) {
         let confirmMsg = '';
         if (actionData.action === 'RESTOCK') confirmMsg = `ยืนยันการรับเข้า (In) สต็อก [${actionData.itemName}] จำนวน ${actionData.quantity} หน่วย`;
         if (actionData.action === 'DEDUCT') confirmMsg = `ยืนยันการเบิก/หักจ่าย (Out) สต็อก [${actionData.itemName}] จำนวน ${actionData.quantity} หน่วย`;
         if (actionData.action === 'UPDATE_ITEM') confirmMsg = `ยืนยันการอัปเดตข้อมูล [${actionData.itemName}] Reorder: ${actionData.reorder_point}`;
         if (actionData.action === 'CREATE_ITEM') confirmMsg = `ยืนยันการสร้างรายการสินค้าใหม่: [${actionData.itemName}]`;
         
         const confirmFlex = {
           type: 'flex',
           altText: '📦 ยืนยันการอัปเดตคลังสินค้า',
           contents: {
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
           }
         };
         await client.pushMessage(groupId, confirmFlex);
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
      text: "⚠️ สินค้าใกล้หมดสต็อก",
      weight: "bold",
      size: "md",
      color: "#ffffff"
    },
    {
      type: "text",
      text: `ตรวจพบสินค้าเหลือน้อยกว่าจุดสั่งซื้อ ${lowStockData.length} รายการ`,
      color: "#f87171",
      size: "xs",
      margin: "xs"
    },
    {
      type: "separator",
      margin: "md",
      color: "#475569"
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
              text: item.name,
              weight: "bold",
              size: "sm",
              color: "#f8fafc",
              wrap: true
            },
            {
              type: "text",
              text: item.category || "ทั่วไป",
              size: "xxs",
              color: "#64748b"
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
              text: `${item.current_quantity} ${item.unit}`,
              align: "end",
              weight: "bold",
              size: "sm",
              color: "#ef4444"
            },
            {
              type: "text",
              text: `(Min: ${item.reorder_point})`,
              align: "end",
              size: "xxs",
              color: "#64748b"
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
        color: "#334155"
      },
      {
        type: "text",
        text: `... และรายการอื่นๆ อีก ${lowStockData.length - 15} รายการ`,
        size: "xs",
        color: "#64748b",
        margin: "md",
        align: "center"
      }
    );
  }

  return {
    type: "flex",
    altText: `⚠️ สินค้าใกล้หมดสต็อก ${lowStockData.length} รายการ`,
    contents: {
      type: "bubble",
      size: "mega",
      styles: {
        header: {
          backgroundColor: "#e11d48"
        },
        body: {
          backgroundColor: "#0f172a"
        }
      },
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "🚨 แจ้งเตือน: คลังสินค้าใกล้หมด",
            weight: "bold",
            color: "#ffffff",
            size: "md"
          }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
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
      text: "📦 รายการสินค้าทั้งหมดในคลัง",
      weight: "bold",
      size: "md",
      color: "#ffffff"
    },
    {
      type: "text",
      text: `ข้อมูลอัปเดตเรียลไทม์ (ทั้งหมด ${allItems.length} รายการ)`,
      color: "#94a3b8",
      size: "xs",
      margin: "xs"
    },
    {
      type: "separator",
      margin: "md",
      color: "#475569"
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
          text: item.name,
          weight: "bold",
          size: "sm",
          color: "#f8fafc",
          flex: 3,
          wrap: true
        },
        {
          type: "text",
          text: `${item.current_quantity} ${item.unit}`,
          align: "end",
          weight: "bold",
          size: "sm",
          color: isLow ? "#ef4444" : "#10b981",
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
        color: "#334155"
      },
      {
        type: "text",
        text: `... และรายการอื่นๆ อีก ${allItems.length - 15} รายการ`,
        size: "xs",
        color: "#64748b",
        margin: "md",
        align: "center"
      }
    );
  }

  return {
    type: "flex",
    altText: `📦 คลังสินค้าทั้งหมด (${allItems.length} รายการ)`,
    contents: {
      type: "bubble",
      size: "mega",
      styles: {
        header: {
          backgroundColor: "#3b82f6"
        },
        body: {
          backgroundColor: "#0f172a"
        }
      },
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "📦 รายงานคลังสินค้า (Stock)",
            weight: "bold",
            color: "#ffffff",
            size: "md"
          }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
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
      text: title,
      weight: "bold",
      size: "md",
      color: "#ffffff"
    },
    {
      type: "text",
      text: "ประวัติการเคลื่อนไหวคลังล่าสุด",
      color: "#94a3b8",
      size: "xs",
      margin: "xs"
    },
    {
      type: "separator",
      margin: "md",
      color: "#475569"
    }
  ];

  const sorted = [...historyData].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  const historyRows = sorted.slice(0, 7).map(h => {
    const tTime = format(addHours(new Date(h.created_at), 7), 'dd/MM HH:mm');
    const isRestock = h.transaction_type === 'in';
    const signText = isRestock ? `📈 รับเข้า +${h.quantity_change}` : `📉 เบิกออก ${h.quantity_change}`;
    const badgeColor = isRestock ? "#10b981" : "#ef4444";
    const itemName = h.stock_items ? h.stock_items.name : 'สินค้า';

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
              size: "sm",
              color: "#f8fafc",
              flex: 3,
              wrap: true
            },
            {
              type: "text",
              text: tTime,
              align: "end",
              size: "xs",
              color: "#64748b",
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
              size: "xs",
              color: badgeColor,
              weight: "bold",
              flex: 2
            },
            {
              type: "text",
              text: `โดย: ${h.performed_by || 'ไม่ทราบ'}`,
              align: "end",
              size: "xs",
              color: "#94a3b8",
              flex: 2,
              wrap: true
            }
          ]
        },
        ...(h.note ? [{
          type: "text",
          text: `💬 ${h.note}`,
          size: "xxs",
          color: "#64748b",
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
        color: "#334155"
      },
      {
        type: "text",
        text: `แสดงความเคลื่อนไหวล่าสุด 7 จาก ${sorted.length} รายการ`,
        size: "xs",
        color: "#64748b",
        margin: "md",
        align: "center"
      }
    );
  }

  return {
    type: "flex",
    altText: `🕒 ${title}`,
    contents: {
      type: "bubble",
      size: "mega",
      styles: {
        header: {
          backgroundColor: "#8b5cf6"
        },
        body: {
          backgroundColor: "#0f172a"
        }
      },
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "🕒 ประวัติสต็อกสินค้า (History)",
            weight: "bold",
            color: "#ffffff",
            size: "md"
          }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        contents: contents
      }
    }
  };
}

function formatStockSelectionFlex(searchQuery, matchingItems) {
  return {
    type: "flex",
    altText: "🔍 เลือกสินค้าที่ต้องการเช็คสต็อก",
    contents: {
      type: "bubble",
      size: "mega",
      styles: {
        header: {
          backgroundColor: "#f59e0b"
        },
        body: {
          backgroundColor: "#0f172a"
        }
      },
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "🔍 ยูซุพบสินค้าหลายรายการ",
            weight: "bold",
            color: "#ffffff",
            size: "md"
          },
          {
            type: "text",
            text: `ผลการค้นหาสำหรับ "${searchQuery}"`,
            color: "#94a3b8",
            size: "xs",
            margin: "xs"
          }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "ไม่แน่ใจว่าหมายถึงชิ้นไหน เลือกชิ้นที่ต้องการเช็คได้เลยค่ะ เมี๊ยว~",
            size: "xs",
            color: "#e2e8f0",
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
                color: "#1e293b",
                height: "sm",
                action: {
                  type: "postback",
                  label: item.name,
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
  const statusColor = isLow ? "#ef4444" : "#10b981";
  
  return {
    type: "flex",
    altText: `📦 เช็คสต็อก: ${item.name} มี ${item.current_quantity} ${item.unit}`,
    contents: {
      type: "bubble",
      size: "mega",
      styles: {
        header: {
          backgroundColor: isLow ? "#ef4444" : "#10b981"
        },
        body: {
          backgroundColor: "#0f172a"
        }
      },
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: `📦 ตรวจสอบสต็อก: ${item.name}`,
            weight: "bold",
            color: "#ffffff",
            size: "md"
          }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: "สถานะสต็อก",
                size: "xs",
                color: "#94a3b8",
                flex: 1
              },
              {
                type: "text",
                text: isLow ? "⚠️ สินค้าใกล้หมด" : "✅ ปกติ",
                size: "xs",
                color: statusColor,
                align: "end",
                weight: "bold",
                flex: 1
              }
            ]
          },
          {
            type: "separator",
            color: "#334155"
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: "จำนวนปัจจุบัน",
                size: "sm",
                color: "#f8fafc",
                weight: "bold",
                flex: 1
              },
              {
                type: "text",
                text: `${item.current_quantity} ${item.unit}`,
                align: "end",
                weight: "bold",
                size: "lg",
                color: statusColor,
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
                text: "จุดสั่งซื้อ (Min Reorder)",
                size: "xs",
                color: "#94a3b8",
                flex: 1
              },
              {
                type: "text",
                text: `${item.reorder_point || 0} ${item.unit}`,
                align: "end",
                size: "xs",
                color: "#94a3b8",
                flex: 1
              }
            ]
          }
        ]
      }
    }
  };
}

