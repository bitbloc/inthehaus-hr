require('dotenv').config({ path: '.env.local' });
const { Client } = require('@line/bot-sdk');

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
});

const GROUP_ID = 'C1210c7a0601b5a675060e312efe10bff';

const message = {
  type: 'flex',
  altText: '☀️ DAILY MISSION: อย่าลืม CHECK-IN & STOCK',
  contents: {
    type: 'bubble',
    size: 'mega',
    styles: {
      body: { backgroundColor: '#F4F4F4' },
      footer: { backgroundColor: '#F4F4F4', separator: true, separatorColor: '#EAEAEA' }
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: 'xl',
      spacing: 'lg',
      contents: [
        {
          type: 'text',
          text: 'DAILY MISSION // PROTOCOL',
          size: 'xxs',
          color: '#8C8C8C',
          weight: 'bold'
        },
        {
          type: 'text',
          text: 'อรุณสวัสดิ์ทีมงาน! ☀️',
          size: 'xxl',
          weight: 'bold',
          color: '#1C1C1C'
        },
        {
          type: 'text',
          text: 'ได้เวลาเปิดร้านแล้ว โปรดบันทึกเวลาเข้างาน เช็คสต๊อกประจำวัน และทำเช็คลิสต์กะเปิดร้านให้เรียบร้อยครับ',
          size: 'sm',
          color: '#5A5A5A',
          wrap: true
        },
        {
          type: 'separator',
          color: '#E5E5E5'
        },
        {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              spacing: 'md',
              contents: [
                {
                  type: 'box',
                  layout: 'vertical',
                  backgroundColor: '#D05D00',
                  width: '4px',
                  cornerRadius: 'xs',
                  contents: []
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  spacing: 'xs',
                  contents: [
                    {
                      type: 'text',
                      text: 'กะเปิดร้าน // 10:00',
                      size: 'xxs',
                      color: '#8C8C8C',
                      weight: 'bold'
                    },
                    {
                      type: 'text',
                      text: 'Check-in เข้างาน และ เช็คสต๊อก',
                      size: 'sm',
                      weight: 'bold',
                      color: '#1C1C1C'
                    },
                    {
                      type: 'text',
                      text: 'เตรียมความเรียบร้อยหน้าร้าน, อุปกรณ์, และเปิดระบบ',
                      size: 'xs',
                      color: '#7A7A7A',
                      wrap: true
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      paddingAll: 'lg',
      contents: [
        {
          type: 'button',
          action: {
            type: 'uri',
            label: '🟢 บันทึกเวลาเข้างาน (CHECK IN)',
            uri: 'https://inthehaus-hr.vercel.app/checkin'
          },
          style: 'primary',
          color: '#1C1C1C',
          height: 'sm'
        },
        {
          type: 'button',
          action: {
            type: 'uri',
            label: '📦 เช็คสต๊อก (CHECK STOCK)',
            uri: 'https://haustable.vercel.app/staff/stock'
          },
          style: 'primary',
          color: '#7C7C7C',
          height: 'sm'
        },
        {
          type: 'button',
          action: {
            type: 'uri',
            label: '📋 เปิดฟอร์ม CHECKLIST',
            uri: 'https://forms.gle/8agnXqC7ZSojmqra6'
          },
          style: 'primary',
          color: '#7C7C7C',
          height: 'sm'
        },
        {
          type: 'text',
          text: 'ITH-HR // MISSION CONTROL // AB1',
          size: 'xxs',
          color: '#A5A5A5',
          weight: 'bold',
          align: 'center',
          margin: 'md'
        }
      ]
    }
  }
};

async function test() {
  try {
    await client.pushMessage(GROUP_ID, [message]);
    console.log("Success!");
  } catch (error) {
    console.error("Status Code:", error.statusCode);
    console.error("Message:", error.message);
    if (error.originalError && error.originalError.response) {
      console.error("Original Response Data:", JSON.stringify(error.originalError.response.data, null, 2));
    } else {
      console.error("Full Error:", JSON.stringify(error, null, 2));
    }
  }
}

test();
