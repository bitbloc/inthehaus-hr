import { format, addHours, startOfTomorrow, parseISO, startOfWeek, addDays } from 'date-fns';
import { getEffectiveRoster } from '../../../../utils/roster';
import { getEmployeeByLineId, checkIsBoss } from '../../../../utils/memory';
import { supabase } from '../../../../lib/supabaseClient';

function getShiftColorHex(shiftName, isOff, isCustomOrExtra) {
  if (isOff) return '#dc2626'; // Red
  
  const name = (shiftName || '').toLowerCase();
  
  // If it's custom/extra but matches one of our presets, it's not generic custom
  const isPreset = name.includes('ผู้ช่วยครัว') || name.includes('chef') || name.includes('inthehaus') || name.includes('กลางกะ');
  const actualCustomOrExtra = isCustomOrExtra && !isPreset;

  if (actualCustomOrExtra) return '#0284c7'; // Sky/Teal
  
  if (name.includes('ควบ') || name.includes('double')) {
    return '#e11d48'; // Rose
  }
  if (name.includes('ค่ำ') || name.includes('ดึก') || name.includes('night') || name.includes('evening') || name.includes('กลาง')) {
    return '#4f46e5'; // Indigo
  }
  if (name.includes('เช้า') || name.includes('morning')) {
    return '#d97706'; // Amber
  }
  if (name.includes('chef')) {
    return '#15803d'; // Green
  }
  if (name.includes('inthehaus')) {
    return '#ea580c'; // Orange
  }
  if (name.includes('ผู้ช่วยครัว')) {
    return '#9c4221'; // Brown/Orange
  }
  return '#ca8a04'; // Yellow
}

function getCellColorsAndLabels(empShift, isOff) {
  if (isOff || !empShift || empShift.name === 'OFF') {
    return {
      bg: '#FFF5F5',
      borderColor: '#FEB2B2',
      textColor: '#C53030',
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
    return {
      bg: '#FFFDF5',
      borderColor: '#FEF08A',
      textColor: '#B45309',
      label: 'เช้า',
      timeLine1: start,
      timeLine2: end
    };
  }
  if (name.includes('ค่ำ') || name.includes('ดึก') || (start === '16:30' && end === '00:30')) {
    return {
      bg: '#1A202C',
      borderColor: '#2D3748',
      textColor: '#FFFFFF',
      label: 'ค่ำ',
      timeLine1: start,
      timeLine2: end
    };
  }
  if (name.includes('ควบ') || (start === '10:00' && end === '00:30')) {
    return {
      bg: '#FFF5F5',
      borderColor: '#FEB2B2',
      textColor: '#E11D48',
      label: 'ควบ',
      timeLine1: start,
      timeLine2: end
    };
  }
  if (name.toLowerCase().includes('haus') || (start === '18:00' && end === '22:30')) {
    return {
      bg: '#FFFFFF',
      borderColor: '#FDBA74',
      textColor: '#EA580C',
      label: 'HAUS',
      timeLine1: start,
      timeLine2: end
    };
  }
  if (name.toLowerCase().includes('chef') || (start === '10:00' && end === '20:30')) {
    return {
      bg: '#F0FDF4',
      borderColor: '#BBF7D0',
      textColor: '#15803D',
      label: 'CHEF',
      timeLine1: start,
      timeLine2: end
    };
  }
  if (name.includes('ผู้ช่วยครัว') || (start === '12:30' && end === '23:30')) {
    return {
      bg: '#FDF6E2',
      borderColor: '#FDE8C4',
      textColor: '#9C4221',
      label: 'ครัว',
      timeLine1: start,
      timeLine2: end
    };
  }
  if (name.includes('กลาง') || (start === '12:00' && end === '20:00')) {
    return {
      bg: '#1A202C',
      borderColor: '#2D3748',
      textColor: '#FFFFFF',
      label: 'กลาง',
      timeLine1: start,
      timeLine2: end
    };
  }

  // Fallback for custom shifts
  return {
    bg: '#E0F2FE',
    borderColor: '#BAE6FD',
    textColor: '#0369A1',
    label: name.slice(0, 8),
    timeLine1: start,
    timeLine2: end
  };
}

function formatLeaveRequestBubble(l, isHistory = false) {
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

  // Status style config
  let statusLabel = 'PENDING';
  let statusColor = '#ef6c00';
  if (l.status === 'approved') {
    statusLabel = 'APPROVED';
    statusColor = '#2e7d32';
  } else if (l.status === 'rejected') {
    statusLabel = 'REJECTED';
    statusColor = '#c62828';
  }

  const bubble = {
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
              text: isHistory ? 'LEAVE REGISTRY RECORD' : 'LEAVE REGISTRY REQUEST',
              weight: 'bold',
              size: 'sm',
              color: '#1c1c1c',
              flex: 1
            },
            {
              type: 'text',
              text: statusLabel,
              color: statusColor,
              weight: 'bold',
              size: 'xs',
              align: 'end'
            }
          ]
        },
        {
          type: 'text',
          text: `APPLICANT: ${empName.toUpperCase()} // ${empPosition.toUpperCase()}`,
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
      spacing: 'sm',
      contents: [
        { type: 'separator', color: '#cccccc' },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: 'DATE', color: '#666666', size: 'xs', flex: 3 },
            { type: 'text', text: dateStr, color: '#1c1c1c', size: 'xs', flex: 5, weight: 'bold', align: 'end' }
          ]
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: 'CLASSIFICATION', color: '#666666', size: 'xs', flex: 3 },
            { type: 'text', text: typeText, color: '#1c1c1c', size: 'xs', flex: 5, align: 'end' }
          ]
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: 'REPLACEMENT', color: '#666666', size: 'xs', flex: 3 },
            { type: 'text', text: replacementName, color: '#1c1c1c', size: 'xs', flex: 5, wrap: true, align: 'end' }
          ]
        },
        {
          type: 'box',
          layout: 'vertical',
          margin: 'md',
          contents: [
            { type: 'text', text: 'REASON FOR ABSENCE', color: '#666666', size: 'xxs', weight: 'bold' },
            { type: 'text', text: reasonText, color: '#333333', size: 'xs', wrap: true, margin: 'xs' }
          ]
        }
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
          color: '#1c1c1c',
          action: {
            type: 'postback',
            label: 'APPROVE',
            data: `action=approve_leave&id=${l.id}`
          }
        },
        {
          type: 'button',
          style: 'secondary',
          action: {
            type: 'postback',
            label: 'REJECT',
            data: `action=reject_leave&id=${l.id}`
          }
        }
      ]
    };
  }

  return bubble;
}

export async function handleRosterCommand(event, client, text, rawText, userId) {
  if (text === 'stcalendar' || text === 'ตารางทั้งสัปดาห์' || text === 'วีคนี้' || text.includes('calendar')) {
    const today = addHours(new Date(), 7);
    const todayDateStr = format(today, 'yyyy-MM-dd');
    const startOfThisWeek = startOfWeek(today, { weekStartsOn: 1 });
    const tomorrow = addDays(today, 1);
    const start = startOfWeek(tomorrow, { weekStartsOn: 1 }); // Monday of tomorrow's week
    const isNextWeek = format(start, 'yyyy-MM-dd') > format(startOfThisWeek, 'yyyy-MM-dd');
    
    // 1. Fetch active employees
    const { data: employees, error: empErr } = await supabase
        .from('employees')
        .select('id, name, nickname, position')
        .eq('is_active', true)
        .order('name', { ascending: true });

    if (empErr) {
        console.error("Error fetching employees:", empErr);
        await client.replyMessage(event.replyToken, { type: 'text', text: 'เมี๊ยว~ เกิดข้อผิดพลาดในการดึงข้อมูลพนักงานค่ะ' });
        return true;
    }

    // 2. Fetch rosters for the 7 days
    const weeklyRosters = {}; // dateStr -> roster list
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

        const roster = await getEffectiveRoster(currentDay);
        weeklyRosters[dateStr] = roster;
    }

    // 3. Build roster map: employeeId -> dateStr -> shift info
    const rosterMap = {};
    employees.forEach(emp => {
        rosterMap[emp.id] = {};
        dateStrings.forEach(dateStr => {
            const empShift = weeklyRosters[dateStr].find(r => r.id === emp.id);
            rosterMap[emp.id][dateStr] = empShift || null;
        });
    });

    // Helper function to build a Flex Bubble for a group of employees
    const buildBubbleForEmployees = (empGroup) => {
        const headerContents = [
            {
                type: 'text',
                text: 'พนักงาน\n/ตำแหน่ง',
                flex: 2.2,
                size: '10px',
                weight: 'bold',
                color: '#666666',
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
                        color: '#666666',
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
                borderColor: '#e2e8f0'
            },
            {
                type: 'separator',
                color: '#e2e8f0'
            }
        ];

        empGroup.forEach(emp => {
            const empRowContents = [
                {
                    type: 'text',
                    text: `${emp.nickname || emp.name}\n${(emp.position || 'ทั่วไป').toUpperCase()}`,
                    flex: 2.2,
                    size: '10px',
                    weight: 'bold',
                    color: '#1A202C',
                    wrap: true,
                    align: 'start',
                    gravity: 'center',
                    lineSpacing: '2px'
                }
            ];

            dateStrings.forEach(dateStr => {
                const empShift = rosterMap[emp.id][dateStr];
                const isOff = !empShift || empShift.is_off;
                const cell = getCellColorsAndLabels(empShift?.shift, isOff);

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
                color: '#f1f5f9'
            });
        });

        if (rows.length > 0 && rows[rows.length - 1].type === 'separator') {
            rows.pop();
        }

        return {
            type: 'bubble',
            size: 'mega',
            body: {
                type: 'box',
                layout: 'vertical',
                paddingAll: '12px',
                spacing: 'md',
                contents: [
                    {
                        type: 'text',
                        text: isNextWeek ? '📅 ตารางงานสัปดาห์หน้า' : '📅 ตารางงานสัปดาห์นี้',
                        weight: 'bold',
                        size: 'md',
                        color: '#1A202C'
                    },
                    {
                        type: 'box',
                        layout: 'vertical',
                        contents: rows,
                        spacing: 'xs'
                    }
                ]
            }
        };
    };

    // 4. Split employees into chunks if more than 8 to stay safe from the 150-element limit
    const chunkSize = 5;
    const bubbles = [];
    if (employees.length <= 8) {
        bubbles.push(buildBubbleForEmployees(employees));
    } else {
        for (let i = 0; i < employees.length; i += chunkSize) {
            const chunk = employees.slice(i, i + chunkSize);
            bubbles.push(buildBubbleForEmployees(chunk));
        }
    }

    const flexMsg = {
        type: 'flex',
        altText: isNextWeek ? 'ตารางงานสัปดาห์หน้า' : 'ตารางงานสัปดาห์นี้',
        contents: bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles }
    };

    await client.replyMessage(event.replyToken, flexMsg);
    return true;
  }

  if (text.includes('เช็คตาราง') || text.includes('roster') || text.includes('ตารางงาน') || text.includes('ใครเข้ากะ')) {
    const targetDate = text.includes('พรุ่งนี้') ? startOfTomorrow() : addHours(new Date(), 7);
    const dateStr = format(targetDate, 'dd/MM/yyyy');
    const roster = await getEffectiveRoster(targetDate);

    if (roster.length === 0) {
      await client.replyMessage(event.replyToken, { type: 'text', text: `📅 ตารางงานวันที่ ${dateStr}\n\nเมี๊ยว~ ยังไม่มีใครลงเวลายังไงเลยค่ะ` });
    } else {
      const contents = [
        { type: 'text', text: 'DAILY ATTENDANCE REGISTRY', weight: 'bold', size: 'sm', color: '#1c1c1c' },
        { type: 'text', text: `DATE: ${dateStr}`, size: 'xxs', color: '#666666', weight: 'bold', margin: 'xs' },
        { type: 'separator', margin: 'md', color: '#cccccc' }
      ];
      
      roster.forEach(emp => {
        const shiftStart = emp.shift?.start_time?.slice(0,5);
        const shiftEnd = emp.shift?.end_time?.slice(0,5);
        
        let statusTag = 'PENDING';
        let statusColor = '#ef6c00';
        let actualTimeStr = "";

        if (emp.attendance?.check_in) {
          statusTag = 'IN';
          statusColor = '#2e7d32';
          actualTimeStr = format(addHours(new Date(emp.attendance.check_in), 7), "HH:mm");
          
          if (shiftStart && actualTimeStr > shiftStart) {
            statusColor = '#c62828';
            statusTag = 'LATE'; 
          }
        }
        if (emp.attendance?.check_out) {
          statusTag = 'OUT';
          statusColor = '#666666';
        }

        contents.push({
          type: 'box', layout: 'horizontal', margin: 'md',
          contents: [
            { type: 'text', text: statusTag, flex: 2, size: 'xs', weight: 'bold', color: statusColor },
            { type: 'text', text: `${emp.nickname || emp.name}`.toUpperCase(), flex: 3, size: 'xs', weight: 'bold', color: '#1c1c1c' },
            { type: 'text', text: (emp.shift?.name || 'Custom').toUpperCase(), flex: 2, size: 'xxs', color: '#666666', align: 'center' },
            { type: 'text', text: actualTimeStr ? `${actualTimeStr} (${shiftStart})` : `${shiftStart}-${shiftEnd}`, flex: 3, size: 'xs', align: 'end', color: (statusTag === 'LATE') ? '#c62828' : (emp.isOverride ? '#3b82f6' : '#1c1c1c') }
          ]
        });
      });

      await client.replyMessage(event.replyToken, {
        type: 'flex',
        altText: `ตารางงาน ${dateStr}`,
        contents: {
          type: 'bubble',
          styles: {
            header: { backgroundColor: '#f3f3f3' },
            body: { backgroundColor: '#f3f3f3' }
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
      await client.replyMessage(event.replyToken, { type: 'text', text: 'Error fetching data: ' + error.message });
      return true;
    }

    if (leaves && leaves.length > 0) {
      const bubbles = leaves.map(l => formatLeaveRequestBubble(l, false));
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
        body: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '20px',
          contents: [
            {
              type: 'text',
              text: '📋 รายการรออนุมัติลางาน',
              weight: 'bold',
              size: 'md',
              color: '#9ca3af'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              paddingAll: '15px',
              backgroundColor: '#f0fdf4',
              cornerRadius: 'md',
              contents: [
                {
                  type: 'text',
                  text: '✅ ไม่มีรายการขอลาหยุดที่รออนุมัติ',
                  color: '#15803d',
                  weight: 'bold',
                  size: 'sm',
                  align: 'center'
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
      await client.replyMessage(event.replyToken, { type: 'text', text: 'Error fetching data: ' + error.message });
      return true;
    }

    if (leaves && leaves.length > 0) {
      const bubbles = leaves.map(l => formatLeaveRequestBubble(l, true));
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
        body: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '20px',
          contents: [
            {
              type: 'text',
              text: '📋 ประวัติการลาหยุดล่าสุด',
              weight: 'bold',
              size: 'md',
              color: '#9ca3af'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              paddingAll: '15px',
              backgroundColor: '#f8fafc',
              cornerRadius: 'md',
              contents: [
                {
                  type: 'text',
                  text: '❌ ยังไม่มีประวัติการขอลาหยุดในระบบ',
                  color: '#64748b',
                  weight: 'bold',
                  size: 'sm',
                  align: 'center'
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
      const payload = JSON.parse(Buffer.from(queryParams.get('payload'), 'base64').toString());
      const isBoss = await checkIsBoss(userId);
      
      let targetEmpId = null;
      let targetNickname = payload.employee_name;

      if (isBoss && payload.employee_name) {
        const { data: targetEmp } = await supabase.from('employees').select('id, nickname').ilike('nickname', `%${payload.employee_name}%`).limit(1).maybeSingle();
        targetEmpId = targetEmp?.id;
      }

      if (!targetEmpId) {
        const { data: senderEmp } = await supabase.from('employees').select('id, name, nickname').or(`line_bot_id.eq.${userId},line_user_id.eq.${userId}`).maybeSingle();
        targetEmpId = senderEmp?.id;
        targetNickname = senderEmp?.nickname || senderEmp?.name;
      }
      
      if (!targetEmpId) {
        await client.replyMessage(event.replyToken, { type: 'text', text: 'เมี๊ยว~ หาข้อมูลพนักงานไม่เจอค่ะ รบกวนแจ้งบอสให้ผูก ID ก่อนนะ' });
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
        await client.replyMessage(event.replyToken, { type: 'text', text: `✅ บอสสั่งมา ยูซุจัดให้! อัปเดตตารางของ "${targetNickname}" เรียบร้อยแล้วค่ะ เมี๊ยว~` });
      } else {
        const approvalFlex = {
          type: 'bubble',
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
              { type: 'text', text: 'ROSTER MODIFICATION REQUEST', color: '#1c1c1c', weight: 'bold', size: 'sm' },
              { type: 'text', text: 'STATUS: PENDING MANAGER APPROVAL', color: '#ef6c00', size: 'xxs', weight: 'bold', margin: 'xs' }
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
                  { type: 'text', text: 'REQUESTER', size: 'xs', color: '#666666', flex: 1 },
                  { type: 'text', text: targetNickname.toUpperCase(), size: 'xs', color: '#1c1c1c', align: 'end', flex: 2 }
                ]
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'TARGET DATE', size: 'xs', color: '#666666', flex: 1 },
                  { type: 'text', text: payload.date, size: 'xs', color: '#1c1c1c', align: 'end', flex: 2 }
                ]
              },
              { type: 'separator', margin: 'md', color: '#cccccc' },
              {
                type: 'box',
                layout: 'vertical',
                margin: 'md',
                contents: [
                  { type: 'text', text: 'MODIFICATION DETAILS', color: '#666666', size: 'xxs', weight: 'bold' },
                  { type: 'text', text: payload.reason || payload.details?.note || '-', size: 'xs', color: '#1c1c1c', wrap: true, margin: 'xs' }
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
              { type: 'button', style: 'primary', color: '#1c1c1c', action: { type: 'postback', label: 'APPROVE', data: `action=approve_roster&id=${request.id}` } },
              { type: 'button', style: 'secondary', action: { type: 'postback', label: 'REJECT', data: `action=reject_roster&id=${request.id}` } }
            ]
          }
        };

        await client.replyMessage(event.replyToken, { type: 'text', text: 'รับทราบค่ะ! ยูซุส่งเรื่องให้บอสพิจารณาในกลุ่มเรียบร้อยแล้วนะคะ เมี๊ยว~' });
        await client.pushMessage(groupId, { type: 'flex', altText: '🔔 คำขอปรับตารางใหม่', contents: approvalFlex });
      }
      return true;
    } catch (e) {
      console.error("Confirm Roster Error:", e);
      await client.replyMessage(event.replyToken, { type: 'text', text: `เเม๊! เกิดข้อผิดพลาด: ${e.message}` });
      return true;
    }
  }

  if (action === 'approve_roster') {
    const requestId = queryParams.get('id');
    const isBoss = await checkIsBoss(userId);

    if (!isBoss) {
       await client.replyMessage(event.replyToken, { type: 'text', text: 'เมี๊ยว~ สิทธิ์ไม่พอค่ะ ต้องให้บอส (คุณพ่อ/คุณแม่) กดเท่านั้นนะคะ!' });
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
      await client.replyMessage(event.replyToken, { type: 'text', text: '✅ อนุมัติเรียบร้อย! อัปเดตตารางให้แล้วค่ะ เมี๊ยว~' });
    }
    return true;
  }

  if (action === 'reject_roster') {
    const requestId = queryParams.get('id');
    if (await checkIsBoss(userId)) {
       await supabase.from('roster_requests').update({ status: 'REJECTED', manager_id: (await getEmployeeByLineId(userId))?.id }).eq('id', requestId);
       await client.replyMessage(event.replyToken, { type: 'text', text: '❌ ปฏิเสธคำขอเรียบร้อยค่ะ' });
    }
    return true;
  }

  if (action === 'approve_leave' || action === 'reject_leave') {
    const leaveId = queryParams.get('id');
    const isBoss = await checkIsBoss(userId);

    if (!isBoss) {
      await client.replyMessage(event.replyToken, { type: 'text', text: 'เมี๊ยว~ สิทธิ์ไม่พอค่ะ ต้องให้บอส (คุณพ่อ/คุณแม่) กดเท่านั้นนะคะ!' });
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
      await client.replyMessage(event.replyToken, { type: 'text', text: 'เมี๊ยว~ ไม่พบข้อมูลใบลาหยุดนี้ในระบบค่ะ' });
      return true;
    }

    const pendingLeaves = leaves.filter(l => l.status === 'pending');
    if (pendingLeaves.length === 0) {
      await client.replyMessage(event.replyToken, { type: 'text', text: 'เมี๊ยว~ ใบลาหยุดเหล่านี้ได้รับการดำเนินการไปก่อนหน้านี้แล้วค่ะ' });
      return true;
    }

    // 2. อัปเดตสถานะใบลา
    const { error: updateErr } = await supabase
      .from('leave_requests')
      .update({ status: newStatus })
      .in('id', pendingLeaves.map(l => l.id));

    if (updateErr) {
      await client.replyMessage(event.replyToken, { type: 'text', text: `เแม๊! เกิดข้อผิดพลาดในการอัปเดตสถานะ: ${updateErr.message}` });
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
    const title = isApproved ? 'LEAVE REGISTRY APPROVED' : 'LEAVE REGISTRY REJECTED';
    const statusColor = isApproved ? '#2e7d32' : '#c62828';
    const typeText = sampleReq.leave_type === 'sick' ? 'ลาป่วย' : sampleReq.leave_type === 'business' ? 'ลากิจ' : 'พักร้อน';
    
    // เรียงวันที่ทั้งหมดที่อนุมัติ/ปฏิเสธ
    const datesStr = pendingLeaves.map(l => l.leave_date).join(', ');
    const repEmp = sampleReq.replacement_employee;
    const replacementName = repEmp ? `${repEmp.name} (${repEmp.nickname || "-"})` : "-";

    const message = {
      type: 'flex',
      altText: `ผลการขอลา: ${isApproved ? 'อนุมัติ' : 'ไม่อนุมัติ'}`,
      contents: {
        type: 'bubble',
        size: 'kilo',
        styles: {
          header: { backgroundColor: '#f3f3f3' },
          body: { backgroundColor: '#f3f3f3' }
        },
        header: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '20px',
          contents: [
            { type: 'text', text: title, weight: 'bold', size: 'sm', color: statusColor }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '20px',
          spacing: 'sm',
          contents: [
            { type: 'separator', color: '#cccccc' },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: 'STAFF', color: '#666666', size: 'xs', flex: 2 },
                { type: 'text', text: name.toUpperCase(), weight: 'bold', color: '#1c1c1c', size: 'xs', flex: 4, align: 'end' }
              ]
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: 'DATES', color: '#666666', size: 'xs', flex: 2 },
                { type: 'text', text: datesStr, color: '#1c1c1c', size: 'xs', flex: 4, wrap: true, align: 'end' }
              ]
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: 'CLASSIFICATION', color: '#666666', size: 'xs', flex: 2 },
                { type: 'text', text: typeText, color: '#1c1c1c', size: 'xs', flex: 4, align: 'end' }
              ]
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: 'REPLACEMENT', color: '#666666', size: 'xs', flex: 2 },
                { type: 'text', text: replacementName, color: '#1c1c1c', size: 'xs', flex: 4, wrap: true, align: 'end' }
              ]
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'md',
              contents: [
                { type: 'text', text: 'REASON FOR ABSENCE', color: '#666666', size: 'xxs', weight: 'bold' },
                { type: 'text', text: sampleReq.reason || '-', color: '#333333', size: 'xs', wrap: true, margin: 'xs' }
              ]
            }
          ]
        }
      }
    };

    await client.replyMessage(event.replyToken, { type: 'text', text: `เมี๊ยว~ ยูซุดำเนินการ${isApproved ? 'อนุมัติ' : 'ปฏิเสธ'}การลางานของ ${name} เรียบร้อยแล้วค่ะ!` });

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
    await client.replyMessage(event.replyToken, { type: 'text', text: 'โอเคค่ะ ยกเลิกรายการให้นะคะ เมี๊ยว~' });
    return true;
  }

  return false;
}
