
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
        const response = await fetch('https://api.chnwt.dev/thai-oil-api/latest');
        if (!response.ok) throw new Error('Oil API error');
        const data = await response.json();
        
        if (data.status !== 'success') throw new Error('Oil API status error');

        const ptt = data.response.stations.ptt;
        let msg = `⛽ ราคาน้ำมัน (PTT) - ${data.response.date}\n`;
        msg += `\nGasoline 95: ${ptt.gasoline_95?.price || 'N/A'} บาท/ลิตร`;
        msg += `\nGasohol 95: ${ptt.gasohol_95?.price || 'N/A'} บาท/ลิตร`;
        msg += `\nGasohol 91: ${ptt.gasohol_91?.price || 'N/A'} บาท/ลิตร`;
        msg += `\nGasohol E20: ${ptt.gasohol_e20?.price || 'N/A'} บาท/ลิตร`;
        msg += `\nDiesel: ${ptt.diesel_b7?.price || ptt.diesel?.price || 'N/A'} บาท/ลิตร`;

        return msg;
    } catch (error) {
        console.error('Error fetching oil price:', error);
        return 'ไม่สามารถดึงราคาน้ำมันได้ในขณะนี้';
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

