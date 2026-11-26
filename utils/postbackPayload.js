// Postback payloads for LINE confirm buttons.
// LINE caps postback data at 300 chars, and URLSearchParams turns "+" into a space,
// so the JSON is kept server-side (yuzu_chat_history, message_type 'postback_payload')
// and the button only carries `payload_id=<uuid>`. If the insert fails, fall back to
// base64url in the data itself, refusing (null) when it would exceed LINE's limit.
import { getServiceClient } from '../lib/supabaseServer';

export const POSTBACK_DATA_LIMIT = 300;
export const PAYLOAD_TOO_LONG_TEXT = 'รายการยาวเกินไป ลองพิมพ์สั้นลงครับ';
const MESSAGE_TYPE = 'postback_payload';
// Not a real group: keeps these rows out of group-scoped history and summaries.
const PAYLOAD_GROUP_ID = 'postback_payload';

export function toBase64Url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Accepts legacy base64 (whose "+" arrived as " " through URLSearchParams) and base64url.
export function fromBase64Param(raw) {
  const b64 = String(raw).replace(/ /g, '+').replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

/** Build postback data for `action` carrying `payload`. Returns null if it cannot fit. */
export async function buildPayloadPostbackData(action, payload, userId = null) {
  try {
    const { data, error } = await getServiceClient()
      .from('yuzu_chat_history')
      .insert({
        group_id: PAYLOAD_GROUP_ID,
        user_id: userId,
        role: 'system',
        content: JSON.stringify(payload),
        message_type: MESSAGE_TYPE,
      })
      .select('id')
      .single();
    if (error) throw error;
    if (data?.id) return `action=${action}&payload_id=${data.id}`;
  } catch (err) {
    console.error('Postback payload store failed, using inline base64url:', err?.message || err);
  }
  const inline = `action=${action}&payload=${toBase64Url(payload)}`;
  return inline.length <= POSTBACK_DATA_LIMIT ? inline : null;
}

/** Key for de-duplicating repeated taps on the same button. */
export function payloadKey(queryParams) {
  return queryParams.get('payload_id') || queryParams.get('payload');
}

/** Read the payload back from postback query params. Returns null when missing. */
export async function readPostbackPayload(queryParams) {
  const id = queryParams.get('payload_id');
  if (id) {
    const { data, error } = await getServiceClient()
      .from('yuzu_chat_history')
      .select('content')
      .eq('id', id)
      .eq('message_type', MESSAGE_TYPE)
      .maybeSingle();
    if (error) throw error;
    return data?.content ? JSON.parse(data.content) : null;
  }
  const raw = queryParams.get('payload');
  return raw ? fromBase64Param(raw) : null;
}
