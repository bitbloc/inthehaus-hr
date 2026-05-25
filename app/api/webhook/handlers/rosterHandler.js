import { format, addHours, startOfTomorrow, parseISO, startOfWeek, addDays } from 'date-fns';
import { getEffectiveRoster } from '../../../../utils/roster';
import { getEmployeeByLineId, checkIsBoss } from '../../../../utils/memory';
import { supabase } from '../../../../lib/supabaseClient';

function getShiftColorHex(shiftName, isOff, isCustomOrExtra) {
  if (isOff) return '#dc2626'; // Red
  if (isCustomOrExtra) return '#0284c7'; // Sky/Teal
  
  const name = (shiftName || '').toLowerCase();
  
  if (name.includes('ควบ') || name.includes('double')) {
    return '#e11d48'; // Rose
  }
  if (name.includes('ค่ำ') || name.includes('ดึก') || name.includes('night') || name.includes('evening')) {
    return '#4f46e5'; // Indigo
  }
  if (name.includes('เช้า') || name.includes('morning')) {
    return '#d97706'; // Amber
  }
  return '#ca8a04'; // Yellow
}

export async function handleRosterCommand(event, client, text, rawText, userId) {
  if (text === 'stcalendar' || text === 'ตารางทั้งสัปดาห์' || text === 'วีคนี้' || text.includes('calendar')) {
    const today = addHours(new Date(), 7);
    const startOfThisWeek = startOfWeek(today, { weekStartsOn: 1 });
    const tomorrow = addDays(today, 1);
    const tomorrowDateStr = format(tomorrow, 'yyyy-MM-dd');
    const start = startOfWeek(tomorrow, { weekStartsOn: 1 }); // Monday of tomorrow's week
    const isNextWeek = format(start, 'yyyy-MM-dd') > format(startOfThisWeek, 'yyyy-MM-dd');
    const titleText = isNextWeek ? '📅 ตารางงานสัปดาห์หน้า' : '📅 ตารางงานสัปดาห์นี้';
    
    const daysTitle = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
    
    const contents = [];
    contents.push({ type: 'text', text: titleText, weight: 'bold', size: 'xl', color: '#1DB446', align: 'center' });
    contents.push({ type: 'separator', margin: 'md' });

    for (let i = 0; i < 7; i++) {
      const currentDay = addDays(start, i);
      const currentDayStr = format(currentDay, 'yyyy-MM-dd');
      
      // Skip past days and today
      if (currentDayStr < tomorrowDateStr) {
        continue;
      }
      
      const dayIndex = currentDay.getDay();
      const dateStr = format(currentDay, 'dd/MM');
      const roster = await getEffectiveRoster(currentDay);
      const workingRoster = roster.filter(emp => !emp.is_off && emp.shift?.name !== 'OFF');

      if (workingRoster.length > 0) {
        contents.push({
          type: 'box', layout: 'horizontal', margin: 'lg',
          contents: [
            { type: 'text', text: `${daysTitle[dayIndex]} ${dateStr}`, weight: 'bold', size: 'sm', color: '#333333', flex: 2 },
            { type: 'text', text: `${workingRoster.length} คน`, size: 'xs', color: '#555555', align: 'end', flex: 1 }
          ]
        });
        workingRoster.forEach(emp => {
          const isOff = emp.is_off || emp.shift?.name === 'OFF';
          const isCustomOrExtra = emp.isExtra || !emp.shift?.id || emp.shift?.name?.includes('Custom') || emp.shift?.name?.includes('Extra');
          const shiftStart = emp.shift?.start_time?.slice(0,5) || '';
          const shiftEnd = emp.shift?.end_time?.slice(0,5) || '';
          const shiftName = emp.shift?.name || 'Custom';
          const timeStr = shiftStart && shiftEnd ? ` (${shiftStart}-${shiftEnd})` : shiftStart ? ` (${shiftStart})` : '';
          
          const colorHex = getShiftColorHex(shiftName, isOff, isCustomOrExtra);

          const displayTime = shiftStart && shiftEnd ? `${shiftStart}-${shiftEnd}` : shiftStart || '';
          contents.push({
            type: 'box', layout: 'horizontal', margin: 'xs',
            contents: [
              { type: 'text', text: `• ${emp.nickname || emp.name}`, size: 'xs', color: '#333333', flex: 3 },
              { type: 'text', text: displayTime, size: 'xs', color: colorHex, align: 'end', flex: 2, weight: 'bold' }
            ]
          });
        });
        contents.push({ type: 'separator', margin: 'sm' });
      } else {
         contents.push({
          type: 'box', layout: 'horizontal', margin: 'lg',
          contents: [
            { type: 'text', text: `${daysTitle[dayIndex]} ${dateStr}`, weight: 'bold', size: 'sm', color: '#333333', flex: 2 },
            { type: 'text', text: `ไม่มีคนเข้ากะ`, size: 'xs', color: '#555555', align: 'end', flex: 1 }
          ]
        });
        contents.push({ type: 'separator', margin: 'sm' });
      }
    }

    await client.replyMessage(event.replyToken, {
      type: 'flex',
      altText: titleText,
      contents: { type: 'bubble', size: 'mega', body: { type: 'box', layout: 'vertical', contents: contents } }
    });
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
        { type: 'text', text: `📅 ตารางงาน ${dateStr}`, weight: 'bold', size: 'lg', color: '#1DB446' },
        { type: 'separator', margin: 'md' }
      ];
      
      roster.forEach(emp => {
        const shiftStart = emp.shift?.start_time?.slice(0,5);
        const shiftEnd = emp.shift?.end_time?.slice(0,5);
        
        let statusEmoji = "⏳";
        let statusColor = "#666666";
        let actualTimeStr = "";

        if (emp.attendance?.check_in) {
          statusEmoji = "✅";
          statusColor = "#1DB446";
          actualTimeStr = format(addHours(new Date(emp.attendance.check_in), 7), "HH:mm");
          
          if (shiftStart && actualTimeStr > shiftStart) {
            statusColor = "#ff4b00";
            statusEmoji = "⚠️"; 
          }
        }
        if (emp.attendance?.check_out) {
          statusEmoji = "🛑";
          statusColor = "#666666";
        }

        contents.push({
          type: 'box', layout: 'horizontal', margin: 'md',
          contents: [
            { type: 'text', text: `${statusEmoji} ${emp.nickname || emp.name}`, flex: 3, size: 'sm', weight: 'bold', color: statusColor },
            { type: 'text', text: emp.shift?.name || 'Custom', flex: 2, size: 'xs', color: '#555555', align: 'center' },
            { type: 'text', text: actualTimeStr ? `${actualTimeStr} (${shiftStart})` : `${shiftStart}-${shiftEnd}`, flex: 3, size: 'sm', align: 'end', color: (statusColor === '#ff4b00') ? '#ff4b00' : (emp.isOverride ? '#007bff' : '#333333') }
          ]
        });
      });

      await client.replyMessage(event.replyToken, {
        type: 'flex',
        altText: `📅 ตารางงาน ${dateStr}`,
        contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', contents: contents } }
      });
    }
    return true;
  }

  if (text === 'ลางาน') {
    const { data: leaves, error } = await supabase
      .from('leave_requests')
      .select('*, employees(name, position)')
      .eq('status', 'pending')
      .order('leave_date', { ascending: true });

    if (error) {
      await client.replyMessage(event.replyToken, { type: 'text', text: 'Error fetching data: ' + error.message });
      return true;
    }

    let msg = `📋 รายการรออนุมัติลางาน\n`;
    if (leaves?.length > 0) {
      leaves.forEach(l => {
        const dateStr = l.leave_date ? format(parseISO(l.leave_date), 'dd/MM/yyyy') : '-';
        msg += `\n👤 ${l.employees?.name} (${l.employees?.position})\n   วันที่: ${dateStr}\n   ประเภท: ${l.leave_type}\n   เหตุผล: ${l.reason || '-'}\n`;
      });
      msg += `\n📌 รวมรออนุมัติ: ${leaves.length} รายการ`;
    } else {
      msg += "\n✅ ไม่มีรายการขอลาหยุดที่รออนุมัติ";
    }
    await client.replyMessage(event.replyToken, { type: 'text', text: msg });
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
          header: { type: 'box', layout: 'vertical', backgroundColor: '#ffc107', contents: [{ type: 'text', text: '🔔 คำขอปรับตารางกะ', color: '#000000', weight: 'bold' }] },
          body: {
            type: 'box', layout: 'vertical', contents: [
              { type: 'text', text: `👤 ผู้ขอ: ${targetNickname}`, weight: 'bold' },
              { type: 'text', text: `📅 วันที่: ${payload.date}`, size: 'sm' },
              { type: 'text', text: `📝 รายละเอียด: ${payload.reason || payload.details?.note || '-'}`, size: 'sm', wrap: true, margin: 'sm' }
            ]
          },
          footer: {
            type: 'box', layout: 'horizontal', spacing: 'sm',
            contents: [
              { type: 'button', style: 'primary', color: '#06c755', action: { type: 'postback', label: '✅ อนุมัติ', data: `action=approve_roster&id=${request.id}` } },
              { type: 'button', style: 'secondary', color: '#ff3b30', action: { type: 'postback', label: '❌ ปฏิเสธ', data: `action=reject_roster&id=${request.id}` } }
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
    const color = isApproved ? '#06c755' : '#ff334b';
    const title = isApproved ? '✅ อนุมัติการลา (ผ่าน LINE)' : '❌ ไม่อนุมัติการลา (ผ่าน LINE)';
    const typeText = sampleReq.leave_type === 'sick' ? 'ลาป่วย 😷' : sampleReq.leave_type === 'business' ? 'ลากิจ 💼' : 'พักร้อน 🏖️';
    
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
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: title, weight: 'bold', size: 'md', color: color }
              ]
            },
            { type: 'separator', margin: 'md' },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'md',
              spacing: 'sm',
              contents: [
                {
                  type: 'box', layout: 'baseline',
                  contents: [
                    { type: 'text', text: 'ชื่อ:', color: '#555555', size: 'sm', flex: 2 },
                    { type: 'text', text: name, weight: 'bold', color: '#333333', size: 'sm', flex: 4 }
                  ]
                },
                {
                  type: 'box', layout: 'baseline',
                  contents: [
                    { type: 'text', text: 'วันที่:', color: '#555555', size: 'sm', flex: 2 },
                    { type: 'text', text: datesStr, color: '#333333', size: 'sm', flex: 4, wrap: true }
                  ]
                },
                {
                  type: 'box', layout: 'baseline',
                  contents: [
                    { type: 'text', text: 'ประเภท:', color: '#555555', size: 'sm', flex: 2 },
                    { type: 'text', text: typeText, color: '#333333', size: 'sm', flex: 4 }
                  ]
                },
                {
                  type: 'box', layout: 'baseline',
                  contents: [
                    { type: 'text', text: 'คนแทน:', color: '#555555', size: 'sm', flex: 2 },
                    { type: 'text', text: replacementName, color: '#333333', size: 'sm', flex: 4, wrap: true }
                  ]
                },
                {
                  type: 'box', layout: 'baseline',
                  contents: [
                    { type: 'text', text: 'เหตุผล:', color: '#555555', size: 'sm', flex: 2 },
                    { type: 'text', text: sampleReq.reason || '-', color: '#333333', size: 'sm', flex: 4, wrap: true }
                  ]
                }
              ]
            }
          ]
        },
        styles: {
          footer: { separator: true }
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
