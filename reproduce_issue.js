
const { format, isValid } = require('date-fns');

const parseThaiDate = (dateStr) => {
    if (!dateStr) return new Date();
    const str = String(dateStr).trim();
    let date;

    // Enforce d/m/y parsing for Google Sheet exports
    // Matches start with d/m/y (allowing 1 or 2 digits)
    const dateMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);

    if (dateMatch) {
        const day = dateMatch[1].padStart(2, '0');
        const month = dateMatch[2].padStart(2, '0');
        const year = dateMatch[3];

        let hour = '00';
        let minute = '00';
        let second = '00';

        // Look for time component anywhere in the string
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

    if (!isValid(date)) {
        console.warn("Invalid date parsed:", dateStr);
        return new Date();
    }
    return date;
}

// Test cases
const testDates = [
    "9/1/2026, 12:50:45",   // Jan 9 (Valid)
    "8/1/2026, 12:50:45",   // Jan 8 (Previously problematic if fallback)
    "6/1/2026, 0:09:02",    // Jan 6
    "8/1/2026",             // Jan 8 (No time)
    "5/1/2026 15:07:46",    // Jan 5 (No comma)
    "1/8/2026"              // Aug 1 (d=1, m=8)
];

testDates.forEach(d => {
    const parsed = parseThaiDate(d);
    console.log(`Original: "${d}" -> Parsed: ${format(parsed, 'yyyy-MM-dd HH:mm:ss')} (Month: ${format(parsed, 'MMMM')})`);
});
