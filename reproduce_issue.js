
const { format, isValid } = require('date-fns');

// Mock browser fetch if needed, but in node we use 'fetch' (Node 18+)
// If simpler, we just use the logic directly.

const SHEET_URL = "https://docs.google.com/spreadsheets/d/1AJVcXjwuzlm5U_UPD91wWPKz76jTRrW2VPsL22MR9CU/export?format=csv";

const parseThaiDate = (dateStr) => {
    if (!dateStr) return null; // Changed from new Date()
    const str = String(dateStr).trim();
    if (!str) return null;

    let date;

    // Enforce d/m/y parsing for Google Sheet exports
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
        // Fallback
        date = new Date(dateStr);
    }

    if (!isValid(date)) {
        console.warn("Invalid date parsed:", dateStr);
        return null; // Changed from new Date()
    }
    return date;
}

async function run() {
    try {
        console.log("Fetching CSV...");
        const res = await fetch(SHEET_URL);
        const text = await res.text();
        console.log("CSV fetched. Length:", text.length);

        const rows = text.split('\n').filter(r => r.trim());
        console.log("Total rows:", rows.length);

        // Inspect headers
        console.log("Headers:", rows[0]);

        // Inspect first 5 rows and some Jan 2026 rows
        const parsedRows = rows.slice(1).map((row, i) => {
            // CSV split by comma is naive but might work for Timestamp if it's first
            // Note: Quoted fields with commas break this.
            // But Timestamp is usually first and unquoted if simple? 
            // Actually Google CSV quotes everything usually.
            // Let's just regex match the date at the start line
            const match = row.match(/"([^"]+)"/); // Match first quoted string
            const timestamp = match ? match[1] : row.split(',')[0];

            const pDate = parseThaiDate(timestamp);
            return {
                original: timestamp,
                parsed: pDate,
                rowString: row.substring(0, 50) + "..."
            };
        });

        const jan26 = parsedRows.filter(r => r.parsed && r.parsed.getFullYear() === 2026 && r.parsed.getMonth() === 0);
        console.log("Found Jan 2026 records:", jan26.length);

        console.log("--- Sample Jan 2026 ---");
        jan26.slice(0, 5).forEach(r => {
            console.log(`Original: [${r.original}] -> Parsed: ${format(r.parsed, 'yyyy-MM-dd HH:mm:ss')}`);
        });

        console.log("--- Sample Invalid/Null ---");
        const invalid = parsedRows.filter(r => !r.parsed);
        console.log("Invalid count:", invalid.length);
        invalid.slice(0, 5).forEach(r => {
            console.log(`Original: [${r.original}]`);
        });

        // Check for 1970
        const y1970 = parsedRows.filter(r => r.parsed && r.parsed.getFullYear() === 1970);
        console.log("\nFound 1970 records:", y1970.length);


    } catch (e) {
        console.error(e);
    }
}

run();
