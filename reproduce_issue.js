
const XLSX = require('xlsx');
const { format, isValid, parse } = require('date-fns');

const SHEET_URL = "https://docs.google.com/spreadsheets/d/1AJVcXjwuzlm5U_UPD91wWPKz76jTRrW2VPsL22MR9CU/export?format=csv";

// Logic mirrored from potential fix for app/checklist/page.js
const parseThaiDate = (dateStr) => {
    if (!dateStr) return null;

    // Case 1: Excel Serial Date (Numbers)
    if (!isNaN(dateStr) && parseFloat(dateStr) > 20000) {
        const excelDate = parseFloat(dateStr);
        return new Date((excelDate - 25569) * 86400 * 1000);
    }

    // Clean string: Normalize
    // Replace comma with space, then collapse multiple spaces
    const str = String(dateStr).replace(/,/g, ' ').replace(/\s+/g, ' ').trim();

    // formatsToTry need to match the cleaned string
    // Cleaned string likely: "1/1/2026 4:05:59"
    const formatsToTry = [
        'd/M/yyyy H:mm:ss',
        'd/M/yyyy HH:mm:ss',
        'dd/MM/yyyy HH:mm:ss',
        'yyyy-MM-dd HH:mm:ss',
        'd/M/yyyy H:mm', // Handle missing seconds?
        'd/M/yyyy'      // Handle missing time?
    ];

    for (const fmt of formatsToTry) {
        const parsed = parse(str, fmt, new Date());
        if (isValid(parsed)) return parsed;
    }

    // Capture failure for debugging
    // if (dateStr.includes('2026')) console.log(`Failed to parse: "${dateStr}" -> Cleaned: "${str}"`);
    return null;
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

        // Debug failures for Jan 2026 (Rows > 60)
        console.log("\n--- Debugging Failures (Rows > 60) ---");
        parsedData.forEach(d => {
            if (d.row > 60 && !d.isValid) {
                console.log(`Row ${d.row} FAILED: Raw="${d.raw}"`);
            }
        });

        // Check all Jan 2026
        // const jan2026 = parsedData
        //     .filter(d => d.isValid && d.parsed.getFullYear() === 2026 && d.parsed.getMonth() === 0)
        //     .sort((a, b) => a.parsed - b.parsed);

        console.log("\n--- Debug Dump (Rows > 70) ---");
        parsedData.forEach(d => {
            if (d.row > 70) {
                console.log(`Row ${d.row}: "${d.raw}" -> ${d.isValid ? format(d.parsed, 'yyyy-MM-dd HH:mm:ss') : 'INVALID'}`);
            }
        });

    } catch (e) {
        console.error(e);
    }
}

run();
