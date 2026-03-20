
export async function getGoldPrice() {
    try {
        const response = await fetch('https://api.chnwt.dev/thai-gold-api/latest');
        if (!response.ok) throw new Error('Gold API error');
        const data = await response.json();
        
        if (data.status !== 'success') throw new Error('Gold API status error');
        
        const price = data.response.price;
        return `🏆 ราคาทองวันนี้ (${data.response.update_time})
💰 ทองคำแท่ง: รับซื้อ ${price.gold_bar.buy} | ขายออก ${price.gold_bar.sell}
💰 ทองรูปพรรณ: รับซื้อ ${price.gold.buy} | ขายออก ${price.gold.sell}`;
    } catch (error) {
        console.error('Error fetching gold price:', error);
        return 'ไม่สามารถดึงราคาทองได้ในขณะนี้';
    }
}


export async function getOilPrice() {
    try {
        // 1. Fetch Standard PTT Prices
        const priceRes = await fetch('https://api.chnwt.dev/thai-oil-api/latest');
        let priceMsg = "";
        if (priceRes.ok) {
            const priceData = await priceRes.json();
            if (priceData.status === 'success') {
                const ptt = priceData.response.stations.ptt;
                priceMsg = `⛽ [ราคากลาง PTT] - ${priceData.response.date}\n` +
                           `- Gasoline 95: ${ptt.gasoline_95?.price || 'N/A'}\n` +
                           `- Gasohol 95: ${ptt.gasohol_95?.price || 'N/A'}\n` +
                           `- Gasohol 91: ${ptt.gasohol_91?.price || 'N/A'}\n` +
                           `- Diesel: ${ptt.diesel_b7?.price || ptt.diesel?.price || 'N/A'}\n`;
            }
        }

        // 2. Dashboard Status Summary (Latest Check: 20 March Evening)
        const dashboardUrl = 'https://script.google.com/macros/s/AKfycbyC8vSspmwSUc83QJpdaADrkr3b-mtI2d6qt7QAF2eP8IogWFKe1lXpfLCxEoK6tENVsQ/exec';
        
        let dashMsg = `\n📊 [สถานการณ์น้ำมันนครพนม รายชนิด]\n`;
        dashMsg += `⛽ **ดีเซล:** ปกติ 12 แห่ง (แนะนำ: PTT นาทราย, PTT บ้านผึ้ง, นครอะไหล่ปิโตรเลียม)\n`;
        dashMsg += `⛽ **91:** ปกติ 17 แห่ง (แนะนำ: PTT นครพนมปิโตรเลียม สาขา 1, PTT ดอนแดง)\n`;
        dashMsg += `⛽ **95:** ปกติ 16 แห่ง (แนะนำ: PTT นครพนมปิโตรเลียม สาขา 1, PTT ดอนแดง)\n`;
        dashMsg += `⛽ **E20:** ปกติ 14 แห่ง (แนะนำ: PTT นาทราย, PTT บ้านผึ้ง)\n`;
        dashMsg += `⚠️ *หมายเหตุ: ปั๊ม ปตท. ท้ายเมือง (หจก.พนมบริการ) ของหมดนะคะ*\n`;
        dashMsg += `\n📍 ค้นหาปั๊ม/เช็คเรียลไทม์ที่นี่: ${dashboardUrl}`;

        return priceMsg + dashMsg;
    } catch (error) {
        console.error('Error fetching oil data:', error);
        return 'ไม่สามารถดึงข้อมูลน้ำมันได้ค่ะ เช็คที่เว็บนี้นะคะ: https://script.google.com/macros/s/AKfycbyC8vSspmwSUc83QJpdaADrkr3b-mtI2d6qt7QAF2eP8IogWFKe1lXpfLCxEoK6tENVsQ/exec';
    }
}

export async function getElectricityPrice() {
    return `⚡ ค่าไฟฟ้า (FT รอบปัจจุบัน)
ประมาณ 4.18 บาทต่อหน่วย (ยังไม่รวมภาษีมูลค่าเพิ่ม)`;
}

export async function getIngredientPrices() {
    return `🛒 ราคาวัตถุดิบโดยประมาณ (อ้างอิง Makro / ตลาดสด)
- ไข่ไก่ (แผง 30 ฟอง): ~115-130 บาท
- อกไก่ (กก.): ~145-165 บาท
- หมูเนื้อแดง/สันนอก (กก.): ~140-160 บาท
- หมูสามชั้น/สันคอ (กก.): ~180-220 บาท
- ข้าวหอมมะลิ (5กก.): ~190-260 บาท
- น้ำมันพืช (1ลิตร): ~45-55 บาท
*หมายเหตุ: ราคาอาจมีการเปลี่ยนแปลงตามสาขาและปริมาณการซื้อ*`;
}

