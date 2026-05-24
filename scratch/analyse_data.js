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

    console.log("Total entries:", data.length);
    let openCount = 0;
    let closeCount = 0;
    let otherCount = 0;

    data.forEach((row, idx) => {
        const type = row["ช่วงเวลาที่ตรวจสอบ"] || "";
        if (type.includes("เปิดร้าน")) {
            openCount++;
        } else if (type.includes("ปิดร้าน")) {
            closeCount++;
        } else {
            otherCount++;
        }
    });

    console.log("Opening entries:", openCount);
    console.log("Closing entries:", closeCount);
    console.log("Other/Unknown entries:", otherCount);

    console.log("\nLast 5 entries details:");
    data.slice(-5).forEach((item, index) => {
        console.log(`\nEntry #${index + 1}:`);
        console.log("Timestamp:", item["Group ID ของคุณคือ: C1210c7a0601b5a675060e312efe10bff"]);
        console.log("Staff Name:", item["ชื่อพนักงาน ( Aka )"]);
        console.log("Type:", item["ช่วงเวลาที่ตรวจสอบ"]);
        console.log("Opening Cash:", item["ระบุยอดเงินในลิ้นชักก่อนเปิด (บาท)"]);
        console.log("Closing Cash:", item["ระบุยอดเงินสดปิดร้าน (บาท)"]);
        console.log("Photos (Opening):", item["ถ่ายรูปหน้าร้านหลังเตรียมเสร็จ"] ? "Yes" : "No");
        console.log("Photos (Closing):", item["ถ่ายรูปพื้นที่ก่อนปิดร้าน"] ? "Yes" : "No");
    });
}

main();
