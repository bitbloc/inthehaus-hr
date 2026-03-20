
const fs = require('fs');

async function debugContext() {
    const url = 'https://script.google.com/macros/s/AKfycbyC8vSspmwSUc83QJpdaADrkr3b-mtI2d6qt7QAF2eP8IogWFKe1lXpfLCxEoK6tENVsQ/exec';
    try {
        const res = await fetch(url, { redirect: 'follow' });
        const html = await res.text();
        const unescaped = html.replace(/\\x([0-9a-fA-F]{2})/g, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
        
        const index = unescaped.indexOf('ปกติ');
        if (index !== -1) {
            console.log('--- CONTEXT AROUND "ปกติ" ---');
            console.log(unescaped.substring(index - 200, index + 200));
        } else {
            console.log('"ปกติ" not found in unescaped text');
        }
    } catch (e) { console.error(e); }
}
debugContext();
