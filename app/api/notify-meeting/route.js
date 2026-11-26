import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../lib/supabaseServer';
import { Client } from '@/utils/lineClient';
import { supabase } from '../../../lib/supabaseClient';
import { BRAND, plain } from '../webhook/handlers/slipFlex.js';

/* POST /api/notify-meeting  { noteId }
 * Tells the staff LINE groups that a new meeting note was posted.
 * Takes only a note id: title / date / summary are read from the database, so
 * the endpoint can't be used to post arbitrary text. Only notes created in the
 * last 30 minutes are announced, so an old note can't be re-sent later.
 * Card follows Brand v2 (inthehaus-booking/.agents/AGENTS.md). No icons or emoji. */

// Same staff groups as the other notify-* routes
const GROUP_IDS = [
  'C1210c7a0601b5a675060e312efe10bff',
  'C71db3c7339b11f43dc8f1ec34bf46f43'
];

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || '2008567449-W868y8RY';
const FRESH_MS = 30 * 60 * 1000;

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

const thaiDate = (dateStr) => {
  try {
    const d = new Date(`${dateStr}T00:00:00+07:00`);
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });
  } catch {
    return dateStr;
  }
};

function buildMeetingNoteFlex(note) {
  const summary = plain(note.summary || '').slice(0, 280);
  return {
    type: 'flex',
    altText: `บันทึกการประชุมใหม่: ${plain(note.title)}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      styles: { header: { backgroundColor: BRAND.plum }, body: { backgroundColor: BRAND.cream }, footer: { backgroundColor: BRAND.cream } },
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: BRAND.plum,
        paddingAll: '16px',
        contents: [
          { type: 'text', text: 'MEETING NOTES · ในบ้าน', size: 'xs', color: BRAND.onPlum2 },
          { type: 'text', text: 'บันทึกการประชุมใหม่', size: 'lg', weight: 'bold', color: BRAND.cream, margin: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: `ประชุมวันที่ ${thaiDate(note.meeting_date)}`, size: 'sm', color: BRAND.neutral, wrap: true },
          { type: 'text', text: plain(note.title) || 'บันทึกการประชุม', size: 'lg', weight: 'bold', color: BRAND.charcoal, wrap: true, margin: 'sm' },
          ...(summary ? [{ type: 'text', text: summary, size: 'md', color: BRAND.muted, wrap: true, margin: 'md' }] : []),
          { type: 'text', text: 'ทุกคนอ่านให้ครบนะครับ', size: 'sm', color: BRAND.plum, weight: 'bold', margin: 'lg' },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        paddingTop: '0px',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: BRAND.charcoal,
            height: 'md',
            action: { type: 'uri', label: 'เปิดบันทึกการประชุม', uri: `https://liff.line.me/${LIFF_ID}?open=meetings` },
          },
        ],
      },
    },
  };
}

export async function POST(request) {
  // Admin-only route: verify the Supabase Auth session sent by adminFetch().
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  try {
    const { noteId } = await request.json().catch(() => ({}));
    if (!noteId || typeof noteId !== 'string' || !/^[0-9a-f-]{36}$/i.test(noteId)) {
      return NextResponse.json({ success: false, error: 'noteId ไม่ถูกต้อง' }, { status: 400 });
    }

    const { data: note, error } = await supabase
      .from('meeting_notes')
      .select('id, title, meeting_date, summary, created_at')
      .eq('id', noteId)
      .maybeSingle();
    if (error) throw error;
    if (!note) {
      return NextResponse.json({ success: false, error: 'ไม่พบบันทึกการประชุม' }, { status: 404 });
    }
    if (Date.now() - new Date(note.created_at).getTime() > FRESH_MS) {
      return NextResponse.json({ success: false, error: 'แจ้งเตือนได้เฉพาะบันทึกที่เพิ่งลงภายใน 30 นาที' }, { status: 409 });
    }

    const message = buildMeetingNoteFlex(note);
    const results = await Promise.allSettled(GROUP_IDS.map((id) => client.pushMessage(id, message)));
    const sent = results.filter((r) => r.status === 'fulfilled').length;
    results.forEach((r, i) => {
      if (r.status === 'rejected') console.error(`[notify-meeting] push to group ${i} failed:`, r.reason?.message || r.reason);
    });

    return NextResponse.json({ success: sent > 0, sent, total: GROUP_IDS.length }, { status: sent > 0 ? 200 : 502 });
  } catch (err) {
    console.error('[notify-meeting] error:', err);
    return NextResponse.json({ success: false, error: err.message || 'ส่งแจ้งเตือนไม่สำเร็จ' }, { status: 500 });
  }
}
