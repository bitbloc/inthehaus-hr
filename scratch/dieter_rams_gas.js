/**
 * --- Programmer Haus Settings ---
 * Refactored to Dieter Rams Design Aesthetic
 * Understated, highly structured, minimal design
 */
const CHANNEL_ACCESS_TOKEN = 'LtLyZmb+32O9EOURG9wmaB0tyDXSFXcCTql+1PNdtUFmtY5Kmu6OTcytJRkhQZo9h5wujayMdrDY61VkNED4eIhGMY+4W3fR6uyPAFozHLMkkhAgxaUIj4izNaihW1fxl5GRfRHBM5HPkNh8GEaK6QdB04t89/1O/w1cDnyilFU=';
const GROUP_ID = 'C1210c7a0601b5a675060e312efe10bff'; 
const FORM_LINK = 'https://forms.gle/8agnXqC7ZSojmqra6';

/**
 * Handle form submissions and post formatted report to LINE group
 * @param {Object} e Google Apps Script Form Submit Event Object
 */
function onFormSubmit(e) {
  let responses;
  
  if (e && e.values) {
    responses = e.values;
  } else {
    // Simulated test data (Opening index: 3,4,5 | Closing index: 10,11,12)
    responses = [
      "16/01/2026 09:00:00", 
      "Risa .", 
      "🌙 ช่วงเย็นและก่อนปิดร้าน", 
      "เรียบร้อย", 
      "", 
      "", 
      "", 
      "", 
      "", 
      "", 
      "ตรวจสอบครบถ้วน", 
      "15500", 
      "https://drive.google.com/file/d/1_TEST_FILE_ID_ABC/view?usp=drivesdk"
    ];
  }

  const timestamp = responses[0];
  const staffName = responses[1] || "ไม่ระบุชื่อ";
  const shiftType = responses[2] || "ไม่ระบุกะ"; 
  
  let tasks = [];
  
  // Parse response fields depending on opening/closing shift
  if (shiftType.includes("เปิด")) {
    const dTasks = responses[3] ? String(responses[3]).split(/,\s*/).filter(item => item.trim().length > 0) : [];
    const eTasks = responses[4] ? String(responses[4]).split(/,\s*/).filter(item => item.trim().length > 0) : [];
    tasks = dTasks.concat(eTasks);
    
    moneyAmount = responses[5];    // Column F
    rawImageUrl = responses[6];    // Column G (Opening photo)
  } else {
    const jTasks = responses[9] ? String(responses[9]).split(/,\s*/).filter(item => item.trim().length > 0) : [];
    const kTasks = responses[10] ? String(responses[10]).split(/,\s*/).filter(item => item.trim().length > 0) : [];
    tasks = jTasks.concat(kTasks);
    
    moneyAmount = responses[11];   // Column L (Cash amount)
    rawImageUrl = responses[12];   // Column M (Confirmation photo)
  }

  // Extract direct image urls
  const displayImageUrls = getGoogleDriveDirectLinks(rawImageUrl);

  // Dynamically count total form choices for the current shift
  let totalItems = 26; // Default fallback count based on max found in database
  try {
    const formUrl = SpreadsheetApp.getActiveSpreadsheet().getFormUrl();
    if (formUrl) {
      const form = FormApp.openByUrl(formUrl);
      const checkboxItems = form.getItems(FormApp.ItemType.CHECKBOX);
      let formTotal = 0;
      checkboxItems.forEach(item => {
        const title = item.getTitle();
        const isOpening = shiftType.includes("เปิด");
        if (isOpening) {
          if (title.includes("ก่อนเปิด") || title.includes("ระบบเงินและ POS") || title.includes("Opening Cash")) {
            formTotal += item.asCheckboxItem().getChoices().length;
          }
        } else {
          if (title.includes("ความสะอาด") || title.includes("ระบบเงินและการปิดร้าน") || title.includes("Closing")) {
            formTotal += item.asCheckboxItem().getChoices().length;
          }
        }
      });
      if (formTotal > 0) {
        totalItems = formTotal;
      }
    }
  } catch (err) {
    console.log("Failed to load form options dynamically: " + err.message);
  }

  const count = tasks.length;

  // Determine completeness
  const isComplete = count >= totalItems;
  const statusText = isComplete ? "CHECKLIST COMPLETE" : "CHECKLIST INCOMPLETE";
  const statusColor = isComplete ? "#1C6C38" : "#D05D00"; // Muted Braun Green vs Braun Clock Accent Orange

  // Format checklist data for concise layout
  let formattedChecklist = "—";
  if (count > 0) {
    if (isComplete) {
      formattedChecklist = `เช็คครบถ้วน (${count} จาก ${totalItems} รายการ)`;
    } else {
      formattedChecklist = `ทำแล้ว ${count} จาก ${totalItems} รายการ (ข้อมูลไม่ครบ)`;
    }
  }

  const firstImageUrl = displayImageUrls.length > 0 ? displayImageUrls[0] : undefined;

  // Dieter Rams Flex Message Bubble Layout
  const mainBubble = {
    "type": "bubble",
    "size": "mega",
    "styles": {
      "body": {
        "backgroundColor": "#F4F4F4"
      },
      "footer": {
        "backgroundColor": "#F4F4F4",
        "separator": true,
        "separatorColor": "#EAEAEA"
      }
    },
    "hero": firstImageUrl ? {
      "type": "image",
      "url": firstImageUrl,
      "size": "full",
      "aspectRatio": "20:11",
      "aspectMode": "cover"
    } : undefined,
    "body": {
      "type": "box",
      "layout": "vertical",
      "paddingAll": "xl",
      "spacing": "md",
      "contents": [
        {
          "type": "box",
          "layout": "horizontal",
          "alignItems": "center",
          "contents": [
            {
              "type": "text",
              "text": "SYSTEM // REPORT",
              "size": "xxs",
              "color": "#8C8C8C",
              "weight": "bold",
              "flex": 1
            },
            {
              "type": "box",
              "layout": "horizontal",
              "spacing": "xs",
              "alignItems": "center",
              "contents": [
                {
                  "type": "box",
                  "layout": "vertical",
                  "backgroundColor": statusColor,
                  "width": "8px",
                  "height": "8px",
                  "cornerRadius": "4px",
                  "contents": []
                },
                {
                  "type": "text",
                  "text": statusText,
                  "size": "xxs",
                  "weight": "bold",
                  "color": "#1C1C1C"
                }
              ]
            }
          ]
        },
        {
          "type": "text",
          "text": shiftType,
          "size": "xl",
          "weight": "bold",
          "color": "#1C1C1C",
          "wrap": true,
          "margin": "xs"
        },
        {
          "type": "separator",
          "color": "#E5E5E5",
          "margin": "md"
        },
        {
          "type": "box",
          "layout": "vertical",
          "spacing": "sm",
          "margin": "md",
          "contents": [
            {
              "type": "box",
              "layout": "horizontal",
              "contents": [
                {
                  "type": "text",
                  "text": "STAFF",
                  "color": "#8C8C8C",
                  "size": "xs",
                  "weight": "bold",
                  "flex": 3
                },
                {
                  "type": "text",
                  "text": staffName,
                  "color": "#1C1C1C",
                  "size": "sm",
                  "weight": "bold",
                  "flex": 7
                }
              ]
            },
            {
              "type": "box",
              "layout": "horizontal",
              "contents": [
                {
                  "type": "text",
                  "text": "CHECKLIST",
                  "color": "#8C8C8C",
                  "size": "xs",
                  "weight": "bold",
                  "flex": 3
                },
                {
                  "type": "text",
                  "text": formattedChecklist,
                  "color": "#1C1C1C",
                  "size": "sm",
                  "wrap": true,
                  "flex": 7
                }
              ]
            },
            {
              "type": "box",
              "layout": "horizontal",
              "contents": [
                {
                  "type": "text",
                  "text": "TIMESTAMP",
                  "color": "#8C8C8C",
                  "size": "xs",
                  "weight": "bold",
                  "flex": 3
                },
                {
                  "type": "text",
                  "text": formatTimestamp(timestamp),
                  "color": "#1C1C1C",
                  "size": "sm",
                  "flex": 7
                }
              ]
            }
          ]
        },
        // Dieter Rams / Braun LCD-style display for cash registers
        (moneyAmount && moneyAmount !== "0" && moneyAmount !== "") ? {
          "type": "box",
          "layout": "vertical",
          "backgroundColor": "#DCE2DA", // Muted light greenish gray LCD color
          "borderColor": "#B8BFB5",
          "borderWidth": "semi-bold",
          "cornerRadius": "md",
          "paddingAll": "lg",
          "margin": "lg",
          "contents": [
            {
              "type": "text",
              "text": "REGISTER TOTAL // CASH",
              "size": "xxs",
              "color": "#5E6659",
              "weight": "bold"
            },
            {
              "type": "text",
              "text": formatCurrency(moneyAmount),
              "size": "xxl",
              "weight": "bold",
              "color": "#1C2118",
              "align": "end",
              "margin": "xs"
            }
          ]
        } : null
      ].filter(Boolean)
    },
    "footer": {
      "type": "box",
      "layout": "vertical",
      "spacing": "sm",
      "paddingAll": "lg",
      "contents": [
        {
          "type": "button",
          "action": {
            "type": "uri",
            "label": "📋 ดูสรุปข้อมูล Checklist",
            "uri": "https://inthehaus-hr.vercel.app/checklist"
          },
          "style": "primary",
          "color": "#7C7C7C",
          "height": "sm"
        },
        {
          "type": "text",
          "text": "ONHAUS SYSTEM ©",
          "size": "xxs",
          "color": "#A5A5A5",
          "weight": "bold",
          "align": "center",
          "margin": "md"
        }
      ]
    }
  };

  let flexContents;
  if (displayImageUrls.length <= 1) {
    flexContents = mainBubble;
  } else {
    const bubbles = [mainBubble];
    // LINE supports up to 10 bubbles in a carousel
    const extraImages = displayImageUrls.slice(1, 10);
    extraImages.forEach((imgUrl, idx) => {
      bubbles.push({
        "type": "bubble",
        "size": "mega",
        "body": {
          "type": "box",
          "layout": "vertical",
          "paddingAll": "none",
          "contents": [
            {
              "type": "image",
              "url": imgUrl,
              "size": "full",
              "aspectRatio": "20:33",
              "aspectMode": "cover"
            },
            {
              "type": "box",
              "layout": "vertical",
              "position": "absolute",
              "offsetTop": "12px",
              "offsetStart": "12px",
              "backgroundColor": "#1C1C1CCC",
              "cornerRadius": "sm",
              "paddingTop": "xs",
              "paddingBottom": "xs",
              "paddingStart": "sm",
              "paddingEnd": "sm",
              "contents": [
                {
                  "type": "text",
                  "text": `ATTACHMENT // PHOTO ${idx + 2}`,
                  "size": "xxs",
                  "color": "#FFFFFF",
                  "weight": "bold"
                }
              ]
            }
          ]
        }
      });
    });
    flexContents = {
      "type": "carousel",
      "contents": bubbles
    };
  }

  const messagePayload = {
    "type": "flex",
    "altText": `REPORT // ${shiftType.toUpperCase()} BY ${staffName.toUpperCase()}`,
    "contents": flexContents
  };

  sendToLine(messagePayload);
}

/**
 * Send scheduled daily reminders with minimal Braun-aesthetic layout
 */
function notifyDailyReminders() {
  const messagePayload = {
    "type": "flex",
    "altText": "DAILY MISSION // PROTOCOL",
    "contents": {
      "type": "bubble",
      "size": "mega",
      "styles": {
        "body": {
          "backgroundColor": "#F4F4F4"
        },
        "footer": {
          "backgroundColor": "#F4F4F4",
          "separator": true,
          "separatorColor": "#EAEAEA"
        }
      },
      "body": {
        "type": "box",
        "layout": "vertical",
        "paddingAll": "xl",
        "spacing": "lg",
        "contents": [
          {
            "type": "text",
            "text": "DAILY MISSION // PROTOCOL",
            "size": "xxs",
            "color": "#8C8C8C",
            "weight": "bold"
          },
          {
            "type": "text",
            "text": "อรุณสวัสดิ์ทีมงาน!",
            "size": "xxl",
            "weight": "bold",
            "color": "#1C1C1C"
          },
          {
            "type": "text",
            "text": "โปรดดำเนินการส่งรายงานการเช็คลิสต์ประจำวันตามกำหนดเวลาของแต่ละกะให้ครบถ้วน:",
            "size": "sm",
            "color": "#5A5A5A",
            "wrap": true
          },
          {
            "type": "separator",
            "color": "#E5E5E5"
          },
          {
            "type": "box",
            "layout": "vertical",
            "spacing": "md",
            "contents": [
              {
                "type": "box",
                "layout": "horizontal",
                "spacing": "md",
                "contents": [
                  {
                    "type": "box",
                    "layout": "vertical",
                    "backgroundColor": "#D05D00", // Alarm clock amber
                    "width": "4px",
                    "cornerRadius": "xs"
                  },
                  {
                    "type": "box",
                    "layout": "vertical",
                    "spacing": "xxs",
                    "contents": [
                      {
                        "type": "text",
                        "text": "กะเปิดร้าน // 09:00",
                        "size": "xxs",
                        "color": "#8C8C8C",
                        "weight": "bold"
                      },
                      {
                        "type": "text",
                        "text": "เตรียมความเรียบร้อยหน้าร้าน",
                        "size": "sm",
                        "weight": "bold",
                        "color": "#1C1C1C"
                      },
                      {
                        "type": "text",
                        "text": "ตรวจสอบหน้าร้าน, อุปกรณ์, และเปิดระบบ",
                        "size": "xs",
                        "color": "#7A7A7A",
                        "wrap": true
                      }
                    ]
                  }
                ]
              },
              {
                "type": "box",
                "layout": "horizontal",
                "spacing": "md",
                "contents": [
                  {
                    "type": "box",
                    "layout": "vertical",
                    "backgroundColor": "#1C1C1C", // Charcoal black
                    "width": "4px",
                    "cornerRadius": "xs"
                  },
                  {
                    "type": "box",
                    "layout": "vertical",
                    "spacing": "xxs",
                    "contents": [
                      {
                        "type": "text",
                        "text": "กะปิดร้าน // ก่อนปิดระบบ",
                        "size": "xxs",
                        "color": "#8C8C8C",
                        "weight": "bold"
                      },
                      {
                        "type": "text",
                        "text": "สรุปยอดเงินและปิดระบบไฟ",
                        "size": "sm",
                        "weight": "bold",
                        "color": "#1C1C1C"
                      },
                      {
                        "type": "text",
                        "text": "ตรวจความเรียบร้อยรอบร้าน, ยอดเงินสดในเก๊ะ, และความปลอดภัย",
                        "size": "xs",
                        "color": "#7A7A7A",
                        "wrap": true
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      "footer": {
        "type": "box",
        "layout": "vertical",
        "spacing": "md",
        "paddingAll": "lg",
        "contents": [
          {
            "type": "button",
            "action": {
              "type": "uri",
              "label": "เปิดฟอร์ม CHECKLIST",
              "uri": FORM_LINK
            },
            "style": "primary",
            "color": "#1C1C1C",
            "height": "sm"
          },
          {
            "type": "text",
            "text": "ONHAUS SYSTEM ©",
            "size": "xxs",
            "color": "#A5A5A5",
            "weight": "bold",
            "align": "center"
          }
        ]
      }
    }
  };
  
  sendToLine(messagePayload);
}

/**
 * Format currency with commas and currency symbol
 * @param {string|number} val Input cash balance string or number
 * @returns {string} Formatted Thai Baht currency string
 */
function formatCurrency(val) {
  if (val === undefined || val === null || val === "") return "฿ 0";
  // Remove non-numeric characters except decimal points
  const cleanVal = String(val).replace(/[^0-9.]/g, '');
  const num = parseFloat(cleanVal);
  if (isNaN(num)) return "฿ " + val;
  return "฿ " + num.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/**
 * Robustly extract file IDs from Google Drive link list and format as direct access images
 * @param {string} urlStr Comma-separated string of drive URLs
 * @returns {Array<string>} Array of direct image links
 */
function getGoogleDriveDirectLinks(urlStr) {
  if (!urlStr) return [];
  const urls = urlStr.split(/[\s,]+/).filter(Boolean);
  const directLinks = [];
  urls.forEach(url => {
    const match = url.match(/(?:id=|\/d\/)([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      directLinks.push("https://lh3.googleusercontent.com/d/" + match[1] + "=s1600");
    } else if (url.indexOf("http") === 0) {
      directLinks.push(url);
    }
  });
  return directLinks;
}

/**
 * Robustly extract file ID from Google Drive link and format as direct access image
 * @param {string} url Raw upload URL from Google Forms
 * @returns {string} Direct web preview URL, or original url if not drive, or empty string
 */
function getGoogleDriveDirectLink(url) {
  const links = getGoogleDriveDirectLinks(url);
  return links.length > 0 ? links[0] : "";
}

/**
 * Send HTTP POST request to LINE Messaging API
 * @param {Object} payload LINE Flex message layout structure
 */
function sendToLine(payload) {
  const url = 'https://api.line.me/v2/bot/message/push';
  const options = {
    'headers': {
      'Content-Type': 'application/json; charset=UTF-8',
      'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN,
    },
    'method': 'post',
    'payload': JSON.stringify({
      'to': GROUP_ID,
      'messages': [payload]
    }),
    'muteHttpExceptions': true
  };
  const response = UrlFetchApp.fetch(url, options);
  console.log("LINE Response Code: " + response.getResponseCode());
  console.log("LINE Response Body: " + response.getContentText());
}

/**
 * Webhook handler to save Group ID when added to a new chat
 * @param {Object} e Event object from post request
 */
function doPost(e) {
  const json = JSON.parse(e.postData.contents);
  const event = json.events[0];
  if (event && event.source && (event.source.type === 'group' || event.source.type === 'room')) {
    const id = event.source.groupId || event.source.roomId;
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    sheet.getRange("A1").setValue("Group ID: " + id);
  }
  return ContentService.createTextOutput(JSON.stringify({content:"ok"})).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Send scheduled morning reminder at 10:00 (Check-in, Stock, Form)
 */
function notifyMorningReminder() {
  const messagePayload = {
    "type": "flex",
    "altText": "☀️ DAILY MISSION: อย่าลืม CHECK-IN & STOCK",
    "contents": {
      "type": "bubble",
      "size": "mega",
      "styles": {
        "body": { "backgroundColor": "#F4F4F4" },
        "footer": { "backgroundColor": "#F4F4F4", "separator": true, "separatorColor": "#EAEAEA" }
      },
      "body": {
        "type": "box",
        "layout": "vertical",
        "paddingAll": "xl",
        "spacing": "lg",
        "contents": [
          {
            "type": "box",
            "layout": "horizontal",
            "alignItems": "center",
            "contents": [
              {
                "type": "text",
                "text": "DAILY MISSION // PROTOCOL",
                "size": "xxs",
                "color": "#8C8C8C",
                "weight": "bold",
                "flex": 1
              },
              {
                "type": "box",
                "layout": "horizontal",
                "spacing": "xs",
                "alignItems": "center",
                "contents": [
                  {
                    "type": "box",
                    "layout": "vertical",
                    "backgroundColor": "#D05D00",
                    "width": "8px",
                    "height": "8px",
                    "cornerRadius": "4px",
                    "contents": []
                  },
                  {
                    "type": "text",
                    "text": "STANDBY",
                    "size": "xxs",
                    "weight": "bold",
                    "color": "#1C1C1C"
                  }
                ]
              }
            ]
          },
          { "type": "text", "text": "อรุณสวัสดิ์ทีมงาน! ☀️", "size": "xxl", "weight": "bold", "color": "#1C1C1C", "margin": "xs" },
          { "type": "text", "text": "ได้เวลาเปิดร้านแล้ว โปรดบันทึกเวลาเข้างาน เช็คสต๊อกประจำวัน และทำเช็คลิสต์กะเปิดร้านให้เรียบร้อยครับ", "size": "sm", "color": "#5A5A5A", "wrap": true },
          { "type": "separator", "color": "#E5E5E5" },
          {
            "type": "box",
            "layout": "vertical",
            "spacing": "md",
            "contents": [
              {
                "type": "box",
                "layout": "horizontal",
                "spacing": "md",
                "contents": [
                  { "type": "box", "layout": "vertical", "backgroundColor": "#D05D00", "width": "4px", "cornerRadius": "xs", "contents": [] },
                  {
                    "type": "box",
                    "layout": "vertical",
                    "spacing": "xs",
                    "contents": [
                      { "type": "text", "text": "กะเปิดร้าน // 10:00", "size": "xxs", "color": "#8C8C8C", "weight": "bold" },
                      { "type": "text", "text": "Check-in เข้างาน และ เช็คสต๊อก", "size": "sm", "weight": "bold", "color": "#1C1C1C" },
                      { "type": "text", "text": "เตรียมความเรียบร้อยหน้าร้าน, อุปกรณ์, และเปิดระบบ", "size": "xs", "color": "#7A7A7A", "wrap": true }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      "footer": {
        "type": "box",
        "layout": "vertical",
        "spacing": "sm",
        "paddingAll": "lg",
        "contents": [
          {
            "type": "button",
            "action": { "type": "uri", "label": "🟢 บันทึกเวลาเข้างาน (CHECK IN)", "uri": "https://inthehaus-hr.vercel.app/checkin" },
            "style": "primary", "color": "#1C1C1C", "height": "sm"
          },
          {
            "type": "button",
            "action": { "type": "uri", "label": "📦 เช็คสต๊อก (CHECK STOCK)", "uri": "https://haustable.vercel.app/staff/stock" },
            "style": "primary", "color": "#7C7C7C", "height": "sm"
          },
          {
            "type": "button",
            "action": { "type": "uri", "label": "📋 เปิดฟอร์ม CHECKLIST", "uri": FORM_LINK },
            "style": "primary", "color": "#7C7C7C", "height": "sm"
          },
          { "type": "text", "text": "ONHAUS SYSTEM ©", "size": "xxs", "color": "#A5A5A5", "weight": "bold", "align": "center", "margin": "md" }
        ]
      }
    }
  };
  sendToLine(messagePayload);
}

/**
 * Send scheduled evening reminder at 23:00 (Check-out, Stock, Form)
 */
function notifyEveningReminder() {
  const messagePayload = {
    "type": "flex",
    "altText": "🌙 DAILY MISSION: อย่าลืม CHECK-OUT & STOCK",
    "contents": {
      "type": "bubble",
      "size": "mega",
      "styles": {
        "body": { "backgroundColor": "#F4F4F4" },
        "footer": { "backgroundColor": "#F4F4F4", "separator": true, "separatorColor": "#EAEAEA" }
      },
      "body": {
        "type": "box",
        "layout": "vertical",
        "paddingAll": "xl",
        "spacing": "lg",
        "contents": [
          {
            "type": "box",
            "layout": "horizontal",
            "alignItems": "center",
            "contents": [
              {
                "type": "text",
                "text": "DAILY MISSION // PROTOCOL",
                "size": "xxs",
                "color": "#8C8C8C",
                "weight": "bold",
                "flex": 1
              },
              {
                "type": "box",
                "layout": "horizontal",
                "spacing": "xs",
                "alignItems": "center",
                "contents": [
                  {
                    "type": "box",
                    "layout": "vertical",
                    "backgroundColor": "#1C1C1C",
                    "width": "8px",
                    "height": "8px",
                    "cornerRadius": "4px",
                    "contents": []
                  },
                  {
                    "type": "text",
                    "text": "STANDBY",
                    "size": "xxs",
                    "weight": "bold",
                    "color": "#1C1C1C"
                  }
                ]
              }
            ]
          },
          { "type": "text", "text": "เตรียมปิดระบบร้าน! 🌙", "size": "xxl", "weight": "bold", "color": "#1C1C1C", "margin": "xs" },
          { "type": "text", "text": "ได้เวลาปิดกะร้านแล้ว โปรดบันทึกเวลาออกงาน เช็คสต๊อก และทำเช็คลิสต์กะปิดร้านให้เรียบร้อยครับ", "size": "sm", "color": "#5A5A5A", "wrap": true },
          { "type": "separator", "color": "#E5E5E5" },
          {
            "type": "box",
            "layout": "vertical",
            "spacing": "md",
            "contents": [
              {
                "type": "box",
                "layout": "horizontal",
                "spacing": "md",
                "contents": [
                  { "type": "box", "layout": "vertical", "backgroundColor": "#1C1C1C", "width": "4px", "cornerRadius": "xs", "contents": [] },
                  {
                    "type": "box",
                    "layout": "vertical",
                    "spacing": "xs",
                    "contents": [
                      { "type": "text", "text": "กะปิดร้าน // 23:00", "size": "xxs", "color": "#8C8C8C", "weight": "bold" },
                      { "type": "text", "text": "Check-out ออกงาน และ เช็คสต๊อก", "size": "sm", "weight": "bold", "color": "#1C1C1C" },
                      { "type": "text", "text": "สรุปยอดเงินและปิดระบบไฟ, ตรวจสอบความเรียบร้อยรอบร้าน", "size": "xs", "color": "#7A7A7A", "wrap": true }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      "footer": {
        "type": "box",
        "layout": "vertical",
        "spacing": "sm",
        "paddingAll": "lg",
        "contents": [
          {
            "type": "button",
            "action": { "type": "uri", "label": "🔴 บันทึกเวลาออกงาน (CHECK OUT)", "uri": "https://inthehaus-hr.vercel.app/checkin" },
            "style": "primary", "color": "#1C1C1C", "height": "sm"
          },
          {
            "type": "button",
            "action": { "type": "uri", "label": "📦 เช็คสต๊อก (CHECK STOCK)", "uri": "https://haustable.vercel.app/staff/stock" },
            "style": "primary", "color": "#7C7C7C", "height": "sm"
          },
          {
            "type": "button",
            "action": { "type": "uri", "label": "📋 เปิดฟอร์ม CHECKLIST", "uri": FORM_LINK },
            "style": "primary", "color": "#7C7C7C", "height": "sm"
          },
          { "type": "text", "text": "ONHAUS SYSTEM ©", "size": "xxs", "color": "#A5A5A5", "weight": "bold", "align": "center", "margin": "md" }
        ]
      }
    }
  };
  sendToLine(messagePayload);
}

/**
 * Format timestamp to a clean, electronic-instrument style format: YYYY.MM.DD @ HH:MM
 * @param {string} rawTS Raw timestamp string from form response
 * @returns {string} Clean formatted timestamp
 */
function formatTimestamp(rawTS) {
  if (!rawTS) return "—";
  try {
    const parts = rawTS.split(" ");
    if (parts.length < 2) return rawTS;
    
    const datePart = parts[0];
    const timePart = parts[1];
    
    const timeParts = timePart.split(":");
    const cleanTime = timeParts.slice(0, 2).join(":");
    
    const dateSeparator = datePart.indexOf("/") !== -1 ? "/" : "-";
    const dateSegments = datePart.split(dateSeparator);
    
    if (dateSegments.length === 3) {
      let day = dateSegments[0];
      let month = dateSegments[1];
      let year = dateSegments[2];
      
      if (day.length === 1) day = "0" + day;
      if (month.length === 1) month = "0" + month;
      
      return year + "." + month + "." + day + " @ " + cleanTime;
    }
    return rawTS.replace(/:\d{2}$/, "");
  } catch (e) {
    return rawTS;
  }
}

/**
 * Test function to pull the absolute latest checklist submission from the spreadsheet
 * and send it directly into the LINE group chat.
 */
function testLatestSubmission() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  let lastRow = sheet.getLastRow();
  let lastRowValues = null;
  
  // Loop upwards to find the last row containing actual submission data (non-empty timestamp in Column A)
  while (lastRow >= 2) {
    const rowValues = sheet.getRange(lastRow, 1, 1, sheet.getLastColumn()).getValues()[0];
    const timestampVal = rowValues[0];
    if (timestampVal !== "" && timestampVal !== null && timestampVal !== undefined) {
      lastRowValues = rowValues;
      break;
    }
    lastRow--;
  }

  if (!lastRowValues) {
    Logger.log("No non-empty data rows found in the spreadsheet.");
    return;
  }
  
  // Format values nicely to match the form submit event values array
  const formattedValues = lastRowValues.map((val) => {
    if (val instanceof Date) {
      // Format timestamp to standard form submission format: "dd/MM/yyyy HH:mm:ss"
      return Utilities.formatDate(val, Session.getScriptTimeZone() || "GMT+7", "dd/MM/yyyy HH:mm:ss");
    }
    return val === null || val === undefined ? "" : String(val);
  });
  
  Logger.log("Testing with Row " + lastRow + ": " + JSON.stringify(formattedValues));
  onFormSubmit({ values: formattedValues });
}
