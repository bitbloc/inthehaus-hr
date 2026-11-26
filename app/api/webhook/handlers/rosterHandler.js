import { format, addHours, startOfTomorrow, parseISO, startOfWeek, addDays } from 'date-fns';
import { getEffectiveRoster } from '../../../../utils/roster';
import { LATE_GRACE_MINUTES, minutesAfter } from '../../../../utils/attendance';
import { getEmployeeByLineId, checkIsBoss } from '../../../../utils/memory';
import { getServiceClient } from '../../../../lib/supabaseServer';
import { buildPayloadPostbackData, readPostbackPayload, PAYLOAD_TOO_LONG_TEXT } from '../../../../utils/postbackPayload';
import { BRAND } from '@/utils/brand';

// LINE webhook has no user session: use the service-role client (falls back to anon until
// SUPABASE_SERVICE_ROLE_KEY is set) so roster writes keep working once anon writes are revoked.
const supabase = getServiceClient();

/** Monday-Sunday of next week (Bangkok), the range AUTO_GENERATE fills. */
export function nextRosterWeek(startDateStr) {
  const targetMon = startDateStr
    ? parseISO(startDateStr)
    : startOfWeek(addDays(addHours(new Date(), 7), 7), { weekStartsOn: 1 });
  return { targetMon, targetSun: addDays(targetMon, 6) };
}

export function autoGenerateSummaryText(targetMon, targetSun) {
  return `จัดตารางสัปดาห์หน้าอัตโนมัติ (${format(targetMon, 'dd/MM')} - ${format(targetSun, 'dd/MM')})
ยูซุจะสร้างกะงานใหม่ทับตารางเดิมของสัปดาห์นั้น นำเข้าใบลาที่อนุมัติแล้ว และบันทึกเป็นแบบร่าง (Draft)
กดยืนยันเพื่อสร้างครับ`;
}

/** Confirm card for a roster action; the button carries `postbackData` (see utils/postbackPayload). */
export function buildRosterConfirmMessage(summaryText, isBossUser, postbackData) {
  const confirmFlex = {
    type: 'bubble',
    styles: {
      body: { backgroundColor: BRAND.cream },
      footer: { backgroundColor: BRAND.cream }
    },
    header: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '20px',
      backgroundColor: BRAND.plum,
      contents: [
        { type: 'text', text: 'ยืนยันการแก้ตารางงาน', color: BRAND.cream, weight: 'bold', size: 'md', wrap: true },
        { type: 'text', text: isBossUser ? 'คำสั่งจากบอส' : 'คำขอรอบอสอนุมัติ', color: BRAND.onPlum2, size: 'xs', margin: 'xs' }
      ]
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '20px',
      contents: [
        { type: 'text', text: summaryText || '-', wrap: true, size: 'sm', color: BRAND.charcoal },
        { type: 'text', text: isBossUser ? 'ตรวจรายละเอียดก่อนกดยืนยันครับ' : 'ตรวจว่าข้อมูลถูกต้อง แล้วกดส่งให้บอสพิจารณาครับ', margin: 'md', size: 'xs', color: BRAND.neutral, wrap: true }
      ]
    },
    footer: {
      type: 'box',
      layout: 'horizontal',
      paddingAll: '15px',
      spacing: 'sm',
      contents: [
        { type: 'button', style: 'primary', color: BRAND.charcoal, action: { type: 'postback', label: isBossUser ? 'ยืนยันแก้ตาราง' : 'ยืนยันส่งคำขอ', data: postbackData } },
        { type: 'button', style: 'secondary', color: BRAND.paper2, action: { type: 'postback', label: 'ยกเลิก', data: 'action=cancel_roster' } }
      ]
    }
  };
  return { type: 'flex', altText: isBossUser ? '👑 บอสสั่งแก้ตาราง' : '📝 ยืนยันข้อมูลตารางงาน', contents: confirmFlex };
}

// Roster calendar cell colours, brand v2: plum marks a working shift, a plum fill marks
// the heavy double shift, cream with charcoal or neutral text marks leave and days off.
// Each shift keeps its own short label, so colour does not have to tell them apart.
function getCellColorsAndLabels(empShift, isOff, leaveRequest) {
  const work = { bg: BRAND.paper2, borderColor: BRAND.rule, textColor: BRAND.plum };

  if (leaveRequest) {
    let label = 'ลา';
    let time1 = 'ลาหยุด';

    if (leaveRequest.leave_type === 'vacation') {
      label = 'พัก';
      time1 = 'พักร้อน';
    } else if (leaveRequest.leave_type === 'sick') {
      label = 'ป่วย';
      time1 = 'ลาป่วย';
    } else if (leaveRequest.leave_type === 'business') {
      label = 'กิจ';
      time1 = 'ลากิจ';
    }

    return {
      bg: BRAND.cream,
      borderColor: BRAND.rule,
      textColor: BRAND.charcoal,
      label,
      timeLine1: time1,
      timeLine2: ''
    };
  }

  if (isOff || !empShift || empShift.name === 'OFF') {
    return {
      bg: BRAND.cream,
      borderColor: BRAND.rule,
      textColor: BRAND.neutral,
      label: 'OFF',
      timeLine1: 'หยุด',
      timeLine2: ''
    };
  }

  const name = empShift.name || 'Custom';
  const start = empShift.start_time?.slice(0, 5) || '';
  const end = empShift.end_time?.slice(0, 5) || '';

  // Check presets
  if (name.includes('เช้า') || (start === '10:00' && end === '18:00')) {
    return { ...work, label: 'เช้า', timeLine1: start, timeLine2: end };
  }
  if (name.includes('ค่ำ') || name.includes('ดึก') || (start === '16:30' && end === '00:30')) {
    return { ...work, label: 'ค่ำ', timeLine1: start, timeLine2: end };
  }
  if (name.includes('ควบ') || (start === '10:00' && end === '00:30')) {
    return { bg: BRAND.plum, borderColor: BRAND.plum, textColor: BRAND.cream, label: 'ควบ', timeLine1: start, timeLine2: end };
  }
  if (name.toLowerCase().includes('haus') || (start === '18:00' && end === '22:30')) {
    return { ...work, label: 'HAUS', timeLine1: start, timeLine2: end };
  }
  if (name.toLowerCase().includes('chef') || (start === '10:00' && end === '20:30')) {
    return { ...work, label: 'CHEF', timeLine1: start, timeLine2: end };
  }
  if (name.includes('ผู้ช่วยครัว') || (start === '12:30' && end === '23:30')) {
    return { ...work, label: 'ครัว', timeLine1: start, timeLine2: end };
  }
  if (name.includes('กลาง') || (start === '12:00' && end === '20:00') || (start === '12:00' && end === '21:00') || (start === '11:00' && end === '20:00')) {
    return { ...work, label: 'กลาง', timeLine1: start, timeLine2: end };
  }

  // Smart fallback for custom presets and custom times (e.g. 12-21 instead of Custom S)
  const customLabel = (start && end)
    ? `${start.slice(0, 2)}-${end.slice(0, 2)}`
    : (name.toLowerCase().startsWith('custom') ? 'กะ' : name.slice(0, 6));

  return {
    bg: BRAND.paper2,
    borderColor: BRAND.rule,
    textColor: BRAND.charcoal,
    label: customLabel || 'กะ',
    timeLine1: start,
    timeLine2: end
  };
}

function formatLeaveRequestBubble(l, isHistory = false, showReason = false) {
  const empName = l.employees?.nickname || l.employees?.name || 'พนักงาน';
  const empPosition = l.employees?.position || 'ทั่วไป';
  const dateStr = l.leave_date ? format(parseISO(l.leave_date), 'dd/MM/yyyy') : '-';

  let typeText = 'ลาหยุด';
  if (l.leave_type === 'sick') typeText = 'ลาป่วย';
  else if (l.leave_type === 'business') typeText = 'ลากิจ';
  else if (l.leave_type === 'vacation') typeText = 'พักร้อน';

  const repEmp = l.replacement_employee;
  const replacementName = repEmp ? `${repEmp.name} (${repEmp.nickname || "-"})` : '-';
  const reasonText = l.reason || '-';

  // Status label on the plum header: pending plum-2, approved cream, rejected red
  let statusLabel = 'รออนุมัติ';
  let statusBg = BRAND.plum2;
  let statusText = BRAND.cream;
  if (l.status === 'approved') {
    statusLabel = 'อนุมัติแล้ว';
    statusBg = BRAND.cream;
    statusText = BRAND.plum;
  } else if (l.status === 'rejected') {
    statusLabel = 'ไม่อนุมัติ';
    statusBg = BRAND.errorRed;
    statusText = BRAND.cream;
  }

  const row = (label, value, extra = {}) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, color: BRAND.neutral, size: 'sm', flex: 3 },
      { type: 'text', text: value || '-', color: BRAND.charcoal, size: 'sm', flex: 5, align: 'end', wrap: true, ...extra }
    ]
  });

  const bubble = {
    type: 'bubble',
    size: 'mega',
    styles: {
      body: { backgroundColor: BRAND.cream },
      footer: { backgroundColor: BRAND.cream }
    },
    header: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '20px',
      backgroundColor: BRAND.plum,
      contents: [
        {
          type: 'text',
          text: isHistory ? 'ประวัติการลา' : 'คำขอลา',
          weight: 'bold',
          size: 'md',
          color: BRAND.cream
        },
        {
          type: 'box',
          layout: 'horizontal',
          margin: 'sm',
          spacing: 'sm',
          contents: [
            {
              type: 'text',
              text: `${empName}, ${empPosition}`,
              color: BRAND.onPlum2,
              size: 'xs',
              flex: 1,
              gravity: 'center',
              wrap: true
            },
            {
              type: 'box',
              layout: 'vertical',
              flex: 0,
              backgroundColor: statusBg,
              cornerRadius: '4px',
              paddingStart: '8px',
              paddingEnd: '8px',
              paddingTop: '2px',
              paddingBottom: '2px',
              contents: [
                { type: 'text', text: statusLabel, color: statusText, weight: 'bold', size: 'xxs' }
              ]
            }
          ]
        }
      ]
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '20px',
      spacing: 'sm',
      contents: [
        row('วันที่ลา', dateStr, { weight: 'bold' }),
        row('ประเภท', typeText),
        row('คนแทน', replacementName),
        // The reason is private: shown only in a 1:1 chat, never on a group card.
        ...(showReason ? [{
          type: 'box',
          layout: 'vertical',
          margin: 'md',
          paddingAll: '12px',
          cornerRadius: '6px',
          backgroundColor: BRAND.paper2,
          contents: [
            { type: 'text', text: 'เหตุผลที่ลา', color: BRAND.neutral, size: 'xs', weight: 'bold' },
            { type: 'text', text: reasonText, color: BRAND.charcoal, size: 'sm', wrap: true, margin: 'xs' }
          ]
        }] : [])
      ]
    }
  };

  // Add footer buttons only if status is pending (so it can be approved/rejected)
  if (l.status === 'pending') {
    bubble.footer = {
      type: 'box',
      layout: 'horizontal',
      paddingAll: '15px',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: BRAND.charcoal,
          action: {
            type: 'postback',
            label: 'อนุมัติ',
            data: `action=approve_leave&id=${l.id}`
          }
        },
        {
          type: 'button',
          style: 'secondary',
          color: BRAND.paper2,
          action: {
            type: 'postback',
            label: 'ไม่อนุมัติ',
            data: `action=reject_leave&id=${l.id}`
          }
        }
      ]
    };
  }

  return bubble;
}

export async function generateStCalendarFlex(start) {
  const today = addHours(new Date(), 7);
  const startOfThisWeek = startOfWeek(today, { weekStartsOn: 1 });
  const isNextWeek = format(start, 'yyyy-MM-dd') > format(startOfThisWeek, 'yyyy-MM-dd');

  // 1. Fetch active employees
  const { data: employees, error: empErr } = await supabase
      .from('employees')
      .select('id, name, nickname, position, employment_status, is_active')
      .eq('is_active', true)
      .order('name', { ascending: true });

  if (empErr) {
      console.error("Error fetching employees:", empErr);
      return null;
  }

  // Sort employees by position rank (Owner -> Cooking -> Bar & Floor -> Others)
  const getPositionOrder = (position) => {
      const pos = (position || '').toLowerCase().trim();
      if (pos.includes('owner')) return 1;
      if (pos.includes('cook') || pos.includes('kitchen')) return 2;
      if (pos.includes('bar') || pos.includes('floor')) return 3;
      return 4;
  };

  employees.sort((a, b) => {
      const orderA = getPositionOrder(a.position);
      const orderB = getPositionOrder(b.position);
      if (orderA !== orderB) return orderA - orderB;
      return (a.nickname || a.name || '').localeCompare(b.nickname || b.name || '', 'th');
  });

  // 2. Fetch rosters for the 7 days in a single batch query
  const dateStrings = [];
  const daysHeader = [];
  const shortDays = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

  for (let i = 0; i < 7; i++) {
      const currentDay = addDays(start, i);
      const dateStr = format(currentDay, 'yyyy-MM-dd');
      dateStrings.push(dateStr);
      daysHeader.push({
          day: shortDays[currentDay.getDay()],
          date: format(currentDay, 'dd/MM')
      });
  }

  const [txRes, leaveRes] = await Promise.all([
      supabase
          .from('roster_transactions')
          .select(`
              employee_id,
              date,
              is_off,
              slot_type,
              custom_start_time,
              custom_end_time,
              shifts(id, name, start_time, end_time)
          `)
          .in('date', dateStrings)
          .eq('status', 'PUBLISHED'),
      supabase
          .from('leave_requests')
          .select('id, employee_id, leave_date, leave_type, reason, status')
          .in('leave_date', dateStrings)
          .eq('status', 'approved')
  ]);

  const transactions = txRes.data;
  const weekLeaves = leaveRes.data;

  // Map transactions and leave requests by employee_id and date
  const txMap = {}; // employee_id -> dateStr -> tx
  const leaveMap = {}; // employee_id -> dateStr -> leaveObj
  employees.forEach(emp => {
      txMap[emp.id] = {};
      leaveMap[emp.id] = {};
  });

  if (transactions) {
      transactions.forEach(tx => {
          if (txMap[tx.employee_id]) {
              txMap[tx.employee_id][tx.date] = tx;
          }
      });
  }

  if (weekLeaves) {
      weekLeaves.forEach(l => {
          if (leaveMap[l.employee_id]) {
              leaveMap[l.employee_id][l.leave_date] = l;
          }
      });
  }

  // 3. Build roster map: employeeId -> dateStr -> shift info
  const rosterMap = {};
  employees.forEach(emp => {
      rosterMap[emp.id] = {};
      dateStrings.forEach(dateStr => {
          const tx = txMap[emp.id]?.[dateStr];
          if (!tx || tx.is_off) {
              rosterMap[emp.id][dateStr] = { is_off: true, shift: { name: 'OFF' } };
          } else {
              const shiftData = tx.shifts ? { ...tx.shifts } : { name: "Custom Shift" };
              if (tx.custom_start_time) shiftData.start_time = tx.custom_start_time;
              if (tx.custom_end_time) shiftData.end_time = tx.custom_end_time;

              if (shiftData.name === "Custom Shift" && shiftData.start_time && shiftData.end_time) {
                  const startClean = shiftData.start_time.slice(0, 5);
                  const endClean = shiftData.end_time.slice(0, 5);
                  if (startClean === '12:30' && endClean === '23:30') {
                      shiftData.name = 'ผู้ช่วยครัว';
                  } else if (startClean === '18:00' && endClean === '22:30') {
                      shiftData.name = 'INTHEHAUS';
                  } else if (startClean === '10:00' && endClean === '20:30') {
                      shiftData.name = 'CHEF';
                  } else if (startClean === '12:00' && endClean === '20:00') {
                      shiftData.name = 'กลางกะ';
                  }
              }

              rosterMap[emp.id][dateStr] = {
                  is_off: false,
                  shift: shiftData
              };
          }
      });
  });

  // Separate employees into working vs off/on-leave all week
  const workingEmployees = [];
  const offOrLeaveEmployees = [];

  employees.forEach(emp => {
      const workingDaysCount = dateStrings.filter(d => !rosterMap[emp.id][d]?.is_off).length;
      const isSuspended = emp.employment_status === 'Suspended';

      if (workingDaysCount > 0 && !isSuspended) {
          workingEmployees.push(emp);
      } else {
          offOrLeaveEmployees.push(emp);
      }
  });

  // Helper function to build a Flex Bubble for working employees
  const buildBubbleForEmployees = (empGroup, offGroup = []) => {
      const headerContents = [
          {
              type: 'text',
              text: 'พนักงาน\n/ตำแหน่ง',
              flex: 2,
              size: '10px',
              weight: 'bold',
              color: BRAND.neutral,
              wrap: true,
              align: 'start',
              gravity: 'center'
          }
      ];

      daysHeader.forEach(dh => {
          headerContents.push({
              type: 'box',
              layout: 'vertical',
              flex: 1,
              paddingTop: '4px',
              paddingBottom: '4px',
              paddingStart: '0px',
              paddingEnd: '0px',
              contents: [
                  {
                      type: 'text',
                      text: `${dh.day}\n${dh.date}`,
                      size: '9px',
                      weight: 'bold',
                      color: BRAND.neutral,
                      wrap: true,
                      align: 'center',
                      gravity: 'center',
                      lineSpacing: '2px'
                  }
              ]
          });
      });

      const rows = [
          {
              type: 'box',
              layout: 'horizontal',
              contents: headerContents,
              paddingBottom: '8px',
              alignItems: 'center',
              spacing: 'xs',
              borderWidth: 'none',
              borderColor: BRAND.rule
          },
          {
              type: 'separator',
              color: BRAND.rule
          }
      ];

      empGroup.forEach(emp => {
          const empRowContents = [
              {
                  type: 'text',
                  text: `${emp.nickname || emp.name}\n${(emp.position || 'ทั่วไป').toUpperCase()}`,
                  flex: 2,
                  size: '10px',
                  weight: 'bold',
                  color: BRAND.charcoal,
                  wrap: true,
                  align: 'start',
                  gravity: 'center',
                  lineSpacing: '2px'
              }
          ];

          dateStrings.forEach(dateStr => {
              const empShift = rosterMap[emp.id][dateStr];
              const isOff = !empShift || empShift.is_off;
              const leaveReq = leaveMap[emp.id]?.[dateStr];
              const cell = getCellColorsAndLabels(empShift?.shift, isOff, leaveReq);

              empRowContents.push({
                  type: 'box',
                  layout: 'vertical',
                  flex: 1,
                  backgroundColor: cell.bg,
                  cornerRadius: 'sm',
                  borderWidth: 'light',
                  borderColor: cell.borderColor,
                  paddingTop: '4px',
                  paddingBottom: '4px',
                  paddingStart: '0px',
                  paddingEnd: '0px',
                  contents: [
                      {
                          type: 'text',
                          text: `${cell.label}\n${cell.timeLine1}${cell.timeLine2 ? '\n' + cell.timeLine2 : ''}`,
                          wrap: true,
                          align: 'center',
                          gravity: 'center',
                          size: '8px',
                          weight: 'bold',
                          color: cell.textColor,
                          lineSpacing: '2px'
                      }
                  ]
              });
          });

          rows.push({
              type: 'box',
              layout: 'horizontal',
              contents: empRowContents,
              paddingTop: '8px',
              paddingBottom: '8px',
              alignItems: 'center',
              spacing: 'xs'
          });
          rows.push({
              type: 'separator',
              color: BRAND.rule
          });
      });

      if (rows.length > 0 && rows[rows.length - 1].type === 'separator') {
          rows.pop();
      }

      // Compact summary bar for employees on leave / vacation / suspended / off all week
      let offGroupContents = null;
      if (offGroup && offGroup.length > 0) {
          const summaryItems = [
              { type: 'separator', color: BRAND.rule, margin: 'md' },
              {
                  type: 'text',
                  text: 'พักงาน ลาหยุด หรือพักร้อนสัปดาห์นี้',
                  weight: 'bold',
                  size: '10px',
                  color: BRAND.muted,
                  margin: 'sm',
                  wrap: true
              }
          ];

          offGroup.forEach(emp => {
              const empLeaves = (weekLeaves || []).filter(l => l.employee_id === emp.id);
              let statusText = 'หยุดทั้งสัปดาห์';
              let statusColor = BRAND.neutral;

              if (emp.employment_status === 'Suspended') {
                  statusText = 'พักงาน';
                  statusColor = BRAND.charcoal;
              } else if (emp.employment_status === 'Vacation') {
                  statusText = 'พักร้อน';
                  statusColor = BRAND.plum;
              } else if (empLeaves.length > 0) {
                  const types = Array.from(new Set(empLeaves.map(l => {
                      if (l.leave_type === 'vacation') return 'พักร้อน';
                      if (l.leave_type === 'sick') return 'ลาป่วย';
                      if (l.leave_type === 'business') return 'ลากิจ';
                      return 'ลาหยุด';
                  }))).join(', ');

                  const datesSorted = empLeaves.map(l => l.leave_date).sort();
                  const firstDate = format(parseISO(datesSorted[0]), 'dd/MM');
                  const lastDate = format(parseISO(datesSorted[datesSorted.length - 1]), 'dd/MM');
                  const dateRangeStr = datesSorted.length > 1 ? `${firstDate} - ${lastDate}` : firstDate;

                  statusText = `ลา (${types}) ${dateRangeStr}`;
                  statusColor = BRAND.plum;
              }

              summaryItems.push({
                  type: 'box',
                  layout: 'horizontal',
                  backgroundColor: BRAND.paper2,
                  cornerRadius: 'sm',
                  paddingTop: '4px',
                  paddingBottom: '4px',
                  paddingStart: '8px',
                  paddingEnd: '8px',
                  margin: 'xs',
                  alignItems: 'center',
                  contents: [
                      {
                          type: 'text',
                          text: `${emp.nickname || emp.name} (${emp.position || 'ทั่วไป'})`,
                          size: '10px',
                          weight: 'bold',
                          color: BRAND.charcoal,
                          flex: 4,
                          wrap: true
                      },
                      {
                          type: 'text',
                          text: statusText,
                          size: '9px',
                          weight: 'bold',
                          color: statusColor,
                          align: 'end',
                          flex: 5,
                          wrap: true
                      }
                  ]
              });
          });

          offGroupContents = {
              type: 'box',
              layout: 'vertical',
              contents: summaryItems,
              spacing: 'xs'
          };
      }

      const bodyContents = [
          {
              type: 'box',
              layout: 'vertical',
              contents: rows,
              spacing: 'xs'
          }
      ];

      if (offGroupContents) {
          bodyContents.push(offGroupContents);
      }

      return {
          type: 'bubble',
          size: 'mega',
          styles: {
              body: { backgroundColor: BRAND.cream }
          },
          header: {
              type: 'box',
              layout: 'vertical',
              paddingAll: '16px',
              backgroundColor: BRAND.plum,
              contents: [
                  {
                      type: 'text',
                      text: isNextWeek ? 'ตารางงานสัปดาห์หน้า' : 'ตารางงานสัปดาห์นี้',
                      weight: 'bold',
                      size: 'md',
                      color: BRAND.cream
                  },
                  {
                      type: 'text',
                      text: `${daysHeader[0].date} - ${daysHeader[daysHeader.length - 1].date}`,
                      size: 'xs',
                      color: BRAND.onPlum2,
                      margin: 'xs'
                  }
              ]
          },
          body: {
              type: 'box',
              layout: 'vertical',
              paddingAll: '12px',
              spacing: 'md',
              contents: bodyContents
          }
      };
  };

  // 4. Split working employees into chunks if more than 8 to stay safe from the 150-element limit
  const chunkSize = 5;
  const bubbles = [];
  const targetList = workingEmployees.length > 0 ? workingEmployees : employees;

  if (targetList.length <= 8) {
      bubbles.push(buildBubbleForEmployees(targetList, offOrLeaveEmployees));
  } else {
      for (let i = 0; i < targetList.length; i += chunkSize) {
          const chunk = targetList.slice(i, i + chunkSize);
          const isLastChunk = i + chunkSize >= targetList.length;
          bubbles.push(buildBubbleForEmployees(chunk, isLastChunk ? offOrLeaveEmployees : []));
      }
  }

  const flexMsg = {
      type: 'flex',
      altText: isNextWeek ? 'ตารางงานสัปดาห์หน้า' : 'ตารางงานสัปดาห์นี้',
      contents: bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles }
  };

  return flexMsg;
}

// The daily roster card answers only an explicit request ("ตารางงาน", "เช็คตาราง พรุ่งนี้",
// "yuzu ขอตารางงานวันนี้", "roster"), not a sentence that happens to contain the word.
const ROSTER_KEYWORDS = ['เช็คตารางงาน', 'เช็คตาราง', 'ตารางงาน', 'roster', 'ใครเข้ากะ'];
const ROSTER_TAIL = /^(วันนี้|พรุ่งนี้|today|tomorrow|หน่อย|บ้าง|ครับ|คับ|ค่ะ|คะ|นะ|จ้า|[\s?!.])*$/;

export function isRosterQuery(text) {
  const cmd = text.trim().replace(/^@?(yuzu|ยูซุ)\s*/, '').replace(/^(ขอ|ดู)\s*/, '');
  const keyword = ROSTER_KEYWORDS.find(k => cmd.startsWith(k));
  return !!keyword && ROSTER_TAIL.test(cmd.slice(keyword.length));
}

export async function handleRosterCommand(event, client, text, rawText, userId) {
  const isAutoGenCommand = text.includes('จัดตารางสัปดาห์หน้า') || 
                           text.includes('สร้างตารางสัปดาห์หน้า') || 
                           text.includes('สร้างตารางอัตโนมัติ') ||
                           text.includes('จัดตารางอัตโนมัติ') ||
                           text === 'auto roster' ||
                           text === 'autogenerate roster';

  if (isAutoGenCommand) {
    const isBoss = await checkIsBoss(userId);
    if (!isBoss) {
      await client.replyMessage(event.replyToken, { type: 'text', text: 'ขออภัยครับ คำสั่งจัดตารางงานอัตโนมัติสงวนสิทธิ์เฉพาะผู้บริหาร (บอส) เท่านั้นครับ' });
      return true;
    }

    // Overwrites next week's roster, so ask first; the confirm_roster postback generates it.
    try {
      const { targetMon, targetSun } = nextRosterWeek();
      const payload = { type: 'AUTO_GENERATE', start_date: format(targetMon, 'yyyy-MM-dd') };
      const postbackData = await buildPayloadPostbackData('confirm_roster', payload, userId);
      await client.replyMessage(event.replyToken, postbackData
        ? buildRosterConfirmMessage(autoGenerateSummaryText(targetMon, targetSun), true, postbackData)
        : { type: 'text', text: PAYLOAD_TOO_LONG_TEXT });
      return true;
    } catch (err) {
      console.error('Auto Roster confirm card error in LINE command:', err);
      await client.replyMessage(event.replyToken, { type: 'text', text: 'เตรียมจัดตารางอัตโนมัติไม่สำเร็จ ลองใหม่อีกครั้งครับ' });
      return true;
    }
  }

  if (text === 'stcalendar' || text === 'ตารางทั้งสัปดาห์' || text === 'วีคนี้' || text.includes('calendar')) {
    const today = addHours(new Date(), 7);
    const tomorrow = addDays(today, 1);
    const start = startOfWeek(tomorrow, { weekStartsOn: 1 }); // Monday of tomorrow's week
    
    const flexMsg = await generateStCalendarFlex(start);
    if (!flexMsg) {
        await client.replyMessage(event.replyToken, { type: 'text', text: 'เกิดข้อผิดพลาดในการดึงข้อมูลตารางงานจากระบบครับ' });
        return true;
    }

    await client.replyMessage(event.replyToken, flexMsg);
    return true;
  }

  if (isRosterQuery(text)) {
    const targetDate = text.includes('พรุ่งนี้') ? startOfTomorrow() : addHours(new Date(), 7);
    const dateStr = format(targetDate, 'dd/MM/yyyy');
    const roster = await getEffectiveRoster(targetDate);

    if (roster.length === 0) {
      await client.replyMessage(event.replyToken, { type: 'text', text: `📅 ตารางงานวันที่ ${dateStr}\n\nยังไม่มีรายงานการลงเวลาเข้างานของทีมงานในระบบครับ` });
    } else {
      const contents = [];
      const STATUS_LABEL = { PENDING: 'ยังไม่เข้า', IN: 'เข้าแล้ว', LATE: 'สาย', OUT: 'ออกแล้ว' };

      roster.forEach((emp, idx) => {
        const shiftStart = emp.shift?.start_time?.slice(0,5);
        const shiftEnd = emp.shift?.end_time?.slice(0,5);

        let statusTag = 'PENDING';
        let statusColor = BRAND.neutral;
        let actualTimeStr = "";

        if (emp.attendance?.check_in) {
          statusTag = 'IN';
          statusColor = BRAND.plum;
          actualTimeStr = format(addHours(new Date(emp.attendance.check_in), 7), "HH:mm");

          if (shiftStart && minutesAfter(actualTimeStr, shiftStart) > LATE_GRACE_MINUTES) {
            statusColor = BRAND.errorRed;
            statusTag = 'LATE';
          }
        }
        if (emp.attendance?.check_out) {
          statusTag = 'OUT';
          statusColor = BRAND.neutral;
        }

        if (idx > 0) contents.push({ type: 'separator', margin: 'md', color: BRAND.rule });
        contents.push({
          type: 'box', layout: 'horizontal', margin: 'md',
          contents: [
            { type: 'text', text: STATUS_LABEL[statusTag], flex: 2, size: 'xs', weight: 'bold', color: statusColor },
            { type: 'text', text: `${emp.nickname || emp.name || '-'}`, flex: 3, size: 'xs', weight: 'bold', color: BRAND.charcoal, wrap: true },
            { type: 'text', text: emp.shift?.name || 'Custom', flex: 2, size: 'xxs', color: BRAND.neutral, align: 'center', wrap: true },
            { type: 'text', text: emp.is_off ? 'หยุด' : actualTimeStr ? `${actualTimeStr} (${shiftStart || '-'})` : (shiftStart && shiftEnd ? `${shiftStart}-${shiftEnd}` : '-'), flex: 3, size: 'xs', align: 'end', color: (statusTag === 'LATE') ? BRAND.errorRed : (emp.isOverride ? BRAND.plum : BRAND.charcoal) }
          ]
        });
      });

      await client.replyMessage(event.replyToken, {
        type: 'flex',
        altText: `ตารางงาน ${dateStr}`,
        contents: {
          type: 'bubble',
          styles: {
            body: { backgroundColor: BRAND.cream }
          },
          header: {
            type: 'box',
            layout: 'vertical',
            paddingAll: '20px',
            backgroundColor: BRAND.plum,
            contents: [
              { type: 'text', text: 'เข้างานวันนี้', weight: 'bold', size: 'md', color: BRAND.cream },
              { type: 'text', text: `วันที่ ${dateStr}`, size: 'xs', color: BRAND.onPlum2, margin: 'xs' }
            ]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            paddingAll: '20px',
            contents: contents
          }
        }
      });
    }
    return true;
  }

  if (text === 'ลางาน') {
    const { data: leaves, error } = await supabase
      .from('leave_requests')
      .select('*, employees!employee_id(name, nickname, position), replacement_employee:employees!replacement_employee_id(name, nickname, position)')
      .eq('status', 'pending')
      .order('leave_date', { ascending: true });

    if (error) {
      console.error('Roster fetch error:', error);
      await client.replyMessage(event.replyToken, { type: 'text', text: 'ดึงข้อมูลไม่สำเร็จ ลองใหม่อีกครั้งครับ' });
      return true;
    }

    if (leaves && leaves.length > 0) {
      const bubbles = leaves.map(l => formatLeaveRequestBubble(l, false, event.source?.type === 'user'));
      const flexMsg = {
        type: 'flex',
        altText: '📋 รายการรออนุมัติลางาน',
        contents: bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles }
      };
      await client.replyMessage(event.replyToken, flexMsg);
    } else {
      const noPendingBubble = {
        type: 'bubble',
        size: 'mega',
        styles: { body: { backgroundColor: BRAND.cream } },
        header: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '20px',
          backgroundColor: BRAND.plum,
          contents: [
            { type: 'text', text: 'คำขอลารออนุมัติ', weight: 'bold', size: 'md', color: BRAND.cream }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '20px',
          contents: [
            {
              type: 'box',
              layout: 'vertical',
              paddingAll: '15px',
              backgroundColor: BRAND.paper2,
              cornerRadius: 'md',
              contents: [
                {
                  type: 'text',
                  text: 'ไม่มีคำขอลาที่รออนุมัติครับ',
                  color: BRAND.plum,
                  weight: 'bold',
                  size: 'sm',
                  align: 'center',
                  wrap: true
                }
              ]
            }
          ]
        }
      };
      await client.replyMessage(event.replyToken, {
        type: 'flex',
        altText: '📋 รายการรออนุมัติลางาน',
        contents: noPendingBubble
      });
    }
    return true;
  }

  if (text === 'ลางานล่าสุด' || text === 'ประวัติลางาน' || text.includes('ลางานล่าสุด') || text.includes('ประวัติลางาน')) {
    const { data: leaves, error } = await supabase
      .from('leave_requests')
      .select('*, employees!employee_id(name, nickname, position), replacement_employee:employees!replacement_employee_id(name, nickname, position)')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.error('Roster fetch error:', error);
      await client.replyMessage(event.replyToken, { type: 'text', text: 'ดึงข้อมูลไม่สำเร็จ ลองใหม่อีกครั้งครับ' });
      return true;
    }

    if (leaves && leaves.length > 0) {
      const bubbles = leaves.map(l => formatLeaveRequestBubble(l, true, event.source?.type === 'user'));
      const flexMsg = {
        type: 'flex',
        altText: '📋 ประวัติการลาหยุดล่าสุด',
        contents: bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles }
      };
      await client.replyMessage(event.replyToken, flexMsg);
    } else {
      const noHistoryBubble = {
        type: 'bubble',
        size: 'mega',
        styles: { body: { backgroundColor: BRAND.cream } },
        header: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '20px',
          backgroundColor: BRAND.plum,
          contents: [
            { type: 'text', text: 'ประวัติการลาล่าสุด', weight: 'bold', size: 'md', color: BRAND.cream }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '20px',
          contents: [
            {
              type: 'box',
              layout: 'vertical',
              paddingAll: '15px',
              backgroundColor: BRAND.paper2,
              cornerRadius: 'md',
              contents: [
                {
                  type: 'text',
                  text: 'ยังไม่มีประวัติการลาในระบบครับ',
                  color: BRAND.neutral,
                  weight: 'bold',
                  size: 'sm',
                  align: 'center',
                  wrap: true
                }
              ]
            }
          ]
        }
      };
      await client.replyMessage(event.replyToken, {
        type: 'flex',
        altText: '📋 ประวัติการลาหยุดล่าสุด',
        contents: noHistoryBubble
      });
    }
    return true;
  }


  return false;
}

export async function handleRosterPostback(event, client, action, queryParams, userId, groupId) {
  if (action === 'confirm_roster') {
    try {
      const payload = await readPostbackPayload(queryParams);
      if (!payload) {
        await client.replyMessage(event.replyToken, { type: 'text', text: 'ไม่พบข้อมูลคำขอนี้แล้วครับ รบกวนส่งคำขอใหม่อีกครั้งครับ' });
        return true;
      }
      const isBoss = await checkIsBoss(userId);

      if (payload.type === 'AUTO_GENERATE') {
        if (!isBoss) {
          await client.replyMessage(event.replyToken, { type: 'text', text: 'ขออภัยครับ การดำเนินการนี้สงวนสิทธิ์เฉพาะผู้บริหาร (บอส) เท่านั้นครับ' });
          return true;
        }
        const { autoGenerateWeeklyRoster } = await import('../../../../utils/roster_auto_learner');
        // Use the week shown on the card (start_date), not whatever "next week" is at tap time.
        const { targetMon, targetSun } = nextRosterWeek(payload.start_date);
        const genResult = await autoGenerateWeeklyRoster({
          startDate: targetMon,
          endDate: targetSun,
          overwrite: true,
          applyLeaves: true,
          syncTemplate: true,
          client: supabase
        });
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `🤖 ยูซุจัดตารางสัปดาห์หน้า (${format(targetMon, 'dd/MM')} - ${format(targetSun, 'dd/MM')}) เรียบร้อยแล้วครับ!\n\n• จัดกะงานทั้งหมด: ${genResult.totalSlots} กะ\n• นำเข้าใบลาอนุมัติ: ${genResult.leavesApplied.length} รายการ\n• บันทึกเป็นแบบร่าง (Draft) ในระบบแล้วครับ\n\nบอสสามารถเข้าไปดูและปรับแก้บางจุดบนเว็บได้เลยครับ:\nhttps://inthehaus-hr.vercel.app/admin/roster`
        });
        return true;
      }
      
      let targetEmpId = null;
      let targetNickname = payload.employee_name;

      if (isBoss && payload.employee_name) {
        const { data: targetEmp } = await supabase.from('employees').select('id, nickname').ilike('nickname', `%${payload.employee_name}%`).limit(1).maybeSingle();
        targetEmpId = targetEmp?.id;
      }

      // A boss acts on someone else's row: never fall back to the boss's own row.
      const bossSwapWithoutShift = isBoss && payload.type === 'SWAP' &&
        !payload.details?.shift_id && !payload.details?.start_time && !payload.details?.end_time;
      if (isBoss && (!targetEmpId || bossSwapWithoutShift)) {
        await client.replyMessage(event.replyToken, { type: 'text', text: 'ยูซุระบุพนักงานหรือกะที่จะเปลี่ยนจากคำขอนี้ไม่ได้ครับ รบกวนส่งคำขอใหม่อีกครั้ง พร้อมชื่อพนักงาน วันที่ และกะที่ต้องการครับ' });
        return true;
      }

      if (!targetEmpId) {
        const { data: senderEmp } = await supabase.from('employees').select('id, name, nickname').or(`line_bot_id.eq.${userId},line_user_id.eq.${userId}`).maybeSingle();
        targetEmpId = senderEmp?.id;
        targetNickname = senderEmp?.nickname || senderEmp?.name;
      }
      
      if (!targetEmpId) {
        await client.replyMessage(event.replyToken, { type: 'text', text: 'ไม่พบข้อมูลพนักงานในระบบครับ รบกวนแจ้งผู้บริหาร (บอส) เพื่อทำการลงทะเบียนและผูก Line ID ในระบบก่อนครับ' });
        return true;
      }

      const { data: request, error: reqErr } = await supabase.from('roster_requests').insert({
        type: payload.type,
        requester_id: (await getEmployeeByLineId(userId))?.id || targetEmpId,
        target_date: payload.date,
        reason: payload.reason || payload.details?.note || null,
        new_shift_id: payload.details?.shift_id || null,
        custom_start_time: payload.details?.start_time || null,
        custom_end_time: payload.details?.end_time || null,
        status: isBoss ? 'APPROVED' : 'PENDING',
        manager_id: isBoss ? (await getEmployeeByLineId(userId))?.id : null
      }).select().single();

      if (reqErr) throw reqErr;

      if (isBoss) {
        if (payload.type === 'LEAVE') {
          await supabase.from('roster_transactions').upsert({ employee_id: targetEmpId, date: payload.date, is_off: true, slot_type: 'MAIN', status: 'PUBLISHED' }, { onConflict: 'employee_id, date, slot_type' });
        } else {
          await supabase.from('roster_transactions').upsert({ 
            employee_id: targetEmpId, 
            date: payload.date, 
            shift_id: payload.details?.shift_id || null,
            custom_start_time: payload.details?.start_time || null,
            custom_end_time: payload.details?.end_time || null,
            slot_type: 'MAIN',
            is_off: false,
            status: 'PUBLISHED'
          }, { onConflict: 'employee_id, date, slot_type' });
        }
        await client.replyMessage(event.replyToken, { type: 'text', text: `✅ ดำเนินการอัปเดตตารางเวลาของ "${targetNickname}" เรียบร้อยตามคำสั่งของผู้บริหารแล้วครับ` });
      } else {
        const approvalFlex = {
          type: 'bubble',
          styles: {
            body: { backgroundColor: BRAND.cream },
            footer: { backgroundColor: BRAND.cream }
          },
          header: {
            type: 'box',
            layout: 'vertical',
            paddingAll: '20px',
            backgroundColor: BRAND.plum,
            contents: [
              { type: 'text', text: 'คำขอปรับตารางงาน', color: BRAND.cream, weight: 'bold', size: 'md' },
              { type: 'text', text: 'รอบอสอนุมัติ', color: BRAND.onPlum2, size: 'xs', margin: 'xs' }
            ]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            paddingAll: '20px',
            spacing: 'sm',
            contents: [
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'ผู้ขอ', size: 'sm', color: BRAND.neutral, flex: 1 },
                  { type: 'text', text: targetNickname || '-', size: 'sm', color: BRAND.charcoal, align: 'end', flex: 2, wrap: true }
                ]
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'วันที่', size: 'sm', color: BRAND.neutral, flex: 1 },
                  { type: 'text', text: payload.date || '-', size: 'sm', color: BRAND.charcoal, align: 'end', flex: 2 }
                ]
              },
              { type: 'separator', margin: 'md', color: BRAND.rule },
              {
                type: 'box',
                layout: 'vertical',
                margin: 'md',
                contents: [
                  { type: 'text', text: 'รายละเอียดที่ขอเปลี่ยน', color: BRAND.neutral, size: 'xs', weight: 'bold' },
                  { type: 'text', text: payload.reason || payload.details?.note || '-', size: 'sm', color: BRAND.charcoal, wrap: true, margin: 'xs' }
                ]
              }
            ]
          },
          footer: {
            type: 'box',
            layout: 'horizontal',
            paddingAll: '15px',
            spacing: 'sm',
            contents: [
              { type: 'button', style: 'primary', color: BRAND.charcoal, action: { type: 'postback', label: 'อนุมัติ', data: `action=approve_roster&id=${request.id}` } },
              { type: 'button', style: 'secondary', color: BRAND.paper2, action: { type: 'postback', label: 'ไม่อนุมัติ', data: `action=reject_roster&id=${request.id}` } }
            ]
          }
        };

        await client.replyMessage(event.replyToken, { type: 'text', text: 'รับเรื่องคำขอเรียบร้อยครับ ระบบได้ส่งเรื่องเสนอให้ผู้บริหารพิจารณาอนุมัติเรียบร้อยแล้วครับ' });
        await client.pushMessage(groupId, { type: 'flex', altText: '🔔 คำขอปรับตารางใหม่', contents: approvalFlex });
      }
      return true;
    } catch (e) {
      console.error("Confirm Roster Error:", e);
      await client.replyMessage(event.replyToken, { type: 'text', text: 'ส่งคำขอปรับตารางไม่สำเร็จ ลองใหม่อีกครั้งครับ' });
      return true;
    }
  }

  if (action === 'approve_roster') {
    const requestId = queryParams.get('id');
    const isBoss = await checkIsBoss(userId);

    if (!isBoss) {
       await client.replyMessage(event.replyToken, { type: 'text', text: 'ขออภัยครับ การดำเนินการนี้สงวนสิทธิ์เฉพาะผู้บริหาร (บอส) เท่านั้นครับ' });
       return true;
    }

    const { data: req } = await supabase.from('roster_requests').select('*').eq('id', requestId).single();
    if (req && req.status === 'PENDING') {
      await supabase.from('roster_requests').update({ status: 'APPROVED', manager_id: (await getEmployeeByLineId(userId))?.id }).eq('id', requestId);
      
      if (req.type === 'LEAVE') {
        await supabase.from('roster_transactions').upsert({ employee_id: req.requester_id, date: req.target_date, is_off: true, slot_type: 'MAIN', status: 'PUBLISHED' }, { onConflict: 'employee_id, date, slot_type' });
      } else {
        await supabase.from('roster_transactions').upsert({ 
          employee_id: req.requester_id, 
          date: req.target_date, 
          shift_id: req.new_shift_id,
          custom_start_time: req.custom_start_time,
          custom_end_time: req.custom_end_time,
          is_off: false,
          slot_type: 'MAIN',
          status: 'PUBLISHED'
        }, { onConflict: 'employee_id, date, slot_type' });
      }
      await client.replyMessage(event.replyToken, { type: 'text', text: '✅ การอนุมัติเสร็จสมบูรณ์ ระบบทำการอัปเดตตารางงานเรียบร้อยครับ' });
    }
    return true;
  }

  if (action === 'reject_roster') {
    const requestId = queryParams.get('id');
    if (await checkIsBoss(userId)) {
       await supabase.from('roster_requests').update({ status: 'REJECTED', manager_id: (await getEmployeeByLineId(userId))?.id }).eq('id', requestId);
       await client.replyMessage(event.replyToken, { type: 'text', text: '❌ ปฏิเสธคำขอเรียบร้อยครับ' });
    }
    return true;
  }

  if (action === 'approve_leave' || action === 'reject_leave') {
    const leaveId = queryParams.get('id');
    const isBoss = await checkIsBoss(userId);

    if (!isBoss) {
      await client.replyMessage(event.replyToken, { type: 'text', text: 'ขออภัยครับ การดำเนินการนี้สงวนสิทธิ์เฉพาะผู้บริหาร (บอส) เท่านั้นครับ' });
      return true;
    }

    const newStatus = action === 'approve_leave' ? 'approved' : 'rejected';
    const ids = String(leaveId).split(',').map(Number);

    // 1. ดึงข้อมูลใบลา
    const { data: leaves, error: fetchErr } = await supabase
      .from('leave_requests')
      .select('*, employees!employee_id(name, nickname, position), replacement_employee:employees!replacement_employee_id(name, nickname, position)')
      .in('id', ids);

    if (fetchErr || !leaves || leaves.length === 0) {
      await client.replyMessage(event.replyToken, { type: 'text', text: 'ไม่พบข้อมูลใบลาหยุดดังกล่าวในระบบครับ' });
      return true;
    }

    const pendingLeaves = leaves.filter(l => l.status === 'pending');
    if (pendingLeaves.length === 0) {
      await client.replyMessage(event.replyToken, { type: 'text', text: 'รายการคำขอลาหยุดนี้ได้รับการดำเนินการเสร็จสิ้นไปก่อนหน้านี้แล้วครับ' });
      return true;
    }

    // 2. อัปเดตสถานะใบลา
    const { error: updateErr } = await supabase
      .from('leave_requests')
      .update({ status: newStatus })
      .in('id', pendingLeaves.map(l => l.id));

    if (updateErr) {
      console.error('Leave status update error:', updateErr);
      await client.replyMessage(event.replyToken, { type: 'text', text: 'อัปเดตสถานะการลาไม่สำเร็จ ลองใหม่อีกครั้งครับ' });
      return true;
    }

    // 3. ถ้าอนุมัติ ให้ทำ roster_transactions และ roster_overrides
    if (newStatus === 'approved') {
      for (const req of pendingLeaves) {
        // 3.1 Mark leaving employee as OFF
        await supabase.from('roster_overrides').upsert({
          employee_id: req.employee_id,
          date: req.leave_date,
          is_off: true
        });

        await supabase.from('roster_transactions').upsert({
          employee_id: req.employee_id,
          date: req.leave_date,
          is_off: true,
          slot_type: 'MAIN',
          status: 'PUBLISHED'
        }, { onConflict: 'employee_id, date, slot_type' });

        // 3.2 If there is a replacement, assign the leaving employee's shift to them
        if (req.replacement_employee_id) {
          let originalShiftId = null;
          let originalStart = null;
          let originalEnd = null;

          // Query original shift from roster_transactions
          const { data: tx } = await supabase
            .from('roster_transactions')
            .select('shift_id, custom_start_time, custom_end_time')
            .eq('employee_id', req.employee_id)
            .eq('date', req.leave_date)
            .eq('slot_type', 'MAIN')
            .eq('status', 'PUBLISHED')
            .eq('is_off', false)
            .maybeSingle();

          if (tx && tx.shift_id) {
            originalShiftId = tx.shift_id;
            originalStart = tx.custom_start_time;
            originalEnd = tx.custom_end_time;
          } else {
            // Fallback: Check template schedule
            const dayOfWeek = new Date(req.leave_date).getDay();
            const { data: sched } = await supabase
              .from('employee_schedules')
              .select('shift_id')
              .eq('employee_id', req.employee_id)
              .eq('day_of_week', dayOfWeek)
              .eq('is_off', false)
              .maybeSingle();

            if (sched && sched.shift_id) {
              originalShiftId = sched.shift_id;
              const { data: shiftObj } = await supabase
                .from('shifts')
                .select('start_time, end_time')
                .eq('id', sched.shift_id)
                .single();
              if (shiftObj) {
                originalStart = shiftObj.start_time;
                originalEnd = shiftObj.end_time;
              }
            }
          }

          if (originalShiftId) {
            await supabase.from('roster_overrides').upsert({
              employee_id: req.replacement_employee_id,
              date: req.leave_date,
              shift_id: originalShiftId,
              is_off: false,
              custom_start_time: originalStart,
              custom_end_time: originalEnd
            });

            await supabase.from('roster_transactions').upsert({
              employee_id: req.replacement_employee_id,
              date: req.leave_date,
              shift_id: originalShiftId,
              is_off: false,
              custom_start_time: originalStart,
              custom_end_time: originalEnd,
              slot_type: 'MAIN',
              status: 'PUBLISHED'
            }, { onConflict: 'employee_id, date, slot_type' });
          }
        }
      }
    }

    // 4. ส่งข้อความอัปเดตและแจ้งเตือนเข้ากลุ่ม
    const sampleReq = pendingLeaves[0];
    const name = sampleReq.employees?.nickname || sampleReq.employees?.name || 'พนักงาน';
    const isApproved = newStatus === 'approved';
    const title = isApproved ? 'อนุมัติการลาแล้ว' : 'ไม่อนุมัติการลา';
    // approved: plum header; rejected: red header (a rejection is the one state that needs attention)
    const headerBg = isApproved ? BRAND.plum : BRAND.errorRed;
    const typeText = sampleReq.leave_type === 'sick' ? 'ลาป่วย' : sampleReq.leave_type === 'business' ? 'ลากิจ' : 'พักร้อน';

    // เรียงวันที่ทั้งหมดที่อนุมัติ/ปฏิเสธ
    const datesStr = pendingLeaves.map(l => l.leave_date).join(', ');
    const repEmp = sampleReq.replacement_employee;
    const replacementName = repEmp ? `${repEmp.name} (${repEmp.nickname || "-"})` : "-";

    const row = (label, value, extra = {}) => ({
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: label, color: BRAND.neutral, size: 'sm', flex: 2 },
        { type: 'text', text: value || '-', color: BRAND.charcoal, size: 'sm', flex: 4, wrap: true, align: 'end', ...extra }
      ]
    });

    const message = {
      type: 'flex',
      altText: `ผลการขอลา: ${isApproved ? 'อนุมัติ' : 'ไม่อนุมัติ'}`,
      contents: {
        type: 'bubble',
        size: 'kilo',
        styles: {
          body: { backgroundColor: BRAND.cream }
        },
        header: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '20px',
          backgroundColor: headerBg,
          contents: [
            { type: 'text', text: title, weight: 'bold', size: 'md', color: BRAND.cream }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '20px',
          spacing: 'sm',
          contents: [
            row('พนักงาน', name, { weight: 'bold' }),
            row('วันที่', datesStr),
            row('ประเภท', typeText),
            row('คนแทน', replacementName)
          ]
        }
      }
    };

    await client.replyMessage(event.replyToken, { type: 'text', text: `ยูซุดำเนินการ${isApproved ? 'อนุมัติ' : 'ปฏิเสธ'}คำขอลาหยุดของ ${name} เรียบร้อยแล้วครับ` });

    // ส่งเข้าทุกกลุ่ม
    const GROUP_IDS = [
      'C1210c7a0601b5a675060e312efe10bff',
      'C71db3c7339b11f43dc8f1ec34bf46f43'
    ];
    await Promise.all(
      GROUP_IDS.map(groupId => client.pushMessage(groupId, [message]))
    );

    return true;
  }

  if (action === 'cancel_roster') {
    await client.replyMessage(event.replyToken, { type: 'text', text: 'ยกเลิกการทำรายการเรียบร้อยครับ' });
    return true;
  }

  return false;
}
