require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('@line/bot-sdk');
const { format, parseISO } = require('date-fns');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const lineAccessToken = process.env.CHANNEL_ACCESS_TOKEN;
const lineChannelSecret = process.env.CHANNEL_SECRET;

const supabase = createClient(supabaseUrl, supabaseKey);
const lineClient = new Client({
  channelAccessToken: lineAccessToken,
  channelSecret: lineChannelSecret,
});

function formatLeaveRequestBubble(l, isHistory = false) {
  const empName = l.employees?.nickname || l.employees?.name || 'พนักงาน';
  const empPosition = l.employees?.position || 'ทั่วไป';
  const dateStr = l.leave_date ? format(parseISO(l.leave_date), 'dd/MM/yyyy') : '-';
  
  let typeText = 'ลาหยุด 📋';
  if (l.leave_type === 'sick') typeText = 'ลาป่วย 😷';
  else if (l.leave_type === 'business') typeText = 'ลากิจ 💼';
  else if (l.leave_type === 'vacation') typeText = 'พักร้อน 🏖️';

  const repEmp = l.replacement_employee;
  const replacementName = repEmp ? `${repEmp.name} (${repEmp.nickname || "-"})` : '-';
  const reasonText = l.reason || '-';

  // Status style config
  let statusLabel = '⏳ รออนุมัติ';
  let statusColor = '#b45309';
  let statusBg = '#fef3c7';
  if (l.status === 'approved') {
    statusLabel = '✅ อนุมัติแล้ว';
    statusColor = '#047857';
    statusBg = '#d1fae5';
  } else if (l.status === 'rejected') {
    statusLabel = '❌ ปฏิเสธแล้ว';
    statusColor = '#b91c1c';
    statusBg = '#fee2e2';
  }

  const bubble = {
    type: 'bubble',
    size: 'mega',
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '20px',
      contents: [
        // Header info with status badge
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'box',
              layout: 'vertical',
              flex: 1,
              contents: [
                {
                  type: 'text',
                  text: isHistory ? '📋 ประวัติการลาหยุด' : '📋 คำขออนุมัติลางาน',
                  weight: 'bold',
                  size: 'sm',
                  color: '#9ca3af'
                },
                {
                  type: 'text',
                  text: empName,
                  weight: 'bold',
                  size: 'xl',
                  color: '#1f2937',
                  margin: 'xs'
                },
                {
                  type: 'text',
                  text: empPosition,
                  size: 'xs',
                  color: '#6b7280'
                }
              ]
            },
            {
              type: 'box',
              layout: 'vertical',
              flex: 0,
              contents: [
                {
                  type: 'box',
                  layout: 'vertical',
                  backgroundColor: statusBg,
                  cornerRadius: 'md',
                  paddingStart: '8px',
                  paddingEnd: '8px',
                  paddingTop: '4px',
                  paddingBottom: '4px',
                  contents: [
                    {
                      type: 'text',
                      text: statusLabel,
                      color: statusColor,
                      weight: 'bold',
                      size: 'xxs'
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          type: 'separator',
          margin: 'md'
        },
        // Details list
        {
          type: 'box',
          layout: 'vertical',
          margin: 'md',
          spacing: 'sm',
          contents: [
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'วันที่ลา:', color: '#9ca3af', size: 'xs', flex: 2 },
                { type: 'text', text: dateStr, color: '#374151', size: 'sm', flex: 5, weight: 'bold' }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'ประเภท:', color: '#9ca3af', size: 'xs', flex: 2 },
                { type: 'text', text: typeText, color: '#374151', size: 'sm', flex: 5 }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'คนปฏิบัติแทน:', color: '#9ca3af', size: 'xs', flex: 2 },
                { type: 'text', text: replacementName, color: '#374151', size: 'sm', flex: 5, wrap: true }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'เหตุผล:', color: '#9ca3af', size: 'xs', flex: 2 },
                { type: 'text', text: reasonText, color: '#4b5563', size: 'sm', flex: 5, wrap: true, style: 'italic' }
              ]
            }
          ]
        }
      ]
    }
  };

  if (l.status === 'pending') {
    bubble.footer = {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#10b981',
          action: {
            type: 'postback',
            label: '✅ อนุมัติ',
            data: `action=approve_leave&id=${l.id}`
          }
        },
        {
          type: 'button',
          style: 'secondary',
          color: '#ef4444',
          action: {
            type: 'postback',
            label: '❌ ปฏิเสธ',
            data: `action=reject_leave&id=${l.id}`
          }
        }
      ]
    };
  }

  return bubble;
}

async function main() {
    try {
        console.log("Fetching leaves...");
        const { data: leaves } = await supabase
          .from('leave_requests')
          .select('*, employees!employee_id(name, nickname, position), replacement_employee:employees!replacement_employee_id(name, nickname, position)')
          .order('created_at', { ascending: false })
          .limit(5);

        if (!leaves || leaves.length === 0) {
            console.log("No leaves found.");
            return;
        }

        console.log("Formatting bubbles...");
        const bubbles = leaves.map(l => formatLeaveRequestBubble(l, true));
        const flexMsg = {
          type: 'flex',
          altText: '📋 ประวัติการลาหยุดล่าสุด',
          contents: bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles }
        };

        const targetGroup = 'C1210c7a0601b5a675060e312efe10bff';
        console.log("Sending Flex Message to group:", targetGroup);
        await lineClient.pushMessage(targetGroup, [flexMsg]);
        console.log("PUSH SUCCESS!");
    } catch (err) {
        console.error("PUSH FAILED!");
        if (err.originalError && err.originalError.response) {
            console.error("LINE API Response Status:", err.originalError.response.status);
            console.error("LINE API Response Headers:", err.originalError.response.headers);
            console.error("LINE API Response Body:", JSON.stringify(err.originalError.response.data, null, 2));
        } else {
            console.error(err);
        }
    }
}

main();
