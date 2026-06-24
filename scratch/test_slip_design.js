import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { Client } from '@line/bot-sdk';

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

const groupId = 'C1210c7a0601b5a675060e312efe10bff';

const mockResult = {
  bankName: 'ธนาคารกสิกรไทย (KBANK)',
  senderName: 'นาย สมชาย มั่งมีศรีสุข',
  transTime: '24 มิ.ย. 2569 10:15 น.',
  transactionRef: '2026062489AB12345',
};
const parsedAmount = 1250.00;
const senderName = 'บาริสต้า ยูสุ';

function generateDieterRamsSlipFlex(parsedAmount, result, senderName) {
  return {
    type: 'flex',
    altText: `บันทึกยอดโอน ${parsedAmount.toLocaleString('th-TH', {minimumFractionDigits: 2})} บาท เรียบร้อยค่ะ`,
    contents: {
      type: 'bubble',
      size: 'mega',
      styles: {
        body: {
          backgroundColor: '#D2FF00'
        }
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '24px',
        contents: [
          // Header box (Clean stack layout)
          {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: 'ร้านในบ้าน - in the haus',
                weight: 'bold',
                size: 'xxs',
                color: '#333333'
              },
              {
                type: 'text',
                text: 'DEPOSIT RECORDED',
                weight: 'bold',
                size: 'xl',
                color: '#000000',
                margin: 'xs'
              }
            ]
          },
          // Spacer representing the open graphic region
          {
            type: 'box',
            layout: 'vertical',
            margin: 'xxl',
            height: '40px',
            contents: []
          },
          // Divider 1
          {
            type: 'separator',
            color: '#000000'
          },
          // Row 1
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            spacing: 'md',
            contents: [
              {
                type: 'box',
                layout: 'vertical',
                flex: 1,
                contents: [
                  {
                    type: 'text',
                    text: result.bankName || 'ไม่ระบุ',
                    size: 'sm',
                    weight: 'bold',
                    color: '#000000',
                    wrap: true
                  },
                  {
                    type: 'text',
                    text: 'BANK',
                    size: 'xxs',
                    color: '#333333',
                    margin: 'xs'
                  }
                ]
              },
              {
                type: 'box',
                layout: 'vertical',
                flex: 1,
                contents: [
                  {
                    type: 'text',
                    text: result.senderName || 'ไม่ระบุ',
                    size: 'sm',
                    weight: 'bold',
                    color: '#000000',
                    wrap: true
                  },
                  {
                    type: 'text',
                    text: 'SENDER',
                    size: 'xxs',
                    color: '#333333',
                    margin: 'xs'
                  }
                ]
              }
            ]
          },
          // Divider 2
          {
            type: 'separator',
            color: '#000000',
            margin: 'md'
          },
          // Row 2
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            spacing: 'md',
            contents: [
              {
                type: 'box',
                layout: 'vertical',
                flex: 1,
                contents: [
                  {
                    type: 'text',
                    text: result.transTime || 'ไม่ระบุ',
                    size: 'sm',
                    weight: 'bold',
                    color: '#000000',
                    wrap: true
                  },
                  {
                    type: 'text',
                    text: 'DATE TIME',
                    size: 'xxs',
                    color: '#333333',
                    margin: 'xs'
                  }
                ]
              },
              {
                type: 'box',
                layout: 'vertical',
                flex: 1,
                contents: [
                  {
                    type: 'text',
                    text: senderName || 'ไม่ระบุ',
                    size: 'sm',
                    weight: 'bold',
                    color: '#000000',
                    wrap: true
                  },
                  {
                    type: 'text',
                    text: 'OPERATOR',
                    size: 'xxs',
                    color: '#333333',
                    margin: 'xs'
                  }
                ]
              }
            ]
          },
          // Divider 3
          {
            type: 'separator',
            color: '#000000',
            margin: 'md'
          },
          // Row 3
          {
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            contents: [
              {
                type: 'text',
                text: result.transactionRef || 'ไม่ระบุ',
                size: 'sm',
                weight: 'bold',
                color: '#000000',
                wrap: true
              },
              {
                type: 'text',
                text: 'REFERENCE NO.',
                size: 'xxs',
                color: '#333333',
                margin: 'xs'
              }
            ]
          },
          // Divider 4
          {
            type: 'separator',
            color: '#000000',
            margin: 'md'
          },
          // Big Amount section using spans for baseline currency alignment
          {
            type: 'text',
            margin: 'lg',
            contents: [
              {
                type: 'span',
                text: parsedAmount.toLocaleString('th-TH', {minimumFractionDigits: 2}),
                size: '5xl',
                weight: 'bold',
                color: '#000000'
              },
              {
                type: 'span',
                text: ' THB',
                size: 'md',
                weight: 'bold',
                color: '#000000'
              }
            ]
          },
          // Divider 5 (under the amount)
          {
            type: 'separator',
            color: '#000000',
            margin: 'lg'
          },
          // Footer
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            contents: [
              {
                type: 'text',
                text: 'ONHAUS SYSTEM©',
                size: 'xxs',
                color: '#333333',
                weight: 'bold'
              }
            ]
          }
        ]
      }
    }
  };
}

async function run() {
  try {
    const flexMsg = generateDieterRamsSlipFlex(parsedAmount, mockResult, senderName);
    console.log("Sending push message to group:", groupId);
    const result = await client.pushMessage(groupId, flexMsg);
    console.log("Push success:", result);
  } catch (err) {
    console.error("Push Error:");
    if (err.statusCode) console.error("Status:", err.statusCode);
    if (err.statusMessage) console.error("Message:", err.statusMessage);
    if (err.originalError && err.originalError.response) {
      console.error("Details:", JSON.stringify(err.originalError.response.data));
    } else {
      console.error(err);
    }
  }
}

run();
