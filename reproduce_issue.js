const XLSX = require('xlsx');
const { format, isValid, parse } = require('date-fns');

const SHEET_URL = "https://docs.google.com/spreadsheets/d/1AJVcXjwuzlm5U_UPD91wWPKz76jTRrW2VPsL22MR9CU/export?format=csv";

// Logic mirrored STRICTLY from app/checklist/page.js
const parseThaiDate = (dateStr) => {
    if (!dateStr) return null;

    // Case 1: Excel Serial Date (Numbers) - Kept for safety, though raw:false reduces likelihood
    if (!isNaN(dateStr) && parseFloat(dateStr) > 30000) {
        return new Date((parseFloat(dateStr) - 25569) * 86400 * 1000);
    }

    // Clean string
    const str = String(dateStr).replace(/,/g, ' ').replace(/\s+/g, ' ').trim();

    // Case 2: Explicit Formats
    const formatsToTry = [
        'd/M/yyyy H:mm:ss',
        'd/M/yyyy HH:mm:ss',
        'dd/MM/yyyy HH:mm:ss',
        'yyyy-MM-dd HH:mm:ss',
        'd/M/yyyy H:mm',
        'd/M/yyyy',
        // Support 2-digit year (e.g. 9/1/26) -> strictly D/M/YY
        'd/M/yy H:mm:ss',
        'd/M/yy'
    ];

    for (const fmt of formatsToTry) {
        const parsed = parse(str, fmt, new Date());
        if (isValid(parsed)) {
            // Fix 2-digit year
            if (parsed.getFullYear() < 100) {
                parsed.setFullYear(parsed.getFullYear() + 2000);
            }
            return parsed;
        }
    }

    // Case 3: Native Fallback (Restricted)
    if (!str.includes('/')) {
        const nativeParse = new Date(str);
        if (isValid(nativeParse)) return nativeParse;
    }

    return null;
}

// Custom CSV Parser to bypass XLSX assumptions
function parseCSV(text) {
    const rows = [];
    let currentRow = [];
    let currentVal = '';
    let insideQuote = false;

    // Normalize newlines
    const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    for (let i = 0; i < cleanText.length; i++) {
        const char = cleanText[i];
        const nextChar = cleanText[i + 1];

        if (char === '"') {
            if (insideQuote && nextChar === '"') {
                currentVal += '"';
                i++; // Skip escaped quote
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
}

// Map CSV array to JSON-like objects (using headers from row 0)
function csvToJson(rows) {
    if (rows.length < 2) return [];
    const headers = rows[0].map(h => h.trim());
    return rows.slice(1).map((row, idx) => {
        const obj = {};
        headers.forEach((h, i) => {
            if (row[i] !== undefined) obj[h] = row[i];
        });
        // Fallback for unnamed columns or access by index
        obj._rawRow = row;
        return obj;
    });
}

async function run() {
    try {
        console.log("Fetching CSV...");
        const res = await fetch(SHEET_URL);
        const csvText = await res.text();

        console.log("Parsing CSV manually...");
        const rows = parseCSV(csvText);
        const jsonData = csvToJson(rows);

        console.log("Parsed Rows:", jsonData.length);

        console.log("\n--- Debug Raw Values (Rows > 70) ---");
        jsonData.forEach((row, i) => {
            const rowIndex = i + 2; // +2 for 1-based and header
            if (rowIndex > 70) {
                // Try to find Timestamp
                const ts = row["Timestamp"] || row["ประทับเวลา"] || row._rawRow && row._rawRow[0];
                const parsed = parseThaiDate(ts);

                console.log(`Row ${rowIndex}: Raw="${ts}" -> Parsed=${parsed ? format(parsed, 'yyyy-MM-dd HH:mm:ss') : 'NULL'}`);
            }
        });
    } catch (e) {
        console.error(e);
    }
}

run();
