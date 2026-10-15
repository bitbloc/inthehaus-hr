import { saveMessage } from '../../../../utils/memory.js';

/**
 * Handle Business Card / Tax Invoice Information Card OCR Image
 * Replies with clean, structured text that staff can easily copy-paste
 * directly into POS / e-Tax invoice systems with 1 tap.
 */
export async function handleBusinessCardImage(event, client, result, userId, groupId) {
  const lines = [];

  if (result.companyName) {
    lines.push(result.companyName);
  }
  if (result.branch) {
    const cleanBranch = result.branch.replace(/[()]/g, '').trim();
    lines.push(`(${cleanBranch})`);
  }
  if (result.address) {
    lines.push(result.address);
  }
  if (result.taxId) {
    const cleanTax = String(result.taxId).trim();
    const rawDigits = cleanTax.replace(/\D/g, '');
    if (rawDigits.length === 13 && rawDigits !== cleanTax) {
      lines.push(`เลขประจำตัวผู้เสียภาษี: ${cleanTax} (${rawDigits})`);
    } else {
      lines.push(`เลขประจำตัวผู้เสียภาษี: ${cleanTax}`);
    }
  }
  if (result.phone) {
    lines.push(`โทร: ${result.phone}`);
  }
  if (result.email) {
    lines.push(`อีเมล: ${result.email}`);
  }
  if (result.contactPerson) {
    lines.push(`ผู้ติดต่อ: ${result.contactPerson}`);
  }

  // Fallback to ocrText if structured lines are sparse
  let contentBody = '';
  if (lines.length >= 2) {
    contentBody = lines.join('\n');
  } else if (result.ocrText) {
    contentBody = result.ocrText;
  } else {
    contentBody = lines.join('\n') || 'ไม่สามารถดึงข้อความจากบัตรได้ชัดเจนครับ';
  }

  const replyText = `🏢 ข้อมูลออกใบกำกับภาษี / นามบัตร (OCR):\n\n${contentBody}`;

  try {
    await client.replyMessage(event.replyToken, { type: 'text', text: replyText });
  } catch (replyErr) {
    console.warn("[OCR Handler] replyMessage failed, attempting pushMessage fallback:", replyErr.message);
    const target = groupId || userId;
    if (target) {
      await client.pushMessage(target, { type: 'text', text: replyText });
    }
  }

  await saveMessage(groupId, userId, 'user', `[ภาพนามบัตร/ข้อมูลภาษี] ${result.shortDescription || 'นามบัตร'}`, 'image_description');
  await saveMessage(groupId, null, 'model', replyText, 'text');
  return true;
}
