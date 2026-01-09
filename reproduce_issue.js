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

async function run() {
    try {
        console.log("Fetching CSV...");
        const res = await fetch(SHEET_URL);
        const csvText = await res.text();

        const workbook = XLSX.read(csvText, { type: "string" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // Use raw: false as per fix
        const jsonData = XLSX.utils.sheet_to_json(sheet, { raw: false });

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
