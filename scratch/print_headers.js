// Use global fetch


const SHEET_URL = "https://docs.google.com/spreadsheets/d/1AJVcXjwuzlm5U_UPD91wWPKz76jTRrW2VPsL22MR9CU/export?format=csv";

const parseCSV = (text) => {
    const rows = [];
    let currentRow = [];
    let currentVal = '';
    let insideQuote = false;
    const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (let i = 0; i < cleanText.length; i++) {
        const char = cleanText[i];
        const nextChar = cleanText[i + 1];
        if (char === '"') {
            if (insideQuote && nextChar === '"') {
                currentVal += '"';
                i++;
            } else {
                insideQuote = !insideQuote;
            }
        } else if (char === ',' && !insideQuote) {
            currentRow.push(currentVal);
            currentVal = '';
        } else if (char === '\n' && !insideQuote) {
            currentRow.push(currentVal);
            rows.push(currentRow);
            currentRow = [];
            currentVal = '';
        } else {
            currentVal += char;
        }
    }
    if (currentVal || currentRow.length > 0) {
        currentRow.push(currentVal);
        rows.push(currentRow);
    }
    return rows;
};

async function main() {
    const res = await fetch(SHEET_URL);
    const text = await res.text();
    const rows = parseCSV(text);
    rows[0].forEach((h, idx) => {
        console.log(`Header [${idx}]: "${h}"`);
    });
}
main();
