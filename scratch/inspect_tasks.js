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
    const data = csvToJson(rows);

    const openTasks = new Set();
    const closeTasks = new Set();
    const openPos = new Set();
    const closePos = new Set();

    data.forEach(row => {
        const type = row["ช่วงเวลาที่ตรวจสอบ"] || "";
        if (type.includes("เปิดร้าน")) {
            const tasks = row["เช็คความพร้อมก่อนเปิด"] || "";
            tasks.split(',').forEach(t => {
                if (t.trim()) openTasks.add(t.trim());
            });
            const pos = row["ระบบเงินและ POS"] || "";
            pos.split(',').forEach(t => {
                if (t.trim()) openPos.add(t.trim());
            });
        } else if (type.includes("ปิดร้าน")) {
            const tasks = row["ความสะอาดและสต็อก (Cleaning & Stock)"] || "";
            tasks.split(',').forEach(t => {
                if (t.trim()) closeTasks.add(t.trim());
            });
            const pos = row["ระบบเงินและการปิดร้าน (Closing)"] || "";
            pos.split(',').forEach(t => {
                if (t.trim()) closePos.add(t.trim());
            });
        }
    });

    console.log("=== UNIQUE OPENING TASKS ===");
    console.log([...openTasks]);
    console.log("\n=== UNIQUE OPENING POS TASKS ===");
    console.log([...openPos]);
    console.log("\n=== UNIQUE CLOSING TASKS ===");
    console.log([...closeTasks]);
    console.log("\n=== UNIQUE CLOSING SYSTEM TASKS ===");
    console.log([...closePos]);
}

main();
