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
      await client.replyMessage(event.replyToken, { type: 'text', text: 'ยูซุยินดีให้บริการครับ พิมพ์ "yuzu" หรือ "ยูซุ" ตามด้วยสิ่งที่คุณต้องการสอบถามหรือจัดการข้อมูลร้านได้เลยครับ' });
      return true;
    }

    // 0. Diagnostic Command
    if (text === 'yuzu who am i' || text === 'yuzu ใครคือฉัน') {
      const configs = await getYuzuConfigs();
      const { father_uid, mother_uid } = configs;
      
      const isFather = userId === father_uid;
      const isMother = userId === mother_uid;
      let identity = "ทีมงานทั่วไปครับ";
      if (isFather) identity = "พี่ฤ (บอสใหญ่) ครับ! 🙏";
      if (isMother) identity = "พี่แหม่ม (บอสใหญ่) ครับ! 🙏";
      
      await client.replyMessage(event.replyToken, { 
        type: 'text', 
        text: `คุณคือ: ${identity}\nUser ID: ${userId || 'ไม่พบ ID ครับ'}\n(ข้อมูลนี้ใช้เพื่อตรวจสอบสถานะบอสเท่านั้นนะครับ)` 
      });
      return true;
    }
    
    // 1. Image Generation
    if (text.startsWith('yuzu วาดรูป') || text.startsWith('yuzu generate image')) {
      const imagePrompt = query.replace('วาดรูป', '').trim();
      const result = await generateImage(imagePrompt);

      if (result.success && result.imageUrl) {
        await client.replyMessage(event.replyToken, [
          { type: 'text', text: `สร้างรูปภาพสำเร็จเรียบร้อยครับ นี่คือภาพ "${result.prompt}" ตามที่คุณระบุครับ` },
          { type: 'image', originalContentUrl: result.imageUrl, previewImageUrl: result.imageUrl }
        ]);
      } else {
        const errorMsg = typeof result === 'string' ? result : (result.message || "วาดไม่สำเร็จครับ");
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
        await client.replyMessage(event.replyToken, { type: 'text', text: 'ขออภัยครับ เกิดข้อผิดพลาดในระบบฐานข้อมูลระหว่างการดึงยอดโอนครับ' });
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
              replyText = `ยังไม่มีการบันทึกยอดโอนในระบบครับ`;
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
          replyText += `\n(พิมพ์ "yuzu export slips" เพื่อดาวน์โหลดรายงานสรุปยอดโอนครับ)`;
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
       await client.replyMessage(event.replyToken, { type: 'text', text: `📥 ดาวน์โหลดรายงานสรุปยอดโอนแบบ PDF ได้ที่ลิงก์นี้เลยครับ\n${rawUrl}` });
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
      const reportResponse = await getGeminiResponse(reportPrompt, "", [], userId);
      await client.replyMessage(event.replyToken, { type: 'text', text: reportResponse });
      return true;
    }

    const newsKeywords = ['ข่าว', 'อัปเดต', 'สรุป', 'ส่อง', 'ติดตาม', 'สถานการณ์'];
    const costKeywords = ['น้ำมัน', 'ไฟ', 'ต้นทุน', 'ราคาอาหาร', 'วัตถุดิบ'];
    
    const hasNewsKeyword = newsKeywords.some(kw => text.includes(kw));
    const hasCostKeyword = costKeywords.some(kw => text.includes(kw));
    
    const isNewsOrCostRequest = hasNewsKeyword || hasCostKeyword;
    const isNewsOnlyRequest = hasNewsKeyword && !hasCostKeyword;

    const dailyLogs = await getDailyContent(groupId);
    const history = await getChatHistory(groupId);

    let context = `คุณคือ ยูซุ (Yuzu) ผู้ช่วย AI ประจำร้าน In The Haus นครพนม ทำงานเป็นผู้ช่วยเจ้านายและพนักงาน ข้อมูลแวดล้อม:
- เวลาปัจจุบัน: ${format(addHours(new Date(), 7), 'yyyy-MM-dd HH:mm:ss')} (เวลาไทย)
ประเด็นเหตุการณ์ที่เกิดขึ้นในแชทกลุ่มวันนี้ (ใช้สำหรับอ้างอิงหรือแซวทีมงาน):
${dailyLogs || 'ไม่มีความเคลื่อนไหว'}
`;

    if (isNewsOnlyRequest) {
      console.log("Yuzu: Injecting News-Only Context (Minimal Feed)");
      context += await getAccurateNews() + "\n";
      
      context += `\n[INSTRUCTION: คุณกำลังสรุปข่าวเด่นประจำวันแบบ Minimal ที่สุดเพื่อรายงานเจ้านาย
      กรุณาตอบกลับโดยลิสต์รายการข่าวสารเด่นๆ ที่เกิดขึ้นในรอบ 24 ชั่วโมงจาก [CRITICAL_CONTEXT_DATA] เป็นข้อๆ ทีละบรรทัดอย่างกระชับที่สุด (ห้ามเกริ่นนำ ห้ามพูดคุยเวิ่นเว้อ ห้ามสรุปเป็นย่อหน้ายาวๆ และห้ามใส่เรื่องราคาน้ำมัน ค่าไฟ หรือวัตถุดิบเด็ดขาด)
      ใส่ Hashtag ที่น่าสนใจท้ายข่าวแต่ละหัวข้อด้วยภาษาพูดสไตล์แมวยูซุสั้นๆ กวนๆ เล็กน้อย
      
      **กฎเหล็กเรื่องความสดใหม่ของข่าว:**
      - ห้ามเอาข่าวเก่าในประวัติการแชท (เช่น พายุลูกเห็บถล่มเรณูนคร, จับยาเสพติดล็อตใหญ่) มาสรุปซ้ำเด็ดขาด!
      - ให้ใช้ข่าวใหม่ของวันนี้ที่อยู่ภายใน [CRITICAL_CONTEXT_DATA] เท่านั้น
      - หากไม่พบข่าวใหม่ในพื้นที่ ให้สรุปเฉพาะข่าวระดับประเทศล่าสุดจาก THE STANDARD ของวันนี้แทน ห้ามมโนข่าวเก่าขึ้นมา
      
      โปรดตอบกลับตามโครงสร้างนี้อย่างเคร่งครัด:
      [FLEX_TITLE]📰 ข่าวเด่นวันนี้โดยน้องยูซุ[/FLEX_TITLE]
      [FLEX_SUBTITLE]ด่วน/สรุปหัวข้อข่าวสารรอบวันเพื่อบอส[/FLEX_SUBTITLE]
      [FLEX_NEWS]
      • ข่าวสั้นที่ 1 #Hashtag
      • ข่าวสั้นที่ 2 #Hashtag
      • ข่าวสั้นที่ 3 #Hashtag
      [/FLEX_NEWS]
      
      ระวัง: ห้ามใส่ Tag FLEX_INDUSTRY, FLEX_COSTS หรือ FLEX_ADVICE ใดๆ เข้ามา และห้ามพิมพ์คำพูดใดๆ นอก Tag FLEX_TITLE, FLEX_SUBTITLE, FLEX_NEWS เด็ดขาด]`;
    } else if (isNewsOrCostRequest) {
      console.log("Yuzu: Injecting Latest News, Weather & Operating Costs Context for casual dining bistro");
      context += formatWeatherMessage(await getSchemaWeather()) + "\n";
      context += await getAccurateNews() + "\n";
      context += await getOilPrice() + "\n";
      context += await getElectricityPrice() + "\n";
      context += await getIngredientPrices() + "\n";
            
      context += `\n[INSTRUCTION: คุณกำลังสรุปข่าวเด่นและข้อมูลต้นทุนที่จำเป็นสำหรับร้านอาหารประเภท Casual Dining Bistro (In The Haus นครพนม) 
      กรุณาตอบกลับด้วยน้ำเสียงสุภาพ อบอุ่น ชัดเจน และตรงไปตรงมา สไตล์ผู้จัดการร้านสุดเนี๊ยบ โดยคุณต้องแบ่งข้อมูลออกเป็นหัวข้อหลักๆ และใช้ Tag ครอบไว้ทั้งหมดเพื่อระบบจะนำไปจัดข้อมูลแบบ Flex Message
      **ห้ามใส่ markdown สัญลักษณ์หนาเตอะอย่างพวกลูกสตาร์สองตัว (**) ใน Tag เป็นอันขาด**
      
      **กฎเหล็กเรื่องความสดใหม่ของข่าว:**
      - ห้ามเอาข่าวเก่าในประวัติการแชท (เช่น พายุลูกเห็บถล่มเรณูนคร, จับยาเสพติดล็อตใหญ่) มาสรุปซ้ำเด็ดขาด!
      - ให้ใช้ข่าวใหม่ของวันนี้ที่อยู่ภายใน [CRITICAL_CONTEXT_DATA] เท่านั้น
      - หากในข่าวหมวดหมู่ใดระบุว่า "ไม่พบข่าวล่าสุด" หรือไม่มีข่าวใหม่ของวันนี้ ให้แจ้งตรงๆ ว่า "ไม่มีข่าวอัปเดตในพื้นที่นครพนมวันนี้ครับ" หรือสลับไปดึงเฉพาะข่าวเด่นระดับประเทศล่าสุดจาก THE STANDARD ของวันนี้แทน ห้ามมโนข่าวเก่าขึ้นมาเป็นอันขาด
      
      โปรดตอบกลับตามโครงสร้างนี้อย่างเคร่งครัด:
      [FLEX_TITLE]รายงานสรุปสถานการณ์และข้อมูลประกอบการตัดสินใจประจำวัน[/FLEX_TITLE]
      [FLEX_SUBTITLE]รายงานเพื่อช่วยในการดำเนินงานสำหรับเจ้านายและพี่ๆ ทีมงาน[/FLEX_SUBTITLE]
      [FLEX_NEWS]สรุปข่าวเด่นนครพนมและภาคอีสานที่เกิดขึ้นช่วงนี้ (สั้นๆ กระชับ 2-3 บรรทัด)[/FLEX_NEWS]
      [FLEX_INDUSTRY]สรุปข่าวสาร/เทรนด์ธุรกิจและการแข่งขันในวงการร้านอาหารของไทยและแถบอีสาน (2-3 บรรทัด)[/FLEX_INDUSTRY]
      [FLEX_COSTS]สรุปสถานการณ์ต้นทุนปัจจุบัน: ราคาน้ำมัน (อ้างอิงค่ากลางและสถานีในนครพนม), ค่าไฟฟ้า (หน่วยละ 4.18 บาท), ราคาวัตถุดิบหลัก (ไข่ ไก่ หมู ข้าว) ที่ร้านอาหารต้องประเมิน (2-3 บรรทัด)[/FLEX_COSTS]
      [FLEX_ADVICE]คำแนะนำเชิงระบบจากผู้จัดการยูซุถึงร้าน In The Haus (เช่น การประหยัดไฟ การคำนวณวัตถุดิบ หรือการวางแผนขนส่ง)[/FLEX_ADVICE]
      
      ระวัง: ห้ามพิมพ์คำพูดใดๆ นอก Tag เหล่านี้เด็ดขาด เริ่มต้นที่ [FLEX_TITLE] และจบที่ [/FLEX_ADVICE] เสมอ]\n`;
    } else {
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
    }

    let filteredHistory = history;
    if (isNewsOrCostRequest) {
      filteredHistory = history.filter(msg => {
        const msgText = msg.parts?.[0]?.text || "";
        return !msgText.includes('[FLEX_TITLE]') && !msgText.includes('FLEX_NEWS') && !msgText.includes('สรุปข่าวและต้นทุน');
      });
    }

    let response = await getGeminiResponse(query, context, filteredHistory, userId);
    let cleanedResponse = response
      .split('[YUZU_LEARNING]')[0]
      .split('[ROSTER_ACTION]')[0]
      .split('[STOCK_ACTION]')[0]
      .split('[STOCK_AUDIT_FORM]')[0]
      .split('[YUZU_MEME]')[0]
      .trim();

    const replyMessages = [];
    if (isNewsOrCostRequest) {
      try {
        const parsedData = parseFlexResponse(cleanedResponse);
        const flexMsg = formatNewsFlex(parsedData, cleanedResponse.substring(0, 5000));
        replyMessages.push(flexMsg);
      } catch (flexErr) {
        console.error("News Flex creation error:", flexErr);
        replyMessages.push({ type: 'text', text: cleanedResponse.substring(0, 5000) });
      }
    } else {
      replyMessages.push({ type: 'text', text: cleanedResponse });
    }

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
                { type: 'text', text: 'ROSTER CHANGE PROPOSAL', color: '#1c1c1c', weight: 'bold', size: 'sm' },
                { type: 'text', text: `CLASSIFICATION: ${isBossUser ? 'DIRECTIVE (BOSS)' : 'PROPOSAL'}`, color: '#1c1c1c', weight: 'bold', size: 'xxs', margin: 'xs' }
              ]
            },
            body: {
              type: 'box',
              layout: 'vertical',
              paddingAll: '20px',
              contents: [
                { type: 'text', text: summaryText, wrap: true, size: 'sm', color: '#1c1c1c' },
                { type: 'text', text: isBossUser ? 'PLEASE REVIEW THE PROPOSAL DETAILS BEFORE EXECUTING UPDATE.' : 'PLEASE CONFIRM THAT THE INFORMATION ABOVE IS ACCURATE TO SUBMIT FOR REVIEW.', margin: 'md', size: 'xxs', color: '#888888', wrap: true }
              ]
            },
            footer: {
              type: 'box',
              layout: 'horizontal',
              paddingAll: '15px',
              spacing: 'sm',
              contents: [
                { type: 'button', style: 'primary', color: '#1c1c1c', action: { type: 'postback', label: isBossUser ? 'EXECUTE UPDATE' : 'CONFIRM SUBMISSION', data: `action=confirm_roster&payload=${Buffer.from(JSON.stringify(actionData)).toString('base64')}` } },
                { type: 'button', style: 'secondary', action: { type: 'postback', label: 'CANCEL', data: 'action=cancel_roster' } }
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
                { type: 'text', text: 'KNOWLEDGE PROTOCOL DETECTED', color: '#1c1c1c', weight: 'bold', size: 'sm' },
                { type: 'text', text: 'STATUS: PENDING MANAGER REVIEW', color: '#ef6c00', size: 'xxs', weight: 'bold', margin: 'xs' }
              ]
            },
            body: {
              type: 'box',
              layout: 'vertical',
              paddingAll: '20px',
              spacing: 'md',
              contents: [
                { type: 'text', text: savedFact.content, wrap: true, size: 'xs', color: '#1c1c1c' },
                { type: 'box', layout: 'vertical', spacing: 'xs', contents: [
                  { type: 'text', text: 'KEYWORDS', size: 'xxs', color: '#888888', weight: 'bold' },
                  { type: 'text', text: (savedFact.metadata?.keywords || []).map(kw => `[${kw.toUpperCase()}]`).join(' '), size: 'xxs', color: '#3b82f6', wrap: true }
                ]}
              ]
            },
            footer: {
              type: 'box',
              layout: 'horizontal',
              paddingAll: '15px',
              spacing: 'sm',
              contents: [
                { type: 'button', style: 'primary', color: '#1c1c1c', action: { type: 'postback', label: 'APPROVE', data: `action=approve_insight&id=${savedFact.id}` } },
                { type: 'button', style: 'secondary', action: { type: 'postback', label: 'DISMISS', data: `action=reject_insight&id=${savedFact.id}` } }
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
      await client.replyMessage(event.replyToken, { type: 'text', text: 'ขออภัยครับ สิทธิ์ในการอนุมัติข้อมูลความรู้จำกัดเฉพาะผู้บริหาร (บอส) เท่านั้นครับ' });
      return true;
    }

    const { error } = await supabase
      .from('yuzu_knowledge')
      .update({ metadata: { status: 'verified', verified_at: new Date().toISOString() } })
      .eq('id', insightId);

    if (!error) {
      await client.replyMessage(event.replyToken, { type: 'text', text: '✅ บันทึกความรู้ดังกล่าวเข้าสู่ระบบคลังความรู้หลักของร้านเรียบร้อยแล้วครับบอส' });
    } else {
       await client.replyMessage(event.replyToken, { type: 'text', text: 'ไม่สามารถบันทึกข้อมูลเข้าระบบคลังความรู้หลักได้เนื่องจาก: ' + error.message });
    }
    return true;
  }

  if (action === 'reject_insight') {
    const insightId = queryParams.get('id');
    const isBoss = await checkIsBoss(userId);

    if (!isBoss) {
      await client.replyMessage(event.replyToken, { type: 'text', text: 'ขออภัยครับ สิทธิ์ในการลบหรือปฏิเสธชุดความรู้จำกัดเฉพาะผู้บริหาร (บอส) เท่านั้นครับ' });
      return true;
    }

    const { error } = await supabase.from('yuzu_knowledge').delete().eq('id', insightId);
    if (!error) {
      await client.replyMessage(event.replyToken, { type: 'text', text: '🗑️ ลบข้อมูลดังกล่าวออกจากระบบเป็นที่เรียบร้อยตามคำสั่งครับ' });
    }
    return true;
  }

  return false;
}

function parseFlexResponse(response) {
  const extract = (tag) => {
    const regex = new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[\\/${tag}\\]`);
    const match = response.match(regex);
    return match ? match[1].trim() : null;
  };

  return {
    title: extract('FLEX_TITLE'),
    subtitle: extract('FLEX_SUBTITLE'),
    news: extract('FLEX_NEWS'),
    industry: extract('FLEX_INDUSTRY'),
    costs: extract('FLEX_COSTS'),
    advice: extract('FLEX_ADVICE')
  };
}

function formatNewsFlex(data, rawFallbackText) {
  const isStructured = data && (data.news || data.costs || data.industry);

  if (isStructured) {
    const contents = {
      type: "bubble",
      size: "mega",
      styles: {
        header: { backgroundColor: "#181818" },
        body: { backgroundColor: "#181818" }
      },
      header: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        contents: [
          {
            type: "text",
            text: "DAILY INTELLIGENCE REPORT // OPERATIONS",
            weight: "bold",
            color: "#ffffff",
            size: "sm"
          },
          {
            type: "text",
            text: "DATA SOURCE: IN THE HAUS INTEL SERVICE",
            color: "#888888",
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
        contents: []
      }
    };

    if (data.news) {
      contents.body.contents.push({
        type: "box",
        layout: "vertical",
        spacing: "xs",
        contents: [
          { type: "text", text: "01 NEWS FEED", weight: "bold", size: "xs", color: "#ffffff" },
          { type: "text", text: data.news, size: "xs", color: "#c5c5c5", wrap: true }
        ]
      });
    }

    if (data.industry) {
      if (contents.body.contents.length > 0) {
        contents.body.contents.push({ type: "separator", color: "#333333" });
      }
      contents.body.contents.push({
        type: "box",
        layout: "vertical",
        spacing: "xs",
        contents: [
          { type: "text", text: "02 INDUSTRY TRENDS", weight: "bold", size: "xs", color: "#ffffff" },
          { type: "text", text: data.industry, size: "xs", color: "#c5c5c5", wrap: true }
        ]
      });
    }

    if (data.costs) {
      if (contents.body.contents.length > 0) {
        contents.body.contents.push({ type: "separator", color: "#333333" });
      }
      contents.body.contents.push({
        type: "box",
        layout: "vertical",
        spacing: "xs",
        contents: [
          { type: "text", text: "03 OPERATING COSTS", weight: "bold", size: "xs", color: "#ffffff" },
          { type: "text", text: data.costs, size: "xs", color: "#c5c5c5", wrap: true }
        ]
      });
    }

    if (data.advice) {
      if (contents.body.contents.length > 0) {
        contents.body.contents.push({ type: "separator", color: "#333333" });
      }
      contents.body.contents.push({
        type: "box",
        layout: "vertical",
        spacing: "xs",
        contents: [
          { type: "text", text: "04 STRATEGIC ADVICE", weight: "bold", size: "xs", color: "#ffffff" },
          { type: "text", text: data.advice, size: "xs", color: "#c5c5c5", wrap: true }
        ]
      });
    }

    return {
      type: "flex",
      altText: `สรุปข่าวสาร & ต้นทุนโดย Yuzu`,
      contents: contents
    };
  } else {
    return {
      type: "flex",
      altText: `สรุปข่าวสาร & ต้นทุนโดย Yuzu`,
      contents: {
        type: "bubble",
        size: "mega",
        styles: {
          header: { backgroundColor: "#181818" },
          body: { backgroundColor: "#181818" }
        },
        header: {
          type: "box",
          layout: "vertical",
          paddingAll: "20px",
          contents: [
            {
              type: "text",
              text: "DAILY INTELLIGENCE REPORT // OPERATIONS",
              weight: "bold",
              color: "#ffffff",
              size: "sm"
            }
          ]
        },
        body: {
          type: "box",
          layout: "vertical",
          paddingAll: "20px",
          contents: [
            {
              type: "text",
              text: rawFallbackText,
              size: "xs",
              color: "#c5c5c5",
              wrap: true
            }
          ]
        }
      }
    };
  }
}
