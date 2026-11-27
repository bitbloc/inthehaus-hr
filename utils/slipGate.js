// Cheap first look at a photo that has no readable payment QR (owner, 2026-11-26).
//
// Yuzu skips photos without a QR so food and shop pictures cost no AI. But a transfer
// slip photographed on a phone screen (or a slip whose QR is cropped) has no readable
// QR either, and those were skipped too. This asks the fast model one question, "is
// this a payment slip?", and only then lets the full slip reader run.
import { getGenAI } from './gemini-client';

const PROMPT =
    'You sort photos sent to a restaurant staff chat. Answer true only if the image shows a bank transfer ' +
    'or payment slip / transfer confirmation, including a photo of a phone screen showing one. ' +
    'Food, drinks, people, the shop, menus, receipts from suppliers, chat screenshots and memes are false.';

/** True when the photo looks like a payment slip. On any error it returns false (stay silent). */
export async function looksLikePaymentSlip(base64, mimeType = 'image/jpeg') {
    try {
        const genAI = getGenAI({ fast: true });
        if (!genAI) return false;
        const model = genAI.getGenerativeModel({
            model: 'gemini-flash-lite-latest',
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: 'OBJECT',
                    properties: { is_payment_slip: { type: 'BOOLEAN' } },
                    required: ['is_payment_slip'],
                },
                maxOutputTokens: 1024,
            },
        });
        const result = await model.generateContent([
            { text: `${PROMPT}\nIs this a payment slip? Reply with the JSON only.` },
            { inlineData: { mimeType, data: base64 } },
        ]);
        const text = result?.response?.text?.() || '';
        const parsed = JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim());
        return parsed?.is_payment_slip === true;
    } catch (err) {
        console.warn('[Slip gate] check failed, staying silent:', err?.message || err);
        return false;
    }
}
