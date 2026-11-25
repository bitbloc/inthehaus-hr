/* LINE Flex card for an espresso test shot (Brand v2 · Thai Twist Modern).
 * Plum header, cream body, charcoal text. A value outside the shop standard
 * is shown in plum bold with its Thai status word; red is not used, because
 * a slow shot is a thing to fix, not an error. No icons or emoji.
 * LINE Flex sizes: xs 13px · sm 14px · md 16px · lg 19px · xl 22px. */

import { BRAND, plain } from './slipFlex.js';
import { ESPRESSO_SPEC, STATUS_TH, isOff, specText, num, shotVerdict } from '../../../../utils/espressoSpec.js';

const text = (t, opts = {}) => {
    const s = plain(t);
    return { type: 'text', text: s || '-', wrap: true, ...opts };
};
const rule = (margin = 'lg') => ({ type: 'separator', margin, color: BRAND.rule });

/** One measurement: label + standard on the left, value and status on the right. */
function measureRow(key, part, unitOverride) {
    const spec = ESPRESSO_SPEC[key];
    const status = part?.status || 'NOT_SPECIFIED';
    const value = status === 'NOT_SPECIFIED' || !(Number(part?.value) > 0) ? null : num(part.value);
    const off = isOff(status);
    const unit = unitOverride || spec.unit;
    return {
        type: 'box',
        layout: 'horizontal',
        margin: 'lg',
        spacing: 'md',
        contents: [
            {
                type: 'box',
                layout: 'vertical',
                flex: 5,
                contents: [
                    text(spec.label, { size: 'sm', color: BRAND.charcoal }),
                    text(`เกณฑ์ ${specText(key)}`, { size: 'xs', color: BRAND.neutral }),
                ],
            },
            text(value ? `${value} ${unit}` : '-', { size: 'md', weight: 'bold', color: off ? BRAND.plum : BRAND.charcoal, flex: 4, align: 'end', gravity: 'center' }),
            text(STATUS_TH[status] || status, { size: 'sm', weight: off ? 'bold' : 'regular', color: off ? BRAND.plum : BRAND.neutral, flex: 3, align: 'end', gravity: 'center' }),
        ],
    };
}

const section = (title, body, { bg, bodyColor = BRAND.charcoal, margin = 'xl' } = {}) => ({
    type: 'box',
    layout: 'vertical',
    margin,
    ...(bg ? { backgroundColor: bg, paddingAll: '12px' } : {}),
    contents: [
        text(title, { size: 'xs', color: BRAND.neutral }),
        text(body, { size: 'sm', color: bodyColor, margin: 'xs' }),
    ],
});

/**
 * @param {object} p
 * @param {string} p.name       barista nickname
 * @param {object} p.analysis   Gemini result (dose, yield, firstDrop, totalTime, grindAdjustment, isGrindAdjustmentCorrect, tasteProfile, recommendation)
 * @param {object} [p.weather]  getWeatherGrindPrediction() result
 * @param {string} [p.trend]    today's trend sentence
 * @param {string} [p.timeText] "11:01 น."
 */
export function buildEspressoFlex({ name, analysis, weather, trend, timeText }) {
    const a = analysis || {};
    const verdict = shotVerdict({
        dose: a.dose?.status,
        yieldStatus: a.yield?.status,
        firstDrop: a.firstDrop?.status,
        totalTime: a.totalTime?.status,
    });
    const yieldUnit = /^g/i.test(a.yield?.unit || '') ? 'g' : 'ml';

    let grind = null;
    if (a.grindAdjustment && plain(a.grindAdjustment)) {
        const dir = a.isGrindAdjustmentCorrect === true ? ' · ปรับถูกทาง' : a.isGrindAdjustmentCorrect === false ? ' · ควรปรับอีกทาง' : '';
        grind = { body: `${plain(a.grindAdjustment)}${dir}`, wrong: a.isGrindAdjustmentCorrect === false };
    }

    const body = [
        measureRow('dose', a.dose),
        rule('md'),
        measureRow('yield', a.yield, yieldUnit),
        rule('md'),
        measureRow('firstDrop', a.firstDrop),
        rule('md'),
        measureRow('totalTime', a.totalTime),
    ];

    if (plain(a.tasteProfile)) body.push(section('รสชาติที่น่าจะได้', a.tasteProfile));
    if (grind) body.push(section('การปรับบด', grind.body, { bodyColor: grind.wrong ? BRAND.plum : BRAND.charcoal, margin: 'lg' }));
    if (plain(a.recommendation)) body.push(section('ยูซุแนะนำ', a.recommendation, { bg: BRAND.paper2 }));
    if (weather?.hasData) {
        body.push(section(`อากาศตอนนี้ ${num(weather.temp) ?? '-'}°C · ชื้น ${num(weather.humidity) ?? '-'}%`, String(weather.grindAction || '').replace(/\s*\([A-Za-z ]+\)/g, ''), { margin: 'lg' }));
    }
    if (plain(trend)) body.push(section('แนวโน้มวันนี้', trend, { margin: 'lg' }));

    return {
        type: 'flex',
        altText: plain(`ช็อตทดสอบของ${name} · ${verdict.text}`),
        contents: {
            type: 'bubble',
            size: 'mega',
            header: {
                type: 'box',
                layout: 'vertical',
                backgroundColor: BRAND.plum,
                paddingAll: '16px',
                contents: [
                    text(`ESPRESSO · ช็อตทดสอบ${timeText ? ` · ${timeText}` : ''}`, { size: 'xs', color: BRAND.onPlum2 }),
                    text(verdict.text, { size: 'xl', weight: 'bold', color: BRAND.cream, margin: 'sm' }),
                    text(`บาริสต้า ${name}`, { size: 'sm', color: BRAND.onPlum2, margin: 'xs' }),
                ],
            },
            body: {
                type: 'box',
                layout: 'vertical',
                backgroundColor: BRAND.cream,
                paddingAll: '16px',
                paddingTop: '4px',
                contents: body,
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                backgroundColor: BRAND.cream,
                paddingAll: '12px',
                contents: [rule('none'), text('ยูซุ · ผู้ช่วยบาริสต้า ในบ้าน', { size: 'xs', color: BRAND.neutral, align: 'center', margin: 'md' })],
            },
        },
    };
}
