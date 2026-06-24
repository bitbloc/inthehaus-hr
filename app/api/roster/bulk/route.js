import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabaseClient';
import { Client } from '@line/bot-sdk';
import { format, parseISO } from 'date-fns';

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

const GROUP_IDS = [
  'C1210c7a0601b5a675060e312efe10bff',
  'C71db3c7339b11f43dc8f1ec34bf46f43'
];

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, transactions, startDate, endDate } = body;

    if (action === 'UPSERT') {
      // Upsert drafts to the database safely
      // Expected transactions format: array of { employee_id, date, slot_type, shift_id, custom_start_time, custom_end_time, is_off, status }
      
      const upsertData = transactions.map(t => ({
        employee_id: t.employee_id,
        date: t.date,
        slot_type: t.slot_type || 'MAIN',
        shift_id: t.shift_id || null,
        custom_start_time: t.custom_start_time || null,
        custom_end_time: t.custom_end_time || null,
        is_off: t.is_off || false,
        status: t.status || 'DRAFT',
        updated_at: new Date().toISOString()
      }));

      const { data, error } = await supabase
        .from('roster_transactions')
        .upsert(upsertData, { 
          onConflict: 'employee_id, date, slot_type',
          ignoreDuplicates: false 
        });

      if (error) {
        throw error;
      }
      return NextResponse.json({ success: true, message: 'Upserted successfully' });

    } else if (action === 'PUBLISH') {
      // Publish drafts for a specific date range
      if (!startDate || !endDate) {
        return NextResponse.json({ success: false, message: 'Missing startDate or endDate' }, { status: 400 });
      }

      const { error } = await supabase
        .from('roster_transactions')
        .update({ status: 'PUBLISHED' })
        .gte('date', startDate)
        .lte('date', endDate)
        .eq('status', 'DRAFT');

      if (error) {
        throw error;
      }

      // Broadcast to LINE Groups
      const startFmt = format(parseISO(startDate), 'dd/MM/yyyy');
      const endFmt = format(parseISO(endDate), 'dd/MM/yyyy');
      
      const flexMessage = {
        type: 'flex',
        altText: `📢 อัปเดตตารางงานใหม่! (${startFmt} - ${endFmt})`,
        contents: {
          type: 'bubble',
          body: {
            type: 'box', layout: 'vertical',
            contents: [
              { type: 'text', text: '📢 อัปเดตตารางงานใหม่!', weight: 'bold', size: 'xl', color: '#1DB446' },
              { type: 'text', text: `ระหว่างวันที่: ${startFmt} - ${endFmt}`, size: 'sm', color: '#666666', margin: 'md' },
              { type: 'separator', margin: 'md' },
              { type: 'text', text: 'ผู้บริหารได้ทำการเผยแพร่ (Publish) ตารางงานของสัปดาห์นี้เรียบร้อยแล้วครับ', size: 'sm', wrap: true, margin: 'md' },
              { type: 'text', text: 'ทีมงานทุกคนสามารถตรวจสอบตารางงานของตนเองได้โดยพิมพ์คำว่า "ตารางทั้งสัปดาห์" หรือ "ตารางงาน" ในห้องแชทได้เลยครับ', size: 'sm', wrap: true, margin: 'md' }
            ]
          }
        }
      };

      await Promise.all(
        GROUP_IDS.map(groupId => client.pushMessage(groupId, [flexMessage]).catch(e => console.error("Line Push Error:", e)))
      );

      return NextResponse.json({ success: true, message: 'Published successfully and notified via LINE' });

    } else if (action === 'DELETE') {
        // Option to delete a slot
        const { employee_id, date, slot_type } = body;
        const { error } = await supabase
            .from('roster_transactions')
            .delete()
            .match({ employee_id, date, slot_type });
        if (error) throw error;
        return NextResponse.json({ success: true, message: 'Deleted successfully' });
    }

    return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error("Roster Bulk API Error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
