
const XLSX = require('xlsx');
const { format, isValid } = require('date-fns');

const SHEET_URL = "https://docs.google.com/spreadsheets/d/1AJVcXjwuzlm5U_UPD91wWPKz76jTRrW2VPsL22MR9CU/export?format=csv";

// Logic mirrored STRICTLY from app/checklist/page.js
const parseThaiDate = (dateStr) => {
    if (!dateStr) return null;

    let date;
    const str = String(dateStr).trim();
    if (!str) return null;

    if (!isNaN(dateStr) && parseFloat(dateStr) > 20000) {
        const excelDate = parseFloat(dateStr);
        // (Serial - 25569) * 86400000
        date = new Date((excelDate - 25569) * 86400000);
    }
    else {
        // Enforce d/m/y parsing
        const dateMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);

        if (dateMatch) {
            const day = dateMatch[1].padStart(2, '0');
            const month = dateMatch[2].padStart(2, '0');
            const year = dateMatch[3];

            let hour = '00';
            let minute = '00';
            let second = '00';

            const timeMatch = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
            if (timeMatch) {
                hour = timeMatch[1].padStart(2, '0');
                minute = timeMatch[2].padStart(2, '0');
                if (timeMatch[3]) second = timeMatch[3].padStart(2, '0');
            }

            date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
        } else {
            // Fallback for standard ISO or other formats
            date = new Date(dateStr);
        }
    }

    if (!isValid(date) || date.getFullYear() < 2000) {
        // console.warn("Invalid date parsed:", dateStr);
        return null;
    }
    return date;
}

async function run() {
    try {
        console.log("Fetching CSV...");
        const res = await fetch(SHEET_URL);
        const csvText = await res.text();

        const workbook = XLSX.read(csvText, { type: "string" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet);

        console.log("XLSX Parsed Rows:", jsonData.length);

        let parsedData = jsonData.map((row, i) => {
            const getValue = (searchKey) => {
                const key = Object.keys(row).find(k => k.trim() === searchKey.trim());
                return key ? row[key] : undefined;
            };

            const rawTimestamp = getValue("Timestamp") || getValue("ประทับเวลา") || Object.values(row)[0];
            const parsed = parseThaiDate(rawTimestamp);

            return {
                row: i + 2,
                raw: rawTimestamp,
                parsed: parsed,
                isValid: isValid(parsed)
            };
        });

        const y1970 = parsedData.filter(d => d.isValid && d.parsed.getFullYear() < 2000);
        console.log("\n--- Remaining Pre-2000 (Should be 0) ---");
        console.log("Count:", y1970.length);

        const jan2026 = parsedData.filter(d => d.isValid && d.parsed.getFullYear() === 2026 && d.parsed.getMonth() === 0);
        console.log("\n--- Jan 2026 Analysis (Valid) ---");
        console.log("Count:", jan2026.length);
        jan2026.forEach(d => {
            console.log(`Row ${d.row}: "${d.raw}" -> ${format(d.parsed, 'yyyy-MM-dd HH:mm:ss')}`);
        });

    } catch (e) {
        console.error(e);
    }
}

run();
