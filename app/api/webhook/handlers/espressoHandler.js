import { analyzeEspressoShot } from '../../../../utils/gemini.js';
import { getEmployeeByLineId, saveMessage } from '../../../../utils/memory.js';
import { getWeatherGrindPrediction } from '../../../../utils/weather.js';
import { supabase } from '../../../../lib/supabaseClient';
import { buildEspressoFlex } from './espressoFlex.js';
import { bangkokDayStartISO } from '../../../../utils/espressoSpec.js';

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

/** Value only when the AI actually read one (NOT_SPECIFIED -> null, keeps 0 out). */
const readValue = (part) => {
  if (!part || part.status === 'NOT_SPECIFIED') return null;
  const n = Number(part.value);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const readStatus = (part) => part?.status || null;

/** Today's trend sentence for this group (Bangkok day; includes the shot just logged). */
async function todayTrend(groupId) {
  let q = supabase
    .from('espresso_logs')
    .select('total_time_status')
    .gte('created_at', bangkokDayStartISO());
  if (groupId) q = q.eq('group_id', groupId);
  const { data } = await q;
  if (!data || data.length < 2) return '';

  const total = data.length;
  const fast = data.filter(l => l.total_time_status === 'FAST').length;
  const slow = data.filter(l => l.total_time_status === 'SLOW').length;
  const ok = data.filter(l => l.total_time_status === 'OK').length;
  if (fast >= 2) return `วันนี้ ${total} ช็อต ไหลเร็วเกินเกณฑ์ ${fast} ครั้ง ลองบดละเอียดขึ้น 1–2 คลิก`;
  if (slow >= 2) return `วันนี้ ${total} ช็อต ไหลช้าเกินเกณฑ์ ${slow} ครั้ง ลองบดหยาบขึ้น 1–2 คลิก`;
  if (ok >= 2) return `วันนี้ ${total} ช็อต ผ่านเกณฑ์เวลา ${ok} ครั้ง`;
  return '';
}

/**
 * Handles the analysis and sends the Flex Message to the group/user
 */
export async function handleEspressoShotAnalysis(event, client, rawText, userId, groupId) {
  try {
    const empData = await getEmployeeByLineId(userId);
    const friendlyName = empData ? (empData.nickname || empData.name) : 'บาริสต้า';
    const mappedDbUserId = empData?.line_user_id || userId;

    // 1. Ask Gemini to read the numbers and judge them against the shop standard
    const analysis = await analyzeEspressoShot(rawText, friendlyName);
    if (!analysis) return false;

    // 2. Weather grind drift (returns hasData=false on failure)
    const weatherPrediction = await getWeatherGrindPrediction().catch(() => ({ hasData: false }));

    // 3. Log the shot. supabase-js returns { error } instead of throwing, so check it.
    const { error: insertErr } = await supabase.from('espresso_logs').insert({
      group_id: groupId || null,
      user_id: mappedDbUserId,
      operator_name: friendlyName,
      raw_text: rawText,
      dose: readValue(analysis.dose),
      dose_status: readStatus(analysis.dose),
      yield: readValue(analysis.yield),
      yield_status: readStatus(analysis.yield),
      first_drop: readValue(analysis.firstDrop),
      first_drop_status: readStatus(analysis.firstDrop),
      total_time: readValue(analysis.totalTime),
      total_time_status: readStatus(analysis.totalTime),
      grind_adjustment: analysis.grindAdjustment || null,
      is_grind_correct: analysis.isGrindAdjustmentCorrect ?? null,
      taste_profile: analysis.tasteProfile || null,
      recommendation: analysis.recommendation || null,
      weather_temp: weatherPrediction.hasData ? weatherPrediction.temp : null,
      weather_humidity: weatherPrediction.hasData ? weatherPrediction.humidity : null,
      weather_condition: weatherPrediction.hasData ? weatherPrediction.conditionText : null,
      created_at: new Date().toISOString()
    });
    if (insertErr) console.error('espresso_logs insert failed:', insertErr.message);

    // 4. Today's trend
    let trendInsight = '';
    try {
      trendInsight = await todayTrend(groupId);
    } catch (trendErr) {
      console.warn('Trend calculation skipped:', trendErr.message);
    }

    // Save the raw report to chat history for context
    await saveMessage(groupId, userId, 'user', rawText, 'espresso_report');

    const timeText = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }) + ' น.';
    const flexMsg = buildEspressoFlex({ name: friendlyName, analysis, weather: weatherPrediction, trend: trendInsight, timeText });

    // Gemini can take a while; if the reply token has expired, push instead
    try {
      await client.replyMessage(event.replyToken, flexMsg);
    } catch (replyErr) {
      const to = groupId || userId;
      console.warn('Espresso reply failed, pushing instead:', replyErr?.message);
      if (to) await client.pushMessage(to, flexMsg);
    }

    // Save Yuzu's recommendation to the history log
    if (analysis.recommendation) {
      await saveMessage(groupId, null, 'model', `[Espresso Analysis] ${analysis.recommendation}`, 'text');
    }
    return true;
  } catch (error) {
    console.error("Espresso Handler Error:", error);
    return false;
  }
}
