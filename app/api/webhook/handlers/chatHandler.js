import { format, addHours, subDays } from 'date-fns';
import { getGeminiResponse, getDailySummary, generateImage } from '../../../../utils/gemini';
import { getGoldPrice, getOilPrice, getElectricityPrice, getIngredientPrices } from '../../../../utils/price';
import { getPriceComparison } from '../../../../utils/price_scraper';
import { getSchemaWeather, formatWeatherMessage, getCompactWeather } from '../../../../utils/weather';
import { getAccurateNews } from '../../../../utils/news';
import { saveMessage, getChatHistory, getDailyContent, saveLearnedFact, getEmployeeByLineId, getAllEmployeesData, getYuzuConfigs, checkIsBoss } from '../../../../utils/memory';
import { supabase } from '../../../../lib/supabaseClient';

export async function handleChatCommand(event, client, text, rawText, userId, groupId, request) {
  if (text.startsWith('yuzu') || text.startsWith('ยูซุ')) {
    const query = text.startsWith('yuzu') ? rawText.slice(4).trim() : rawText.slice(4).trim();
    if (!query) {
      await client.replyMessage(event.replyToken, { type: 'text', text: 'ยูซุยินดีให้บริการครับ พิมพ์ "yuzu" หรือ "ยูซุ" ตามด้วยสิ่งที่คุณอยากรู้ได้เลยครับ เมี๊ยว~' });
      return true;
    }

    // 0. Diagnostic Command
    if (text === 'yuzu who am i' || text === 'yuzu ใครคือฉัน') {
      const configs = await getYuzuConfigs();
      const { father_uid, mother_uid } = configs;
      
      const isFather = userId === father_uid;
      const isMother = userId === mother_uid;
      let identity = "ทีมงานทั่วไปค่ะ";
      if (isFather) identity = "คุณพ่อ (บอสใหญ่) ค่ะ! 🙏";
      if (isMother) identity = "คุณแม่ (บอสใหญ่) ค่ะ! 🙏";
      
      await client.replyMessage(event.replyToken, { 
        type: 'text', 
        text: `คุณคือ: ${identity}\nUser ID: ${userId || 'ไม่พบ ID ค่ะ'}\n(ข้อมูลนี้ใช้เพื่อตรวจสอบสถานะบอสเท่านั้นนะคะ เมี๊ยว~)` 
      });
      return true;
    }
    
    // 1. Image Generation
    if (text.startsWith('yuzu วาดรูป') || text.startsWith('yuzu generate image')) {
      const imagePrompt = query.replace('วาดรูป', '').trim();
      const result = await generateImage(imagePrompt);

      if (result.success && result.imageUrl) {
        await client.replyMessage(event.replyToken, [
          { type: 'text', text: `วาดเสร็จแล้วค๊าาา! นี่คือภาพ "${result.prompt}" สไตล์น้องยูซุนะคะ เมี๊ยว~` },
          { type: 'image', originalContentUrl: result.imageUrl, previewImageUrl: result.imageUrl }
        ]);
      } else {
        const errorMsg = typeof result === 'string' ? result : (result.message || "วาดไม่สำเร็จค่ะ");
        await client.replyMessage(event.replyToken, { type: 'text', text: errorMsg });
      }
      return true;
    }

    // 2. Daily Summary
    if (text === 'สรุปประจำวัน' || text === 'summary') {
      console.log("Yuzu: Daily Summary Requested");
      const content = await getDailyContent(groupId);
      const summary = await getDailySummary(content);
      await client.replyMessage(event.replyToken, { type: 'text', text: summary });
      return true;
    }

    // 2.1 Slip Summary & Export
    const isSlipSummary = text.includes('สรุปยอดโอน') || text.includes('ยอดโอนล่าสุด');
    if (isSlipSummary) {
      console.log("Yuzu: Slip Summary Requested");
      let targetDateStr = null;
      let isLatest = false;
      let dateTitle = "วันนี้";
      const bkkNow = addHours(new Date(), 7);

      if (text.includes('เมื่อวาน')) {
          targetDateStr = format(subDays(bkkNow, 1), 'yyyy-MM-dd');
          dateTitle = "เมื่อวานนี้";
      } else if (text.includes('ล่าสุด')) {
          isLatest = true;
          dateTitle = "ล่าสุด";
      } else {
          const dateRegex = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/;
          const match = text.match(dateRegex);
          if (match) {
              let [_, d, m, y] = match;
              if (y.length === 4 && parseInt(y) > 2500) y = (parseInt(y) - 543).toString();
              targetDateStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
              dateTitle = `วันที่ ${d}/${m}/${y}`;
          } else {
              targetDateStr = format(bkkNow, 'yyyy-MM-dd');
          }
      }
      
      let dbQuery = supabase.from('slip_transactions').select('amount, user_id, timestamp').eq('is_deleted', false);
      if (isLatest) {
          dbQuery = dbQuery.order('timestamp', { ascending: false }).limit(1);
      } else {
          dbQuery = dbQuery.eq('date', targetDateStr);
      }

      const { data: slips, error } = await dbQuery;
      if (error) {
        await client.replyMessage(event.replyToken, { type: 'text', text: 'เมี๊ยว~ เกิดข้อผิดพลาดในการดึงยอดโอนค่ะ' });
        return true;
      }

      let total = 0;
      let count = slips.length;
      slips.forEach(s => total += Number(s.amount));
      
      let replyText = `📊 สรุปยอดโอน ${dateTitle}\n\n`;
      if (isLatest) {
          if (count > 0) {
              replyText = `💸 ยอดโอนล่าสุด:\n\nจำนวนเงิน: ${Number(slips[0].amount).toLocaleString('th-TH', {minimumFractionDigits: 2})} บาท\nเวลา: ${format(addHours(new Date(slips[0].timestamp), 7), 'HH:mm:ss น.')}`;
          } else {
              replyText = `เมี๊ยว~ ยังไม่มียอดโอนเลยค่ะ`;
          }
      } else {
          replyText += `✅ จำนวนสลิป: ${count} รายการ\n`;
          replyText += `💰 ยอดรวมทั้งหมด: ${total.toLocaleString('th-TH', {minimumFractionDigits: 2})} บาท\n\n`;
          replyText += `⏰ รายละเอียดเวลาโอน:\n`;
          
          const sortedSlips = [...slips].sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
          sortedSlips.forEach((s) => {
              const timeStr = format(addHours(new Date(s.timestamp), 7), 'HH:mm');
              replyText += `- เวลา ${timeStr} น. : ${Number(s.amount).toLocaleString('th-TH', {minimumFractionDigits: 2})} บาท\n`;
          });
          replyText += `\n(พิมพ์ "yuzu export slips" เพื่อดาวน์โหลด Excel ค่ะ)`;
      }

      const wantsImage = (text.includes('ภาพ') || text.includes('รูป')) && !text.includes('ไม่ต้อง') && !text.includes('ไม่เอา');
      if (wantsImage && count > 0 && !isLatest) {
        const prompt = `Premium minimalist graphic design summary for "In The Haus" restaurant. White background, bold black typography, high contrast. Large numbers for "สรุปยอดโอนรวม ${total.toLocaleString('th-TH', {minimumFractionDigits: 0})} บาท". Simple clean list of transaction times. Stylized brand name "In The Haus" in script or elegant font. No cats, no 3D, no colorful backgrounds. Professional report aesthetic.`;
        const genResult = await generateImage(prompt);
        if (genResult.success && genResult.imageUrl) {
           await client.replyMessage(event.replyToken, [
             { type: 'text', text: replyText },
             { type: 'image', originalContentUrl: genResult.imageUrl, previewImageUrl: genResult.imageUrl }
           ]);
        } else {
           await client.replyMessage(event.replyToken, { type: 'text', text: replyText });
        }
      } else {
        await client.replyMessage(event.replyToken, { type: 'text', text: replyText });
      }
      return true;
    }

    if (text === 'yuzu export slips' || text === 'export slips') {
       const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://inthehaus-hr.vercel.app';
       const rawUrl = `${baseUrl}/admin/yuzu/slips/report`;
       await client.replyMessage(event.replyToken, { type: 'text', text: `📥 ดาวน์โหลดรายงานสรุปยอดโอนแบบ PDF สวยๆ ได้ที่ลิงก์นี้เลยค่ะ เมี๊ยว~\n${rawUrl}` });
       return true;
    }

    // 2.5 Employee Performance Report
    if (text.includes('รายงานพนักงาน') || text.includes('ประเมินผล')) {
      console.log("Yuzu: Employee Report Requested");
      const dailyLogs = await getDailyContent(groupId);
      const allEmployees = await getAllEmployeesData();
      
      let contextContent = `\nรายชื่อพนักงานทั้งหมดในระบบตอนนี้ (ทำ mapping UID -> ชื่อ ให้ตรวจสอบ):\n`;
      if (allEmployees && allEmployees.length > 0) {
         allEmployees.forEach(emp => {
           const empName = emp.nickname || emp.name;
           const uid1 = emp.line_user_id || 'ไม่มี';
           const uid2 = emp.line_bot_id || 'ไม่มี';
           contextContent += `- Bot UID: ${uid2} | LIFF UID: ${uid1} | ชื่อ: ${empName} | ตำแหน่ง: ${emp.position}\n`;
         });
         contextContent += `(จบรายชื่อพนักงาน)\n\n`;
      }
      
      const reportPrompt = `ช่วยสรุปรายงานพฤติกรรมและการทำงานของพนักงานจากข้อมูลที่มีหน่อยค่ะ ยึดตามรายชื่อพนักงานที่มีในระบบต่อไปนี้:\n${contextContent}\nและนี่คือประวัติการแชท/ทำงานของวันนี้:\n${dailyLogs || "(วันนี้ยังไม่มีประวัติการแชทให้วิเคราะห์)"}\n\nโปรดเน้นวิเคราะห์แต่ละคนตามรายชื่อที่มี และรายงานความพร้อมให้เจ้านายฟัง (ถ้าประวัติแชทว่างก็บอกสถานะของรายชื่อบุคคลไปก่อน)`;
      const report = await getGeminiResponse(reportPrompt, "คุณกำลังทำรายงานประเมินผลพนักงานให้เจ้าของร้าน โปรดวิเคราะห์อย่างละเอียดและเป็นกลาง (แต่ยังคงสไตล์ยูซุปากแซ่บ)", [], userId);
      await client.replyMessage(event.replyToken, { type: 'text', text: report });
      return true;
    }

    // 3. Standard Yuzu Chat with Memory
    const history = await getChatHistory(groupId, 100);
    let context = "";
    
    // Injected dynamic context:
    const allEmployees = await getAllEmployeesData();
    if (allEmployees && allEmployees.length > 0) {
      context += `[OFFICIAL_STAFF_ROSTER_START - ยึดถือข้อมูลนี้เป็นความจริงสูงสุด ห้ามเดาหรือเปลี่ยนตำแหน่งเอง]\n`;
      allEmployees.forEach(emp => {
        const displayName = emp.nickname || emp.name;
        const altName = (emp.nickname && emp.name && emp.nickname !== emp.name) ? ` (ชื่อจริง: ${emp.name})` : '';
        const position = emp.position || 'ทีมงาน';
        const lineId = emp.line_bot_id || emp.line_user_id || 'unlinked';
        
        context += `- พนักงาน: ${displayName}${altName} | ตำแหน่ง: ${position} | LINE_UID: ${lineId}\n`;
      });
      context += `[OFFICIAL_STAFF_ROSTER_END]\n\n`;
    }

    const employee = await getEmployeeByLineId(userId);
    const isBoss = await checkIsBoss(userId);
    
    if (isBoss) {
      context += `คุณกำลังคุยกับ: เจ้านาย (${employee?.nickname || employee?.name || 'Owner'})\n`;
      context += `สถานะ: เจ้าของร้าน (Owner)\n`;
    } else if (employee) {
      context += `คุณกำลังคุยกับ: ${employee.nickname || employee.name} (${employee.position})\n`;
      context += `สถานะพนักงาน: ${employee.employment_status || 'Fulltime'}\n`;
    } else {
      context += `(ไม่พบข้อมูลพนักงานในระบบสำหรับ LINE ID นี้: ${userId})\n`;
    }

    const compactWeather = await getCompactWeather();
    if (compactWeather) context += `${compactWeather}\n`;

    const dailyLogs = await getDailyContent(groupId);
    if (dailyLogs) context += `\nเหตุการณ์ที่เกิดขึ้นในแชทกลุ่มวันนี้ (ใช้สำหรับอ้างอิงหรือแซวทีมงาน):\n${dailyLogs}\n`;
    if (text.includes('ทอง')) context += await getGoldPrice() + "\n";
    if (text.includes('น้ำมัน')) context += await getOilPrice() + "\n";
    if (text.includes('ไฟ')) context += await getElectricityPrice() + "\n";
    
    const ingredientKeywords = ['วัตถุดิบ', 'ราคาอาหาร', 'หมู', 'ไก่', 'เนื้อ', 'ปลา', 'ไข่', 'ผัก', 'ผลไม้', 'ข้าว'];
    if (ingredientKeywords.some(kw => text.includes(kw))) {
       if (text.includes('ขึ้น') || text.includes('ลง') || text.includes('ไหม') || text.includes('เปรียบเทียบ')) {
          context += await getPriceComparison() + "\n";
       } else {
          context += await getIngredientPrices() + "\n";
       }
    }
    if (text.includes('อากาศ')) context += formatWeatherMessage(await getSchemaWeather()) + "\n";
    
    const newsKeywords = ['ข่าว', 'อัปเดต', 'สรุป', 'ส่อง', 'ติดตาม', 'สถานการณ์'];
    if (newsKeywords.some(kw => text.includes(kw))) {
      console.log("Yuzu: Injecting Latest News Context");
      context += await getAccurateNews() + "\n";
    }

    let response = await getGeminiResponse(query, context, history, userId);
    let cleanedResponse = response
      .split('[YUZU_LEARNING]')[0]
      .split('[ROSTER_ACTION]')[0]
      .split('[STOCK_ACTION]')[0]
      .split('[STOCK_AUDIT_FORM]')[0]
      .split('[YUZU_MEME]')[0]
      .trim();

    const replyMessages = [{ type: 'text', text: cleanedResponse }];

    // 1. Meme generation check
    if (response.includes('[YUZU_MEME]')) {
      try {
        const memePart = response.split('[YUZU_MEME]')[1].trim();
        const jsonMatch = memePart.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
           const memeData = JSON.parse(jsonMatch[0]);
           if (memeData.prompt) {
             const result = await generateImage(memeData.prompt);
             if (result.success && result.imageUrl) {
               replyMessages.push({
                 type: 'image',
                 originalContentUrl: result.imageUrl,
                 previewImageUrl: result.imageUrl
               });
             }
           }
        }
      } catch (e) {
        console.error("Meme Generation Error:", e);
      }
    }

    // 2. Delegate stock tags handling
    const { handleStockResponseTags } = await import('./stockHandler');
    const stockMsg = await handleStockResponseTags(response, request, query);
    if (stockMsg) {
      if (Array.isArray(stockMsg)) {
        replyMessages.push(...stockMsg);
      } else {
        replyMessages.push(stockMsg);
      }
    }
    
    // 3. Roster Actions
    if (response.includes('[ROSTER_ACTION]')) {
      try {
        const rosterPart = response.split('[ROSTER_ACTION]')[1].trim();
        const actionData = JSON.parse(rosterPart);

        const hasPlaceholders = 
          actionData.employee_name === 'WAITING_FOR_NAME' || 
          actionData.date === 'YYYY-MM-DD' || 
          !actionData.type;

        if (!hasPlaceholders) {
          const isBossUser = await checkIsBoss(userId);
          
          let summaryText = "";
          if (actionData.type === 'LEAVE') summaryText = `ขอลาหยุด: ${actionData.employee_name}\nวันที่: ${actionData.date}\nเหตุผล: ${actionData.reason || '-'}`;
          else if (actionData.type === 'SWAP') summaryText = `ขอสลับกะ: ${actionData.from} ↔️ ${actionData.to}\nวันที่: ${actionData.date}`;
          else if (actionData.type === 'CHANGE') summaryText = `ขอปรับกะงาน: ${actionData.employee_name}\nวันที่: ${actionData.date}\nรายละเอียด: ${actionData.details?.note || '-'}`;

          const confirmFlex = {
            type: 'bubble',
            header: { type: 'box', layout: 'vertical', backgroundColor: isBossUser ? '#ffc107' : '#007bff', contents: [{ type: 'text', text: isBossUser ? '👑 บอสสั่งแก้ตารางกะ!' : '📝 ยืนยันข้อมูลตารางงาน', color: isBossUser ? '#000000' : '#ffffff', weight: 'bold' }] },
            body: {
              type: 'box', layout: 'vertical', contents: [
                { type: 'text', text: summaryText, wrap: true, size: 'sm' },
                { type: 'text', text: isBossUser ? 'ข้อมูลเป๊ะไหมคะบอส? กดอัปเดตเพื่อเปลี่ยนกะทันทีเงียบๆ ค่ะ เมี๊ยว~' : 'ข้อมูลถูกต้องไหมคะ? ถ้าใช่รบกวนกดยืนยันเพื่อส่งเรื่องให้บอสพิจารณาน้ำตาซึมค่ะ เมี๊ยว~', margin: 'md', size: 'xs', color: '#aaaaaa', wrap: true }
              ]
            },
            footer: {
              type: 'box', layout: 'horizontal', spacing: 'sm',
              contents: [
                { type: 'button', style: 'primary', color: '#06c755', action: { type: 'postback', label: isBossUser ? '✅ ยืนยัน/อัปเดต' : '✅ ถูกต้อง', data: `action=confirm_roster&payload=${Buffer.from(JSON.stringify(actionData)).toString('base64')}` } },
                { type: 'button', style: 'secondary', action: { type: 'postback', label: '❌ ยกเลิก', data: 'action=cancel_roster' } }
              ]
            }
          };

          replyMessages.push({ type: 'flex', altText: isBossUser ? '👑 บอสสั่งแก้ตาราง' : '📝 ยืนยันข้อมูลตารางงาน', contents: confirmFlex });
        }
      } catch (e) {
        console.error("Roster Action Error in chatHandler:", e);
      }
    }

    // 4. Learning Fact check
    if (response.includes('[YUZU_LEARNING]')) {
      try {
        const parts = response.split('[YUZU_LEARNING]');
        const learningJson = parts[1].trim();
        const factData = JSON.parse(learningJson);
        const savedFact = await saveLearnedFact(groupId, factData);
        
        if (savedFact) {
          console.log("Yuzu Learned a New Fact:", savedFact.content);
          const insightFlex = {
            type: 'bubble',
            size: 'kilo',
            header: { type: 'box', layout: 'vertical', backgroundColor: '#9333ea', contents: [{ type: 'text', text: '💡 พบความรู้ใหม่แว่วมาจากแชท', color: '#ffffff', weight: 'bold', size: 'sm' }] },
            body: {
              type: 'box', layout: 'vertical', spacing: 'md', contents: [
                { type: 'text', text: savedFact.content, wrap: true, size: 'sm', weight: 'medium', color: '#333333' },
                { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
                  { type: 'text', text: 'Keywords:', size: 'xxs', color: '#aaaaaa', flex: 0 },
                  { type: 'text', text: (savedFact.metadata?.keywords || []).join(', '), size: 'xxs', color: '#6366f1', flex: 1, wrap: true }
                ]}
              ]
            },
            footer: {
              type: 'box', layout: 'horizontal', spacing: 'sm',
              contents: [
                { type: 'button', style: 'primary', color: '#10b981', action: { type: 'postback', label: '✅ อนุมัติ', data: `action=approve_insight&id=${savedFact.id}` } },
                { type: 'button', style: 'secondary', color: '#f43f5e', action: { type: 'postback', label: '❌ ลบออก', data: `action=reject_insight&id=${savedFact.id}` } }
              ]
            }
          };
          replyMessages.push({ type: 'flex', altText: '💡 ยูซุพบความรู้ใหม่ที่ต้องอนุมัติค่ะ!', contents: insightFlex });
        }
      } catch (e) {
        console.error("Error parsing Yuzu Learning block:", e);
      }
    }

    const isMoodBooster = ['ชม', 'ขอบคุณ', 'ขอบใจ', 'ดีมาก', 'เก่ง'].some(kw => query.includes(kw));
    const messageType = isMoodBooster ? 'mood_booster' : 'text';
    
    await saveMessage(groupId, userId, 'user', query, messageType);
    await saveMessage(groupId, null, 'model', cleanedResponse, 'text');

    const slicedMessages = replyMessages.slice(0, 5);
    await client.replyMessage(event.replyToken, slicedMessages);

    return true;
  }
  return false;
}

export async function handleChatPostback(event, client, action, queryParams, userId) {
  if (action === 'approve_insight') {
    const insightId = queryParams.get('id');
    const isBoss = await checkIsBoss(userId);

    if (!isBoss) {
      await client.replyMessage(event.replyToken, { type: 'text', text: 'เมี๊ยว~ เฉพาะบอสเท่านั้นที่อนุมัติความรู้ได้นะคะ! 🐾' });
      return true;
    }

    const { error } = await supabase
      .from('yuzu_knowledge')
      .update({ metadata: { status: 'verified', verified_at: new Date().toISOString() } })
      .eq('id', insightId);

    if (!error) {
      await client.replyMessage(event.replyToken, { type: 'text', text: '✅ บันทึกความรู้เข้าคลังหลักเรียบร้อยค่ะ~ บอสนี่ตาถึงจริงๆ! ✨' });
    } else {
       await client.replyMessage(event.replyToken, { type: 'text', text: 'เเมี๊ยว~ บันทึกไม่สำเร็จค่ะ: ' + error.message });
    }
    return true;
  }

  if (action === 'reject_insight') {
    const insightId = queryParams.get('id');
    const isBoss = await checkIsBoss(userId);

    if (!isBoss) {
      await client.replyMessage(event.replyToken, { type: 'text', text: 'เมี๊ยว~ เฉพาะบอสเท่านั้นที่สั่งลบได้นะคะ! 🐾' });
      return true;
    }

    const { error } = await supabase.from('yuzu_knowledge').delete().eq('id', insightId);
    if (!error) {
      await client.replyMessage(event.replyToken, { type: 'text', text: '🗑️ ลืมข้อมูลนี้เรียบร้อยค่ะ! ยูซุก็ว่าแล้วว่ามันแปลกๆ เมี๊ยว~' });
    }
    return true;
  }

  return false;
}
