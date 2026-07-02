const fs = require('fs');

// Read the refactored code
const code = fs.readFileSync(__dirname + '/dieter_rams_gas.js', 'utf8');

// Set up mock context for Google Apps Script environments
const mockPayloads = [];
const mockSpreadsheet = {
  getSheets: () => [
    {
      getRange: (cell) => ({
        setValue: (val) => {
          console.log(`[Mock Spreadsheet] Set ${cell} to: "${val}"`);
        }
      })
    }
  ]
};

const context = {
  CHANNEL_ACCESS_TOKEN: '',
  GROUP_ID: '',
  FORM_LINK: '',
  UrlFetchApp: {
    fetch: (url, options) => {
      const payload = JSON.parse(options.payload);
      mockPayloads.push({
        url,
        payload
      });
      console.log(`\n[UrlFetchApp.fetch] Request to: ${url}`);
      console.log('Flex Payload Structure:');
      console.log(JSON.stringify(payload, null, 2));
    }
  },
  SpreadsheetApp: {
    getActiveSpreadsheet: () => mockSpreadsheet
  },
  ContentService: {
    MimeType: {
      JSON: 'application/json'
    },
    createTextOutput: (str) => ({
      setMimeType: (mime) => ({
        content: str,
        mimeType: mime
      })
    })
  },
  // Placeholders that will be populated by running the code
  onFormSubmit: null,
  notifyDailyReminders: null,
  notifyMorningReminder: null,
  notifyEveningReminder: null,
  doPost: null,
  formatCurrency: null,
  getGoogleDriveDirectLink: null
};

// Evaluate the code within our context
const vm = require('vm');
vm.createContext(context);
vm.runInContext(code, context);

console.log('=== Test 1: Run onFormSubmit with default mock values (Closing Shift) ===');
context.onFormSubmit();

console.log('\n=== Test 2: Run onFormSubmit with custom mock values (Opening Shift) ===');
context.onFormSubmit({
  values: [
    "01/07/2026 09:00:00",
    "Ken",
    "☀️ กะเปิดร้าน",
    "เช็คเรียบร้อยครบถ้วน",
    "https://drive.google.com/open?id=1_OPENING_PHOTO_ID",
    "500" // Opening cash float
  ]
});

console.log('\n=== Test 3: Run notifyDailyReminders ===');
context.notifyDailyReminders();

console.log('\n=== Test 3a: Run notifyMorningReminder ===');
context.notifyMorningReminder();

console.log('\n=== Test 3b: Run notifyEveningReminder ===');
context.notifyEveningReminder();

console.log('\n=== Test 4: Run doPost with group event ===');
const mockPostData = {
  postData: {
    contents: JSON.stringify({
      events: [
        {
          source: {
            type: 'group',
            groupId: 'C1234567890abcdef'
          }
        }
      ]
    })
  }
};
const postResult = context.doPost(mockPostData);
console.log('Post Response:', JSON.stringify(postResult, null, 2));

console.log('\n=== Test 5: Verify formatCurrency helper ===');
const formats = [
  context.formatCurrency("15500"),
  context.formatCurrency("15500.50"),
  context.formatCurrency(""),
  context.formatCurrency(null),
  context.formatCurrency("text")
];
console.log('Formatted currencies:', formats);

console.log('\n=== Test 6: Verify getGoogleDriveDirectLink helper ===');
const links = [
  context.getGoogleDriveDirectLink("https://drive.google.com/open?id=12345"),
  context.getGoogleDriveDirectLink("https://drive.google.com/file/d/67890/view?usp=drivesdk"),
  context.getGoogleDriveDirectLink("https://example.com/other-image.jpg"),
  context.getGoogleDriveDirectLink("")
];
console.log('Extracted links:', links);

console.log('\nValidation Successful: All functions executed without exceptions.');
