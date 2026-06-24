const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../app/api/webhook/handlers/stockHandler.js');
let content = fs.readFileSync(filePath, 'utf8');

// Normalize CRLF to LF
content = content.replace(/\r\n/g, '\n');

const replacements = [
    {
        tgt: `'✅ เช็คให้แล้วค่ะ ไม่มีรายการสินค้าที่เหลือน้อยเลย สบายใจได้ เมี๊ยว~'`,
        repl: `'✅ ตรวจสอบสต็อกเรียบร้อยครับ ไม่มีรายการสินค้าที่เหลือน้อยกว่าจุดสั่งซื้อขั้นต่ำครับ'`
    },
    {
        tgt: `'❌ ระบุชื่อสินค้าที่ต้องการเช็คด้วยนะ เมี๊ยว~'`,
        repl: `'❌ กรุณาระบุชื่อสินค้าที่ต้องการตรวจสอบด้วยครับ'`
    },
    {
        tgt: '`❌ ไม่พบสินค้าชื่อ "${search}" ในคลังค่ะ เมี๊ยว~`',
        repl: '`❌ ไม่พบสินค้าชื่อ "${search}" ในระบบคลังสินค้าครับ`'
    },
    {
        tgt: '`❌ หาประวัติของ "${actionData.itemName}" ไม่เจอค่ะ ไม่มีสินค้านี้ในระบบ เมี๊ยว~`',
        repl: '`❌ ไม่พบประวัติความเคลื่อนไหวของสินค้า "${actionData.itemName}" เนื่องจากไม่มีสินค้ารายการนี้ในคลังครับ`'
    },
    {
        tgt: '`ไม่มีการเคลื่อนไหวสต็อกเลยค่ะ สงบเงียบมาก เมี๊ยว~`',
        repl: '`ไม่มีประวัติความเคลื่อนไหวสำหรับสินค้าดังกล่าวในระบบครับ`'
    },
    {
        tgt: '`เกิดข้อผิดพลาดในการดึงข้อมูลจาก API สต็อกค่ะ บอสเช็คโค้ดหรือแจ้งทีมงานทีนะคะ เมี๊ยว~ 😿\\nError: ${e.message}`',
        repl: '`เกิดข้อผิดพลาดในการดึงข้อมูลจากระบบสต็อกครับ บอสสามารถตรวจสอบระบบหรือแจ้งทีมงานผู้ดูแลระบบได้ครับ\\nError: ${e.message}`'
    },
    {
        tgt: `'✅ ยกเลิกการจัดการสต็อกแล้วค่ะ เมี๊ยว~'`,
        repl: `'✅ ยกเลิกการทำรายการจัดการสต็อกเรียบร้อยครับ'`
    },
    {
        tgt: '`✅ สร้างรายการสินค้า [${payload.itemName}] สำเร็จแล้วจ้า เมี๊ยว~`',
        repl: '`✅ ดำเนินการเพิ่มรายการสินค้าใหม่ [${payload.itemName}] เข้าระบบคลังสินค้าเรียบร้อยครับ`'
    },
    {
        tgt: '`❌ ไม่พบรายการสินค้า "${payload.itemName}" ที่ชัดเจนในระบบค่ะ${optionsText} ลองตรวจสอบชื่อให้แม่นๆ อีกทีนะ เมี๊ยว~`',
        repl: '`❌ ไม่พบรายการสินค้า "${payload.itemName}" ที่ตรงกันในระบบครับ${optionsText} รบกวนตรวจสอบตัวสะกดชื่อสินค้าอีกครั้งครับ`'
    },
    {
        tgt: '`✅ บันทึกยอดคลังสินค้า [${item.name}] สำเร็จแล้วจ้า ยูซุหิวเลย! เมี๊ยว~`',
        repl: '`✅ บันทึกยอดคลังสินค้า [${item.name}] สำเร็จแล้วครับ การทำรายการถูกบันทึกเข้าระบบประวัติเรียบร้อย`'
    },
    {
        tgt: '`❌ ไม่พบข้อมูลสต็อกสำหรับ "${itemName}" ในระบบค่ะ เมี๊ยว~`',
        repl: '`❌ ไม่พบข้อมูลระดับสต็อกสำหรับ "${itemName}" ในระบบครับ`'
    }
];

replacements.forEach((rep, idx) => {
    if (!content.includes(rep.tgt)) {
        console.error(`Error: Could not find target index ${idx}: ${rep.tgt}`);
        process.exit(1);
    }
    content = content.replace(rep.tgt, rep.repl);
});

fs.writeFileSync(filePath, content, 'utf8');
console.log("stockHandler.js successfully updated with Neat Manager persona!");
