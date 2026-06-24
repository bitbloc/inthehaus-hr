import { analyzeEspressoShot } from '../../../../utils/gemini.js';
import { getEmployeeByLineId, saveMessage } from '../../../../utils/memory.js';

/**
 * Auto-detects if a text message is an espresso shot report
 */
export function isEspressoShotReport(text) {
  const lowerText = text.toLowerCase();
  
  // Regex to match typical extraction patterns like "18g", "35ml", "36s" or "36วินาที"
  const hasGrams = /\d+(\.\d+)?\s*(g|กรัม)/.test(lowerText);
  
  // Volume/Yield (either ml/มล or a second weight measure in grams)
  const weightMatches = lowerText.match(/\d+(\.\d+)?\s*(g|กรัม)/g) || [];
  const hasVolume = /\d+(\.\d+)?\s*(ml|มล|มิลลิลิตร)/.test(lowerText) || weightMatches.length >= 2;
  
  // Seconds/Time (e.g. "19วิ", "19 วินาที", "วินาทีที่ 19", "วิที่ 19", "จบที่ 19", "25s", "ไหลวิที่ 4")
  const hasSeconds = /\d+\s*(s|วิ|วินาที|จบ)/.test(lowerText) || 
                     /วินาทีที่\s*\d+/.test(lowerText) || 
                     /วิที่\s*\d+/.test(lowerText) || 
                     /จบที่\s*\d+/.test(lowerText);
  
  // Keywords indicating espresso shot metrics
  const hasCoffeeJargon = /ไหล|สกัด|ช็อต|shot|ครีม่า|crema|บด|แทมป์|tamp|หยด|หยดแรก|ตวง|ดริป|กาแฟ/i.test(lowerText);

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
      return { text: 'ปกติ', color: '#2e7d32' };
    case 'LOW':
      return { text: 'ต่ำกว่าเกณฑ์', color: '#ef6c00' };
    case 'HIGH':
      return { text: 'สูงกว่าเกณฑ์', color: '#ef6c00' };
    case 'FAST':
      return { text: 'ไหลเร็วเกินไป', color: '#c62828' };
    case 'SLOW':
      return { text: 'ไหลช้าเกินไป', color: '#c62828' };
    default:
      return { text: defaultValue, color: '#666666' };
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
    let grindColor = '#666666';
    if (analysis.grindAdjustment) {
      if (analysis.isGrindAdjustmentCorrect === true) {
        grindStatusText = `${analysis.grindAdjustment} [ปรับถูกต้อง]`;
        grindColor = '#2e7d32';
      } else if (analysis.isGrindAdjustmentCorrect === false) {
        grindStatusText = `${analysis.grindAdjustment} [ปรับผิดทิศทาง]`;
        grindColor = '#c62828';
      } else {
        grindStatusText = `${analysis.grindAdjustment}`;
        grindColor = '#3b82f6';
      }
    }

    // Determine overall status text & color
    let statusLabel = 'SYSTEM OK';
    let accentColor = '#2e7d32'; // Green by default
    if (analysis.totalTime?.status === 'SLOW' || analysis.totalTime?.status === 'FAST') {
      statusLabel = 'OUT OF SPEC';
      accentColor = '#c62828'; // Red if out of spec
    } else if (analysis.dose?.status !== 'OK' || analysis.yield?.status !== 'OK') {
      statusLabel = 'WARNING';
      accentColor = '#ef6c00'; // Orange if warning
    }

    const flexMsg = {
      type: 'flex',
      altText: `วิเคราะห์ช็อตกาแฟของ พี่${friendlyName}`,
      contents: {
        type: 'bubble',
        size: 'mega',
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
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: 'ESPRESSO EXTRACTION ANALYTICS',
                  color: '#1c1c1c',
                  weight: 'bold',
                  size: 'sm',
                  flex: 1
                },
                {
                  type: 'text',
                  text: statusLabel,
                  color: accentColor,
                  weight: 'bold',
                  size: 'xs',
                  align: 'end'
                }
              ]
            },
            {
              type: 'text',
              text: `OPERATOR: ${friendlyName.toUpperCase()}`,
              color: '#666666',
              size: 'xxs',
              margin: 'xs'
            }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '20px',
          spacing: 'md',
          contents: [
            // Row 1: Dose
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: 'ผงกาแฟ (DOSE)', size: 'xs', color: '#666666', flex: 4 },
                { type: 'text', text: analysis.dose?.value ? `${analysis.dose.value} g` : '-', size: 'xs', color: '#1c1c1c', weight: 'bold', flex: 2 },
                { type: 'text', text: doseDisplay.text, color: doseDisplay.color, size: 'xs', align: 'end', weight: 'bold', flex: 3 }
              ]
            },
            { type: 'separator', color: '#e0e0e0' },
            // Row 2: Yield
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: 'น้ำกาแฟ (YIELD)', size: 'xs', color: '#666666', flex: 4 },
                { type: 'text', text: analysis.yield?.value ? `${analysis.yield.value} ml` : '-', size: 'xs', color: '#1c1c1c', weight: 'bold', flex: 2 },
                { type: 'text', text: yieldDisplay.text, color: yieldDisplay.color, size: 'xs', align: 'end', weight: 'bold', flex: 3 }
              ]
            },
            { type: 'separator', color: '#e0e0e0' },
            // Row 3: First Drop
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: 'หยดแรก (FIRST DROP)', size: 'xs', color: '#666666', flex: 4 },
                { type: 'text', text: analysis.firstDrop?.value ? `${analysis.firstDrop.value} s` : '-', size: 'xs', color: '#1c1c1c', weight: 'bold', flex: 2 },
                { type: 'text', text: firstDropDisplay.text, color: firstDropDisplay.color, size: 'xs', align: 'end', weight: 'bold', flex: 3 }
              ]
            },
            { type: 'separator', color: '#e0e0e0' },
            // Row 4: Total Time
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: 'เวลาสกัด (TOTAL TIME)', size: 'xs', color: '#666666', flex: 4 },
                { type: 'text', text: analysis.totalTime?.value ? `${analysis.totalTime.value} s` : '-', size: 'xs', color: '#1c1c1c', weight: 'bold', flex: 2 },
                { type: 'text', text: totalTimeDisplay.text, color: totalTimeDisplay.color, size: 'xs', align: 'end', weight: 'bold', flex: 3 }
              ]
            },
            { type: 'separator', margin: 'md', color: '#cccccc' },
            
            // Taste Profile Section
            {
              type: 'box',
              layout: 'vertical',
              spacing: 'xs',
              contents: [
                { type: 'text', text: 'ESTIMATED TASTE PROFILE', size: 'xxs', color: '#666666', weight: 'bold' },
                { type: 'text', text: analysis.tasteProfile || 'ปกติ', size: 'sm', color: '#1c1c1c', weight: 'bold', wrap: true }
              ]
            },
            
            // Grind Adjustment Section
            {
              type: 'box',
              layout: 'vertical',
              margin: 'sm',
              spacing: 'xs',
              contents: [
                { type: 'text', text: 'GRIND ADJUSTMENT', size: 'xxs', color: '#666666', weight: 'bold' },
                { type: 'text', text: grindStatusText, size: 'sm', color: grindColor, weight: 'bold', wrap: true }
              ]
            },
            { type: 'separator', margin: 'md', color: '#cccccc' },
            
            // Recommendation Section
            {
              type: 'box',
              layout: 'vertical',
              spacing: 'xs',
              contents: [
                { type: 'text', text: 'SYSTEM RECOMMENDATION', size: 'xxs', color: '#666666', weight: 'bold' },
                { type: 'text', text: analysis.recommendation, size: 'sm', color: '#333333', wrap: true }
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
              text: 'Yuzu AI Barista Assistant 🍊☕',
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
