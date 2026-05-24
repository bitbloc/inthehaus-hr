// Use global fetch


const SHEET_URL = "https://docs.google.com/spreadsheets/d/1AJVcXjwuzlm5U_UPD91wWPKz76jTRrW2VPsL22MR9CU/export?format=csv";

async function main() {
    try {
        const res = await fetch(SHEET_URL);
        const text = await res.text();
        console.log("--- First 1000 characters ---");
        console.log(text.substring(0, 1000));
        
        console.log("--- Row count & columns ---");
        const lines = text.split('\n');
        console.log("Total lines:", lines.length);
        console.log("Headers:", lines[0]);
        console.log("Row 1:", lines[1]);
        console.log("Row 2:", lines[2]);
    } catch (e) {
        console.error(e);
    }
}

main();
