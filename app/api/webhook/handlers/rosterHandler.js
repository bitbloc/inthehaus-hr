import { format, addHours, startOfTomorrow, parseISO } from 'date-fns';
import { getEffectiveRoster } from '../../../../utils/roster';
import { getEmployeeByLineId, checkIsBoss } from '../../../../utils/memory';
import { supabase } from '../../../../lib/supabaseClient';

export async function handleRosterCommand(event, client, text, rawText, userId) {
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
            { type: 'text', text: emp.shift?.name || 'Custom', flex: 2, size: 'xs', color: '#aaaaaa', align: 'center' },
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
          await supabase.from('roster_overrides').upsert({ employee_id: targetEmpId, date: payload.date, is_off: true, reference_request_id: request.id });
        } else {
          await supabase.from('roster_overrides').upsert({ 
            employee_id: targetEmpId, 
            date: payload.date, 
            shift_id: payload.details?.shift_id || null,
            custom_start_time: payload.details?.start_time || null,
            custom_end_time: payload.details?.end_time || null,
            is_off: false,
            reference_request_id: request.id 
          });
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
        await supabase.from('roster_overrides').upsert({ employee_id: req.requester_id, date: req.target_date, is_off: true, reference_request_id: req.id });
      } else {
        await supabase.from('roster_overrides').upsert({ 
          employee_id: req.requester_id, 
          date: req.target_date, 
          shift_id: req.new_shift_id,
          custom_start_time: req.custom_start_time,
          custom_end_time: req.custom_end_time,
          is_off: false,
          reference_request_id: req.id 
        });
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

    // 1. ดึงข้อมูลใบลา
    const { data: req, error: fetchErr } = await supabase
      .from('leave_requests')
      .select('*, employees(name, nickname, position)')
      .eq('id', leaveId)
      .single();

    if (fetchErr || !req) {
      await client.replyMessage(event.replyToken, { type: 'text', text: 'เมี๊ยว~ ไม่พบข้อมูลใบลาหยุดนี้ในระบบค่ะ' });
      return true;
    }

    if (req.status !== 'pending') {
      await client.replyMessage(event.replyToken, { type: 'text', text: `เมี๊ยว~ ใบลาหยุดนี้ได้รับการตัดสินไปแล้ว (สถานะปัจจุบัน: ${req.status})` });
      return true;
    }

    // 2. อัปเดตสถานะใบลา
    const { error: updateErr } = await supabase
      .from('leave_requests')
      .update({ status: newStatus })
      .eq('id', leaveId);

    if (updateErr) {
      await client.replyMessage(event.replyToken, { type: 'text', text: `เเ๊! เกิดข้อผิดพลาดในการอัปเดตสถานะ: ${updateErr.message}` });
      return true;
    }

    // 3. ถ้าอนุมัติ ให้ทำ roster_overrides
    if (newStatus === 'approved') {
      const { error: overrideErr } = await supabase
        .from('roster_overrides')
        .upsert({
          employee_id: req.employee_id,
          date: req.leave_date,
          is_off: true
        });

      if (overrideErr) {
        console.error("Override Error:", overrideErr);
      }
    }

    // 4. ส่งข้อความอัปเดตและแจ้งเตือนเข้ากลุ่ม
    const name = req.employees?.nickname || req.employees?.name || 'พนักงาน';
    const isApproved = newStatus === 'approved';
    const color = isApproved ? '#06c755' : '#ff334b';
    const title = isApproved ? '✅ อนุมัติการลา (ผ่าน LINE)' : '❌ ไม่อนุมัติการลา (ผ่าน LINE)';
    const typeText = req.leave_type === 'sick' ? 'ลาป่วย 😷' : req.leave_type === 'business' ? 'ลากิจ 💼' : 'พักร้อน 🏖️';

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
                    { type: 'text', text: 'ชื่อ:', color: '#aaaaaa', size: 'sm', flex: 2 },
                    { type: 'text', text: name, weight: 'bold', color: '#666666', size: 'sm', flex: 4 }
                  ]
                },
                {
                  type: 'box', layout: 'baseline',
                  contents: [
                    { type: 'text', text: 'วันที่:', color: '#aaaaaa', size: 'sm', flex: 2 },
                    { type: 'text', text: req.leave_date, color: '#666666', size: 'sm', flex: 4 }
                  ]
                },
                {
                  type: 'box', layout: 'baseline',
                  contents: [
                    { type: 'text', text: 'ประเภท:', color: '#aaaaaa', size: 'sm', flex: 2 },
                    { type: 'text', text: typeText, color: '#666666', size: 'sm', flex: 4 }
                  ]
                },
                {
                  type: 'box', layout: 'baseline',
                  contents: [
                    { type: 'text', text: 'เหตุผล:', color: '#aaaaaa', size: 'sm', flex: 2 },
                    { type: 'text', text: req.reason || '-', color: '#666666', size: 'sm', flex: 4, wrap: true }
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
