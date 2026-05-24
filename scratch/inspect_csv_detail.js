// Use global fetch


const SHEET_URL = "https://docs.google.com/spreadsheets/d/1AJVcXjwuzlm5U_UPD91wWPKz76jTRrW2VPsL22MR9CU/export?format=csv";

// Paste the custom CSV parser from app/checklist/page.js
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

const csvToJson = (rows) => {
    if (rows.length < 2) return [];
    const headers = rows[0].map(h => h.trim());
    return rows.slice(1).map((row, idx) => {
        const obj = {};
        headers.forEach((h, i) => {
            if (row[i] !== undefined) obj[h] = row[i];
        });
        obj._rawRow = row;
        return obj;
    });
};

async function main() {
    const res = await fetch(SHEET_URL);
    const text = await res.text();
    const rows = parseCSV(text);
    const jsonData = csvToJson(rows);

    console.log("Headers length:", rows[0].length);
    console.log("Headers:");
    rows[0].forEach((h, idx) => {
        console.log(`[${idx}]: "${h}"`);
    });

    console.log("\nSample JSON Data (Row 1):");
    console.log(JSON.stringify(jsonData[0], null, 2));

    console.log("\nSample JSON Data (Row 2):");
    console.log(JSON.stringify(jsonData[1], null, 2));
}

main();
