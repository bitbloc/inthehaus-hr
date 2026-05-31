import { getAccurateNews } from '../utils/news.js';
import { getSchemaWeather } from '../utils/weather.js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function testNews() {
    console.log("=== Testing News Fetcher ===");
    try {
        const news = await getAccurateNews();
        console.log("News Context Output length:", news.length);
        console.log("Preview of News Context:\n", news.slice(0, 1000));
        
        // Assert news contains keywords of our feeds
        const expectedFeeds = [
            'นครพนม',
            'วงการร้านอาหารในไทย',
            'ธุรกิจร้านอาหาร & ค้าปลีก',
            'ข่าวทั่วไปภาคอีสาน'
        ];
        
        expectedFeeds.forEach(feed => {
            if (news.includes(feed)) {
                console.log(`✅ Verified feed header: "${feed}" exists in news context.`);
            } else {
                console.warn(`⚠️ Warning: feed header "${feed}" not found in news context.`);
            }
        });
    } catch (e) {
        console.error("News Test Failed:", e);
    }
}

async function testWeather() {
    console.log("\n=== Testing Weather Fetcher ===");
    try {
        const weather = await getSchemaWeather();
        if (weather) {
            console.log("✅ Weather Fetch Successful!");
            console.log("Current Temperature:", weather.current?.temp, "°C");
            console.log("Condition:", weather.current?.condition);
            console.log("Humidity:", weather.current?.humidity, "%");
            console.log("Wind Speed:", weather.current?.wind, "m/s");
            console.log("Temp Difference Text:", weather.tempDiffText);
            console.log("Has Rain Today:", weather.hasRain);
            console.log("Rain Blocks:", weather.rainBlocks);
            console.log("Advice:", weather.employeeAdvice);
        } else {
            console.error("❌ Weather fetch returned null!");
        }
    } catch (e) {
        console.error("Weather Test Failed:", e);
    }
}

function testFlexParsing() {
    console.log("\n=== Testing Flex Message Parsing ===");
    const mockResponse = `
[FLEX_TITLE]🐱 สรุปข่าวและต้นทุนโดยน้องยูซุ[/FLEX_TITLE]
[FLEX_SUBTITLE]ข้อมูลอัปเดต 31 พ.ค. 2569[/FLEX_SUBTITLE]
[FLEX_NEWS]- ข่าวเด่นนครพนม: ฝนตกหนักน้ำท่วมทางเลี่ยงเมือง
- ข่าวอีสาน: คึกคักท่องเที่ยวพญานาค[/FLEX_NEWS]
[FLEX_INDUSTRY]- วงการร้านอาหาร: ร้านอาหารหันมาใช้ระบบคิวและสั่งอาหารด้วยคิวอาร์โค้ดเพิ่มขึ้น[/FLEX_INDUSTRY]
[FLEX_COSTS]- ราคาน้ำมัน: ดีเซลลิตรละ 33 บาท
- ค่าไฟ: หน่วยละ 4.18 บาท[/FLEX_COSTS]
[FLEX_ADVICE]ระวังเรื่องการสต็อกเนื้อหมูช่วงฝนตกหนักเพราะโลจิสติกส์อาจล่าช้าค่ะเมี๊ยว~[/FLEX_ADVICE]
    `;

    const extract = (tag) => {
        const regex = new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[\\/${tag}\\]`);
        const match = mockResponse.match(regex);
        return match ? match[1].trim() : null;
    };

    const parsed = {
        title: extract('FLEX_TITLE'),
        subtitle: extract('FLEX_SUBTITLE'),
        news: extract('FLEX_NEWS'),
        industry: extract('FLEX_INDUSTRY'),
        costs: extract('FLEX_COSTS'),
        advice: extract('FLEX_ADVICE')
    };

    console.log("Parsed result:", parsed);
    if (parsed.title === "🐱 สรุปข่าวและต้นทุนโดยน้องยูซุ" && parsed.advice.includes("ระวังเรื่องการสต็อกเนื้อหมู")) {
        console.log("✅ Flex Parser works perfectly!");
    } else {
        console.error("❌ Flex Parser failed to extract correct data!");
    }
}

async function runAll() {
    await testNews();
    await testWeather();
    testFlexParsing();
}

runAll();
