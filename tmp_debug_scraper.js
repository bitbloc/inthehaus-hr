
const fs = require('fs');

async function debugScraper() {
    const url = 'https://script.google.com/macros/s/AKfycbyC8vSspmwSUc83QJpdaADrkr3b-mtI2d6qt7QAF2eP8IogWFKe1lXpfLCxEoK6tENVsQ/exec';
    try {
        const res = await fetch(url, { redirect: 'follow' });
        const html = await res.text();
        
        console.log('HTML Length:', html.length);
        
        // 1. Unescape the whole HTML since GAS encodes special chars as \xHH
        const unescaped = html.replace(/\\x([0-9a-fA-F]{2})/g, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
        
        // 2. Look for fuel categories and count "ปกติ" nearby
        const fuels = [
            { key: 'diesel', label: 'ดีเซล' },
            { key: 'gas91', label: '91' },
            { key: 'gas95', label: '95' },
            { key: 'e20', label: 'E20' }
        ];

        console.log('--- SCANNING RESULTS ---');
        fuels.forEach(f => {
            // Regexp to find entries where the fuel type is marked as "ปกติ"
            // GAS JSON often looks like: "diesel":"ปกติ" or "ดีเซล":"ปกติ"
            const pattern = new RegExp(`"${f.key}"\\s*:\\s*"ปกติ"|"${f.label}"\\s*:\\s*"ปกติ"`, 'g');
            const count = (unescaped.match(pattern) || []).length;
            console.log(`${f.label}: Found ${count} normal stations`);
        });

        // 3. Fallback: Search for any string that contains "ปกติ" and "ดีเซล" nearby
        if (unescaped.includes('ปกติ')) {
           console.log('Found "ปกติ" in unescaped HTML! Success.');
        } else {
           // Try literal search in the absolute raw text
           console.log('Searching for raw patterns...');
           const rawOk = (html.match(/ปกติ/g) || []).length;
           console.log(`Raw "ปกติ" count: ${rawOk}`);
        }
    } catch (e) {
        console.error(e);
    }
}
debugScraper();
