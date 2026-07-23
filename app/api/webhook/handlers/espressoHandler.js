import { analyzeEspressoShot } from '../../../../utils/gemini.js';
import { getEmployeeByLineId, saveMessage } from '../../../../utils/memory.js';
import { getWeatherGrindPrediction } from '../../../../utils/weather.js';
import { supabase } from '../../../../lib/supabaseClient';

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
    const mappedDbUserId = empData?.line_user_id || userId;
    
    // 1. Call Gemini to parse and analyze the text
    const analysis = await analyzeEspressoShot(rawText, friendlyName);
    if (!analysis) return false;

    // 2. Fetch Weather & Grind Drift Prediction
    const weatherPrediction = await getWeatherGrindPrediction();

    // 3. Log calibration to database (Grind Calibration History Tracking)
    try {
      await supabase.from('espresso_logs').insert({
        group_id: groupId,
        user_id: mappedDbUserId,
        operator_name: friendlyName,
        raw_text: rawText,
        dose: analysis.dose?.value || null,
        dose_status: analysis.dose?.status || null,
        yield: analysis.yield?.value || null,
        yield_status: analysis.yield?.status || null,
        first_drop: analysis.firstDrop?.value || null,
        first_drop_status: analysis.firstDrop?.status || null,
        total_time: analysis.totalTime?.value || null,
        total_time_status: analysis.totalTime?.status || null,
        grind_adjustment: analysis.grindAdjustment || null,
        is_grind_correct: analysis.isGrindAdjustmentCorrect ?? null,
        taste_profile: analysis.tasteProfile || null,
        recommendation: analysis.recommendation || null,
        weather_temp: weatherPrediction.hasData ? weatherPrediction.temp : null,
        weather_humidity: weatherPrediction.hasData ? weatherPrediction.humidity : null,
        weather_condition: weatherPrediction.hasData ? weatherPrediction.conditionText : null,
        created_at: new Date().toISOString()
      });
    } catch (dbErr) {
      console.warn("espresso_logs insert failed (table might be missing):", dbErr.message);
    }

    // 4. Calculate today's extraction trend
    let trendInsight = "";
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const { data: todayLogs } = await supabase
        .from('espresso_logs')
        .select('total_time_status, grind_adjustment')
        .gte('created_at', startOfDay.toISOString());

      if (todayLogs && todayLogs.length >= 2) {
        const totalShots = todayLogs.length;
        const fastCount = todayLogs.filter(l => l.total_time_status === 'FAST').length;
        const slowCount = todayLogs.filter(l => l.total_time_status === 'SLOW').length;
        const okCount = todayLogs.filter(l => l.total_time_status === 'OK').length;

        if (fastCount >= 2) {
          trendInsight = `วันนี้สกัดไปแล้ว ${totalShots} ช็อต: มีแนวโน้มไหลไวเกินเกณฑ์ ${fastCount} ครั้ง! แนะนำปรับบด Fine ขึ้น 1-2 คลิก`;
        } else if (slowCount >= 2) {
          trendInsight = `วันนี้สกัดไปแล้ว ${totalShots} ช็อต: มีแนวโน้มไหลช้าเกินเกณฑ์ ${slowCount} ครั้ง! แนะนำปรับบด Coarser ขึ้น 1-2 คลิก`;
        } else if (okCount >= 2) {
          trendInsight = `วันนี้สกัดไปแล้ว ${totalShots} ช็อต: ควบคุมคุณภาพดีเยี่ยม! สกัดผ่านเกณฑ์ ${okCount} ครั้ง`;
        }
      }
    } catch (trendErr) {
      console.warn("Trend calculation skipped:", trendErr.message);
    }

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

    const bodyContents = [
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
    ];

    // Append Weather & Grind Drift Prediction to Body if available
    if (weatherPrediction && weatherPrediction.hasData) {
      bodyContents.push(
        { type: 'separator', margin: 'md', color: '#cccccc' },
        {
          type: 'box',
          layout: 'vertical',
          spacing: 'xs',
          contents: [
            { type: 'text', text: 'WEATHER & BEAN DRIFT PREDICTION 🌧️☕', size: 'xxs', color: weatherPrediction.statusColor, weight: 'bold' },
            { type: 'text', text: weatherPrediction.riskTitle, size: 'xs', color: '#111827', weight: 'bold', wrap: true },
            { type: 'text', text: weatherPrediction.grindAction, size: 'xs', color: '#4b5563', wrap: true, margin: 'xs' }
          ]
        }
      );
    }

    // Append Calibration Trend Insight if available
    if (trendInsight) {
      bodyContents.push(
        { type: 'separator', margin: 'md', color: '#cccccc' },
        {
          type: 'box',
          layout: 'vertical',
          spacing: 'xs',
          contents: [
            { type: 'text', text: 'CALIBRATION TREND INSIGHT 📊', size: 'xxs', color: '#2563eb', weight: 'bold' },
            { type: 'text', text: trendInsight, size: 'xs', color: '#1e40af', wrap: true }
          ]
        }
      );
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
          contents: bodyContents
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
