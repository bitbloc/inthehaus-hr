import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { Client } from '@line/bot-sdk';

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

const groupId = 'C1210c7a0601b5a675060e312efe10bff';

const mockItems = [
  { name: 'เบส-โกโก้' },
  { name: 'เบส-ชาดำ' },
  { name: 'เบสแกงส้ม' },
  { name: 'เบส-ชามะลิ' },
  { name: 'เบสแกงไตปลา' }
];

function formatStockSelectionFlex(searchQuery, matchingItems) {
  return {
    type: "flex",
    altText: "🔍 เลือกสินค้าที่ต้องการเช็คสต็อก",
    contents: {
      type: "bubble",
      size: "mega",
      styles: {
        header: {
          backgroundColor: "#f59e0b"
        },
        body: {
          backgroundColor: "#0f172a"
        }
      },
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "🔍 ยูซุพบสินค้าหลายรายการ",
            weight: "bold",
            color: "#ffffff",
            size: "md"
          },
          {
            type: "text",
            text: `ผลการค้นหาสำหรับ "${searchQuery}"`,
            color: "#94a3b8",
            size: "xs",
            margin: "xs"
          }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "ไม่แน่ใจว่าหมายถึงชิ้นไหน เลือกชิ้นที่ต้องการเช็คได้เลยค่ะ เมี๊ยว~",
            size: "xs",
            color: "#e2e8f0",
            wrap: true
          },
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: matchingItems.slice(0, 5).map(item => {
              return {
                type: "button",
                style: "primary",
                color: "#1e293b",
                height: "sm",
                action: {
                  type: "postback",
                  label: item.name,
                  data: `action=check_exact_stock&itemName=${encodeURIComponent(item.name)}`
                }
              };
            })
          }
        ]
      }
    }
  };
}

async function run() {
  try {
    const flexMsg = formatStockSelectionFlex("เบส", mockItems);
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
