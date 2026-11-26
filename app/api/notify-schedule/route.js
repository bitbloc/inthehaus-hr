import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../lib/supabaseServer';
import { supabase } from '../../../lib/supabaseClient';
import { Client } from '@/utils/lineClient';
import { BRAND } from '@/utils/brand';
import { format, startOfWeek, endOfWeek, addDays, parseISO } from 'date-fns';

// ✅ Group IDs (กลุ่มหลัก และ กลุ่มแผนกอื่น)
const GROUP_IDS = [
  'C1210c7a0601b5a675060e312efe10bff',
  'C71db3c7339b11f43dc8f1ec34bf46f43'
];

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export async function POST(request) {
  // Admin-only route: verify the Supabase Auth session sent by adminFetch().
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const db = auth.db;
  try {
    let startDateParam, endDateParam;
    try {
      const body = await request.json();
      startDateParam = body.startDate;
      endDateParam = body.endDate;
    } catch (e) {
      // Empty or invalid body, ignore
    }

    const today = new Date();
    // Monday of current week
    const weekStart = startDateParam ? parseISO(startDateParam) : startOfWeek(today, { weekStartsOn: 1 });
    const weekEnd = endDateParam ? parseISO(endDateParam) : addDays(weekStart, 6);

    const startStr = format(weekStart, 'yyyy-MM-dd');
    const endStr = format(weekEnd, 'yyyy-MM-dd');

    // 1. Fetch Roster Transactions for the selected week
    const { data: schedules, error: queryError } = await supabase
      .from('roster_transactions')
      .select(`
        date,
        employee_id,
        slot_type,
        is_off,
        status,
        shift_id,
        custom_start_time,
        custom_end_time,
        employees(name, nickname, position),
        shifts(name, start_time, end_time)
      `)
      .gte('date', startStr)
      .lte('date', endStr)
      .order('date', { ascending: true });

    if (queryError) {
      throw queryError;
    }

    // 2. Publish all drafts in this week
    const { error: updateError } = await db
      .from('roster_transactions')
      .update({ status: 'PUBLISHED' })
      .gte('date', startStr)
      .lte('date', endStr)
      .eq('status', 'DRAFT');

    if (updateError) {
      console.error("Failed to update Roster drafts status to PUBLISHED:", updateError);
    }

    if (!schedules || schedules.length === 0) {
      return NextResponse.json({ success: false, message: "ไม่พบตารางงานในระบบสำหรับช่วงเวลานี้" });
    }

    const daysTitle = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
    const rosterByDateStr = {};
    const weekDates = [];

    // Initialize days of the week starting from Monday
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      const dateStr = format(d, 'yyyy-MM-dd');
      weekDates.push(d);
      rosterByDateStr[dateStr] = [];
    }

    schedules.forEach(item => {
      if (item.is_off) return;

      const shiftStart = item.custom_start_time?.slice(0, 5) || item.shifts?.start_time?.slice(0, 5) || '';
      const shiftEnd = item.custom_end_time?.slice(0, 5) || item.shifts?.end_time?.slice(0, 5) || '';
      const timeStr = shiftStart && shiftEnd ? `${shiftStart}-${shiftEnd}` : shiftStart;
      
      const empName = item.employees?.nickname || item.employees?.name || 'พนักงาน';
      const shiftName = item.shifts?.name || 'Custom';
      const empPosition = item.employees?.position || '';
      
      if (rosterByDateStr[item.date]) {
        rosterByDateStr[item.date].push({
          name: empName,
          shift: shiftName,
          time: timeStr,
          position: empPosition
        });
      }
    });

    const contents = [];
    const startFmt = format(weekStart, 'dd/MM/yyyy');
    const endFmt = format(weekEnd, 'dd/MM/yyyy');

    weekDates.forEach(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const dayIndex = date.getDay();
      const dayName = daysTitle[dayIndex];
      const dateLabel = format(date, 'dd/MM');
      const staffList = rosterByDateStr[dateStr] || [];

      // Sort staffList by position rank (Owner -> Cooking -> Bar & Floor -> Others)
      const getPositionOrder = (position) => {
        const pos = (position || '').toLowerCase().trim();
        if (pos.includes('owner')) return 1;
        if (pos.includes('cook') || pos.includes('kitchen')) return 2;
        if (pos.includes('bar') || pos.includes('floor')) return 3;
        return 4;
      };

      staffList.sort((a, b) => {
        const orderA = getPositionOrder(a.position);
        const orderB = getPositionOrder(b.position);
        if (orderA !== orderB) return orderA - orderB;
        return (a.name || '').localeCompare(b.name || '', 'th');
      });

      if (staffList.length > 0) {
        contents.push({
          type: 'box', layout: 'horizontal', margin: 'lg',
          contents: [
            { type: 'text', text: `${dayName} ${dateLabel}`, weight: 'bold', size: 'sm', color: BRAND.charcoal, flex: 2 },
            { type: 'text', text: `${staffList.length} คน`, size: 'xs', color: BRAND.neutral, align: 'end', flex: 1 }
          ]
        });
        staffList.forEach(staff => {
          contents.push({
            type: 'box', layout: 'horizontal', margin: 'xs',
            contents: [
              { type: 'text', text: `• ${staff.name}`, size: 'xs', color: BRAND.charcoal, flex: 3 },
              { type: 'text', text: staff.time || '-', size: 'xs', color: BRAND.plum, align: 'end', flex: 2, weight: 'bold' }
            ]
          });
        });
        contents.push({ type: 'separator', margin: 'sm', color: BRAND.rule });
      } else {
        contents.push({
          type: 'box', layout: 'horizontal', margin: 'lg',
          contents: [
            { type: 'text', text: `${dayName} ${dateLabel}`, weight: 'bold', size: 'sm', color: BRAND.charcoal, flex: 2 },
            { type: 'text', text: `ไม่มีคนเข้ากะ`, size: 'xs', color: BRAND.neutral, align: 'end', flex: 1 }
          ]
        });
        contents.push({ type: 'separator', margin: 'sm', color: BRAND.rule });
      }
    });

    const message = {
      type: 'flex',
      altText: `📅 ประกาศตารางงาน (${startFmt} - ${endFmt})`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box', layout: 'vertical', backgroundColor: BRAND.plum, paddingAll: '20px',
          contents: [
            { type: 'text', text: 'ตารางงานประจำสัปดาห์', weight: 'bold', size: 'lg', color: BRAND.cream, wrap: true },
            { type: 'text', text: `${startFmt} - ${endFmt}`, size: 'xs', color: BRAND.onPlum2, margin: 'xs' }
          ]
        },
        body: { type: 'box', layout: 'vertical', backgroundColor: BRAND.cream, contents: contents }
      }
    };

    await Promise.all(
      GROUP_IDS.map(groupId => client.pushMessage(groupId, [message]).catch(e => console.error("LINE Push Error:", e)))
    );

    return NextResponse.json({ success: true, message: "ประกาศตารางงานและอัปเดตสถานะสำเร็จ" });

  } catch (error) {
    console.error("Schedule broadcast error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}