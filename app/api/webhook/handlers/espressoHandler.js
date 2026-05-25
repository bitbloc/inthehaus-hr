import { analyzeEspressoShot } from '../../../../utils/gemini.js';
import { getEmployeeByLineId, saveMessage } from '../../../../utils/memory.js';

/**
 * Auto-detects if a text message is an espresso shot report
 */
export function isEspressoShotReport(text) {
  const lowerText = text.toLowerCase();
  
  // Regex to match typical extraction patterns like "18g", "35ml", "36s" or "36วินาที"
  const hasGrams = /\d+(\.\d+)?\s*(g|กรัม)/.test(lowerText);
  const hasVolume = /\d+(\.\d+)?\s*(ml|มล)/.test(lowerText);
  const hasSeconds = /\d+\s*(s|วิ|วินาที|จบ)/.test(lowerText);
  
  // Keywords indicating espresso shot metrics
  const hasCoffeeJargon = /ไหล|สกัด|ช็อต|shot|ครีม่า|crema|บด|แทมป์|tamp|หยด|หยดแรก/i.test(lowerText);

  let score = 0;
  if (hasGrams) score++;
  if (hasVolume) score++;
  if (hasSeconds) score++;
  if (hasCoffeeJargon) score++;

  // Must have at least 3 indicators, or grams + volume + seconds
  return score >= 3 || (hasGrams && hasVolume && hasSeconds);
}

/**
 * Translates status into beautiful Thai text and color
 */
function getStatusDisplay(status, defaultValue = '-') {
  switch (status) {
    case 'OK':
      return { text: '✅ ปกติ', color: '#1DB446' };
    case 'LOW':
      return { text: '⚠️ น้อยไป', color: '#ff9800' };
    case 'HIGH':
      return { text: '⚠️ เยอะไป', color: '#ff9800' };
    case 'FAST':
      return { text: '❌ ไหลเร็วไป', color: '#ef4444' };
    case 'SLOW':
      return { text: '❌ ไหลช้าไป', color: '#ef4444' };
    default:
      return { text: defaultValue, color: '#888888' };
  }
}

/**
 * Handles the analysis and sends the Flex Message to the group/user
 */
export async function handleEspressoShotAnalysis(event, client, rawText, userId, groupId) {
  try {
    const empData = await getEmployeeByLineId(userId);
    const friendlyName = empData ? (empData.nickname || empData.name) : 'บาริสต้า';
    
    // Call Gemini to parse and analyze the text
    const analysis = await analyzeEspressoShot(rawText, friendlyName);
    if (!analysis) return false;

    // Save the raw report and the AI response type to chat history for context
    await saveMessage(groupId, userId, 'user', rawText, 'espresso_report');
    
    // Generate Flex Message contents
    const doseDisplay = getStatusDisplay(analysis.dose?.status, 'ไม่ได้ระบุ');
    const yieldDisplay = getStatusDisplay(analysis.yield?.status, 'ไม่ได้ระบุ');
    const firstDropDisplay = getStatusDisplay(analysis.firstDrop?.status, 'ไม่ได้ระบุ');
    const totalTimeDisplay = getStatusDisplay(analysis.totalTime?.status, 'ไม่ได้ระบุ');

    // Build the grind adjustment message
    let grindStatusText = '-';
    let grindColor = '#888888';
    if (analysis.grindAdjustment) {
      if (analysis.isGrindAdjustmentCorrect === true) {
        grindStatusText = `✅ ${analysis.grindAdjustment} (ปรับถูกต้องค๊า!)`;
        grindColor = '#1DB446';
      } else if (analysis.isGrindAdjustmentCorrect === false) {
        grindStatusText = `❌ ${analysis.grindAdjustment} (ปรับผิดทิศทางนะคะ!)`;
        grindColor = '#ef4444';
      } else {
        grindStatusText = `⚙️ ${analysis.grindAdjustment}`;
        grindColor = '#007bff';
      }
    }

    // Determine overall header color based on totalTime status
    let headerColor = '#1DB446'; // Green by default
    if (analysis.totalTime?.status === 'SLOW' || analysis.totalTime?.status === 'FAST') {
      headerColor = '#ef4444'; // Red if out of spec
    } else if (analysis.dose?.status !== 'OK' || analysis.yield?.status !== 'OK') {
      headerColor = '#ff9800'; // Orange if warning
    }

    const flexMsg = {
      type: 'flex',
      altText: `☕ สรุปวิเคราะห์ช็อตกาแฟของ พี่${friendlyName}`,
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: headerColor,
          paddingAll: '15px',
          contents: [
            {
              type: 'text',
              text: '☕ Espresso Shot Analysis',
              color: '#ffffff',
              weight: 'bold',
              size: 'lg'
            },
            {
              type: 'text',
              text: `รายงานโดย: พี่${friendlyName} 🐾`,
              color: '#ffffffb3',
              size: 'xs',
              margin: 'xs'
            }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [
            // Row 1: Dose
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: 'ผงกาแฟ (Dose)', size: 'sm', color: '#555555', flex: 3 },
                { type: 'text', text: analysis.dose?.value ? `${analysis.dose.value} g` : '-', size: 'sm', weight: 'bold', flex: 2 },
                { type: 'text', text: doseDisplay.text, color: doseDisplay.color, size: 'sm', align: 'end', weight: 'bold', flex: 3 }
              ]
            },
            { type: 'separator', margin: 'xs' },
            // Row 2: Yield
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: 'น้ำกาแฟ (Yield)', size: 'sm', color: '#555555', flex: 3 },
                { type: 'text', text: analysis.yield?.value ? `${analysis.yield.value} ml` : '-', size: 'sm', weight: 'bold', flex: 2 },
                { type: 'text', text: yieldDisplay.text, color: yieldDisplay.color, size: 'sm', align: 'end', weight: 'bold', flex: 3 }
              ]
            },
            { type: 'separator', margin: 'xs' },
            // Row 3: First Drop
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: 'หยดแรก (First Drop)', size: 'sm', color: '#555555', flex: 3 },
                { type: 'text', text: analysis.firstDrop?.value ? `${analysis.firstDrop.value} วิ` : '-', size: 'sm', weight: 'bold', flex: 2 },
                { type: 'text', text: firstDropDisplay.text, color: firstDropDisplay.color, size: 'sm', align: 'end', weight: 'bold', flex: 3 }
              ]
            },
            { type: 'separator', margin: 'xs' },
            // Row 4: Total Time
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: 'เวลาสกัด (Total Time)', size: 'sm', color: '#555555', flex: 3 },
                { type: 'text', text: analysis.totalTime?.value ? `${analysis.totalTime.value} วิ` : '-', size: 'sm', weight: 'bold', flex: 2 },
                { type: 'text', text: totalTimeDisplay.text, color: totalTimeDisplay.color, size: 'sm', align: 'end', weight: 'bold', flex: 3 }
              ]
            },
            { type: 'separator', margin: 'md', color: '#dddddd' },
            
            // Taste Profile Section
            {
              type: 'box',
              layout: 'vertical',
              spacing: 'xs',
              contents: [
                { type: 'text', text: '👅 โทนรสชาติที่คาดเดาจากช็อตนี้:', size: 'xs', color: '#888888', weight: 'bold' },
                { type: 'text', text: analysis.tasteProfile || 'รสชาติสมดุลปกติ', size: 'sm', color: '#e11d48', weight: 'bold', wrap: true }
              ]
            },
            
            // Grind Adjustment Section
            {
              type: 'box',
              layout: 'vertical',
              margin: 'sm',
              spacing: 'xs',
              contents: [
                { type: 'text', text: '⚙️ การปรับเบอร์บด:', size: 'xs', color: '#888888', weight: 'bold' },
                { type: 'text', text: grindStatusText, size: 'sm', color: grindColor, weight: 'bold', wrap: true }
              ]
            },
            { type: 'separator', margin: 'md', color: '#dddddd' },
            
            // Recommendation Section
            {
              type: 'box',
              layout: 'vertical',
              spacing: 'xs',
              contents: [
                { type: 'text', text: '💡 คำแนะนำจากยูซุ:', size: 'xs', color: '#888888', weight: 'bold' },
                { type: 'text', text: analysis.recommendation, size: 'sm', color: '#333333', wrap: true, style: 'italic' }
              ]
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#f8f9fa',
          contents: [
            {
              type: 'text',
              text: 'Yuzu AI Barista Assistant 🍊🐱',
              size: 'xxs',
              align: 'center',
              color: '#aaaaaa'
            }
          ]
        }
      }
    };

    await client.replyMessage(event.replyToken, flexMsg);
    
    // Save Yuzu's recommendation to the history log
    await saveMessage(groupId, null, 'model', `[Espresso Analysis] ${analysis.recommendation}`, 'text');
    return true;
  } catch (error) {
    console.error("Espresso Handler Error:", error);
    return false;
  }
}
