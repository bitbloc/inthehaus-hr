
const fs = require('fs');

async function testRegexExploration() {
  const url = 'https://script.google.com/macros/s/AKfycbyC8vSspmwSUc83QJpdaADrkr3b-mtI2d6qt7QAF2eP8IogWFKe1lXpfLCxEoK6tENVsQ/exec';
  try {
    const res = await fetch(url, { redirect: 'follow' });
    const html = await res.text();
    
    // 1. Find goog.script.init call
    const initMatch = html.match(/goog\.script\.init\(\s*"(.*?)"\s*,\s*""\s*,\s*undefined/);
    if (!initMatch) {
      console.log('No goog.script.init found');
      return;
    }
    
    // 2. Decode Hex escapes (\xHH)
    let rawStr = initMatch[1];
    let decoded = rawStr.replace(/\\x([0-9a-fA-F]{2})/g, (match, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });
    
    // 3. Handle JavaScript-style escaped quotes
    decoded = decoded.replace(/\\"/g, '"');
    
    console.log('--- DECODED PREVIEW ---');
    console.log(decoded.substring(0, 300) + '...');
    
    // 4. Look for allData array inside the decoded string
    const dataMatch = decoded.match(/let allData\s*=\s*(\[[\s\S]*?\]);/);
    if (dataMatch) {
      console.log('Found allData array!');
      try {
        // Evaluate the array carefully or use JSON.parse if it's clean
        const allDataText = dataMatch[1];
        // Note: Sometimes the data contains unquoted keys or JS comments
        // We'll try to refine it for JSON.parse or use a safer approach
        const allData = JSON.parse(allDataText);
        console.log('Total stations found:', allData.length);
        
        const fuels = ['diesel', 'gas91', 'gas95', 'e20'];
        const stats = {};
        fuels.forEach(f => {
          stats[f] = allData.filter(s => s[f] === 'ปกติ').length;
        });
        console.log('Current Stats (Normal):', stats);
      } catch (parseErr) {
        console.log('JSON Parse failed for allData, trying to count with regex...');
        const fuels = ['diesel', 'gas91', 'gas95', 'e20'];
        fuels.forEach(f => {
          const count = (decoded.match(new RegExp(`"${f}"\\s*:\\s*"ปกติ"`, 'g')) || []).length;
          console.log(`${f} (Normal count via regex): ${count}`);
        });
      }
    } else {
      console.log('allData array not found in decoded string.');
    }
    
  } catch (e) {
    console.error('Error:', e.message);
  }
}
testRegexExploration();
