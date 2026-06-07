const SHOP_LAT = 17.390110564180162;
const SHOP_LONG = 104.79292673153263;

// In-memory cache (5 minutes)
let weatherCache = { data: null, expiry: 0 };
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const weatherCodes = {
    1000: "ท้องฟ้าแจ่มใส ☀️",
    1100: "แจ่มใสเป็นส่วนใหญ่ 🌤️",
    1101: "มีเมฆบางส่วน ⛅",
    1001: "มีเมฆมาก ☁️",
    2000: "หมอก 🌫️",
    2100: "หมอกบาง 🌫️",
    4000: "ฝนตกปรอยๆ 🌧️",
    4001: "ฝนตก 🌧️",
    4200: "ฝนตกเล็กน้อย 🌦️",
    4201: "ฝนตกหนัก ⛈️",
    8000: "พายุฝนฟ้าคะนอง ⛈️"
};

const getThaiCondition = (code) => weatherCodes[code] || "ไม่ทราบสถานะ";

// Map WMO codes (OpenMeteo) to Tomorrow.io codes
const mapWmoToTomorrow = (wmo) => {
    if (wmo === 0) return 1000;
    if (wmo === 1) return 1100;
    if (wmo === 2) return 1101;
    if (wmo === 3) return 1001;
    if (wmo === 45 || wmo === 48) return 1001;
    if (wmo >= 51 && wmo <= 57) return 4000;
    if (wmo === 61 || wmo === 80) return 4200;
    if (wmo >= 63 && wmo <= 67) return 4001;
    if (wmo >= 81 && wmo <= 82) return 4001;
    if (wmo >= 95) return 8000;
    return 1000; // Default
};

// Map WeatherAPI.com codes to Tomorrow.io codes
const mapWeatherApiToTomorrow = (code) => {
    if (code === 1000) return 1000;
    if (code === 1003) return 1101;
    if (code === 1006 || code === 1009) return 1001;
    if (code === 1030 || code === 1135 || code === 1147) return 2000;
    if (code === 1063 || code === 1180 || code === 1183) return 4200;
    if (code === 1072 || code === 1150 || code === 1153) return 4000;
    if (code === 1186 || code === 1189 || code === 1240) return 4001;
    if (code === 1192 || code === 1195 || code === 1243 || code === 1246) return 4201;
    if (code === 1087 || code === 1273 || code === 1276) return 8000;
    return 1000;
};

export async function getSchemaWeather(lat = SHOP_LAT, lon = SHOP_LONG) {
    const apiKey = process.env.WEATHERAPI_KEY || process.env.WEATHER_API_KEY;
    
    if (apiKey) {
        try {
            console.log(`Fetching weather from WeatherAPI.com for lat=${lat}, lon=${lon}...`);
            const forecastUrl = `http://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${lat},${lon}&days=2&aqi=no&alerts=no&lang=th`;
            const res = await fetch(forecastUrl);
            if (!res.ok) throw new Error(`WeatherAPI.com Forecast Error: HTTP ${res.status}`);
            const data = await res.json();
            
            // Fetch yesterday's history for comparison
            const bkkTime = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
            const yesterday = new Date(bkkTime);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];
            
            const historyUrl = `http://api.weatherapi.com/v1/history.json?key=${apiKey}&q=${lat},${lon}&dt=${yesterdayStr}&lang=th`;
            const histRes = await fetch(historyUrl);
            let histData = null;
            if (histRes.ok) {
                histData = await histRes.json();
            }
            
            const currentObj = data.current;
            const forecastDayToday = data.forecast?.forecastday?.[0];
            const historyDay = histData?.forecast?.forecastday?.[0];
            
            if (!currentObj) throw new Error("No current weather data in WeatherAPI.com response");
            
            const conditionCode = mapWeatherApiToTomorrow(currentObj.condition?.code);
            const conditionLabel = currentObj.condition?.text || getThaiCondition(conditionCode);
            
            let tempDiff = 0;
            let tempComparisonStatus = 'similar';
            let tempDiffText = 'ใกล้เคียงกับเมื่อวาน';
            
            if (forecastDayToday?.hour && historyDay?.hour) {
                const tempsToday = forecastDayToday.hour.map(h => h.temp_c);
                const tempsYesterday = historyDay.hour.map(h => h.temp_c);
                
                const avgToday = tempsToday.reduce((a, b) => a + b, 0) / tempsToday.length;
                const avgYesterday = tempsYesterday.reduce((a, b) => a + b, 0) / tempsYesterday.length;
                
                tempDiff = avgToday - avgYesterday;
                if (tempDiff > 0.5) {
                    tempComparisonStatus = 'hotter';
                    tempDiffText = `ร้อนกว่าเมื่อวานประมาณ ${tempDiff.toFixed(1)}°C`;
                } else if (tempDiff < -0.5) {
                    tempComparisonStatus = 'colder';
                    tempDiffText = `เย็นกว่าเมื่อวานประมาณ ${Math.abs(tempDiff).toFixed(1)}°C`;
                }
            }
            
            let rainBlocksText = [];
            let heavyRainBlocks = [];
            let lightRainBlocks = [];
            let hasRain = false;
            let employeeAdvice = '';
            
            if (forecastDayToday?.hour) {
                const heavyRainHours = [];
                const lightRainHours = [];
                
                forecastDayToday.hour.forEach((h, idx) => {
                    const isHeavy = h.precip_mm >= 0.5;
                    const isLight = !isHeavy && (h.precip_mm > 0.1 || h.chance_of_rain >= 40);
                    
                    if (isHeavy) {
                        heavyRainHours.push(idx);
                    } else if (isLight) {
                        lightRainHours.push(idx);
                    }
                });
                
                const groupHours = (hours) => {
                    const blocks = [];
                    if (hours.length > 0) {
                        let start = hours[0];
                        let prev = hours[0];
                        for (let i = 1; i < hours.length; i++) {
                            const curr = hours[i];
                            if (curr === prev + 1) {
                                prev = curr;
                            } else {
                                blocks.push({ start, end: prev });
                                start = curr;
                                prev = curr;
                            }
                        }
                        blocks.push({ start, end: prev });
                    }
                    return blocks.map(b => {
                        const startStr = b.start.toString().padStart(2, '0') + ':00';
                        const endStr = (b.end + 1).toString().padStart(2, '0') + ':00';
                        return `${startStr}-${endStr}`;
                    });
                };
                
                heavyRainBlocks = groupHours(heavyRainHours);
                lightRainBlocks = groupHours(lightRainHours);
                hasRain = heavyRainBlocks.length > 0 || lightRainBlocks.length > 0;
                
                if (heavyRainBlocks.length > 0) {
                    rainBlocksText.push(`🌧️ ตกหนัก: ${heavyRainBlocks.join(', ')} น.`);
                }
                if (lightRainBlocks.length > 0) {
                    rainBlocksText.push(`🌦️ ตกปรอยๆ: ${lightRainBlocks.join(', ')} น.`);
                }
                
                if (heavyRainBlocks.length > 0 && lightRainBlocks.length > 0) {
                    employeeAdvice = `วันนี้ระวังฝนตกหนักและตกปรอยๆ ในบางช่วง อย่าลืมเตรียมร่ม/เสื้อกันฝน และเผื่อเวลาเดินทางด้วยนะครับ ⛈️`;
                } else if (heavyRainBlocks.length > 0) {
                    employeeAdvice = `วันนี้คาดว่าจะมีฝนตกหนักในบางช่วง พกร่มหรือเสื้อกันฝนแบบหนา และวางแผนเผื่อเวลาในการเดินทางด้วยนะ 🌧️`;
                } else if (lightRainBlocks.length > 0) {
                    employeeAdvice = `วันนี้คาดว่าจะมีฝนตกปรอยๆ/มีละอองฝนในบางช่วง พกร่มหรือเสื้อกันฝนติดตัวไว้ด้วยนะครับ 🌦️`;
                } else {
                    employeeAdvice = `วันนี้ไม่มีฝนตก ท้องฟ้าค่อนข้างแจ่มใส ☀️`;
                }
                
                if (employeeAdvice.includes('ฝน')) {
                    if (tempComparisonStatus === 'hotter') {
                        employeeAdvice += ` แถมอากาศจะอบอ้าวขึ้นด้วย ระวังเหนียวตัวและรักษาสุขภาพนะครับ`;
                    } else if (tempComparisonStatus === 'colder') {
                        employeeAdvice += ` อากาศจะเย็นลงร่วมด้วย ระวังเป็นหวัดนะครับ`;
                    } else {
                        employeeAdvice += ` ดูแลตัวเองดีๆ ด้วยความห่วงใยจาก Yuzu ครับ`;
                    }
                } else {
                    if (tempComparisonStatus === 'hotter') {
                        employeeAdvice += ` แต่อากาศจะร้อนกว่าเมื่อวาน หลีกเลี่ยงแดดจัดและดื่มน้ำบ่อยๆ นะครับ`;
                    } else if (tempComparisonStatus === 'colder') {
                        employeeAdvice += ` และอากาศเย็นสบายกว่าเมื่อวานเล็กน้อย สบายตัวเลย ทำงานอย่างมีความสุขนะครับ!`;
                    } else {
                        employeeAdvice += ` อุณหภูมิใกล้เคียงกับเมื่อวานเลย อากาศกำลังดีครับ`;
                    }
                }
            }
            
            return {
                current: {
                    temp: Math.round(currentObj.temp_c),
                    humidity: currentObj.humidity,
                    condition: conditionLabel,
                    wind: Number((currentObj.wind_kph / 3.6).toFixed(1)), // Convert to m/s
                    conditionCode: conditionCode
                },
                tempDiffText,
                tempComparisonStatus,
                rainBlocks: rainBlocksText,
                heavyRainBlocks,
                lightRainBlocks,
                hasRain,
                employeeAdvice
            };
        } catch (err) {
            console.error("WeatherAPI.com Error, falling back to Open-Meteo:", err);
        }
    }

    try {
        console.log(`Fetching weather from OpenMeteo for lat=${lat}, lon=${lon}...`);
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,precipitation,weather_code&wind_speed_unit=ms&past_days=1&timezone=Asia/Bangkok`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("OpenMeteo Weather API Error");
        const data = await res.json();

        const current = data.current;
        const hourly = data.hourly;

        if (!current) return null;

        const conditionCode = mapWmoToTomorrow(current.weather_code);

        let tempDiff = 0;
        let tempComparisonStatus = 'similar';
        let tempDiffText = 'ใกล้เคียงกับเมื่อวาน';
        let rainBlocksText = [];
        let heavyRainBlocks = [];
        let lightRainBlocks = [];
        let hasRain = false;
        let employeeAdvice = '';

        if (hourly && hourly.temperature_2m && hourly.precipitation && hourly.precipitation_probability) {
            // Index 0..23 is yesterday, 24..47 is today (due to past_days=1 and timezone=Asia/Bangkok)
            const tempYesterday = hourly.temperature_2m.slice(0, 24);
            const tempToday = hourly.temperature_2m.slice(24, 48);
            
            if (tempYesterday.length > 0 && tempToday.length > 0) {
                const avgTempYesterday = tempYesterday.reduce((a, b) => a + b, 0) / tempYesterday.length;
                const avgTempToday = tempToday.reduce((a, b) => a + b, 0) / tempToday.length;
                
                tempDiff = avgTempToday - avgTempYesterday;
                if (tempDiff > 0.5) {
                    tempComparisonStatus = 'hotter';
                    tempDiffText = `ร้อนกว่าเมื่อวานประมาณ ${tempDiff.toFixed(1)}°C`;
                } else if (tempDiff < -0.5) {
                    tempComparisonStatus = 'colder';
                    tempDiffText = `เย็นกว่าเมื่อวานประมาณ ${Math.abs(tempDiff).toFixed(1)}°C`;
                }
            }

            const precToday = hourly.precipitation.slice(24, 48);
            const probToday = hourly.precipitation_probability.slice(24, 48);
            
            const heavyRainHours = [];
            const lightRainHours = [];
            
            for (let i = 0; i < 24; i++) {
                const isHeavy = precToday[i] >= 0.5;
                const isLight = !isHeavy && (precToday[i] > 0.1 || probToday[i] >= 40);
                
                if (isHeavy) {
                    heavyRainHours.push(i);
                } else if (isLight) {
                    lightRainHours.push(i);
                }
            }

            const groupHours = (hours) => {
                const blocks = [];
                if (hours.length > 0) {
                    let start = hours[0];
                    let prev = hours[0];
                    for (let i = 1; i < hours.length; i++) {
                        const curr = hours[i];
                        if (curr === prev + 1) {
                            prev = curr;
                        } else {
                            blocks.push({ start, end: prev });
                            start = curr;
                            prev = curr;
                        }
                    }
                    blocks.push({ start, end: prev });
                }
                return blocks.map(b => {
                    const startStr = b.start.toString().padStart(2, '0') + ':00';
                    const endStr = (b.end + 1).toString().padStart(2, '0') + ':00';
                    return `${startStr}-${endStr}`;
                });
            };

            heavyRainBlocks = groupHours(heavyRainHours);
            lightRainBlocks = groupHours(lightRainHours);
            hasRain = heavyRainBlocks.length > 0 || lightRainBlocks.length > 0;

            if (heavyRainBlocks.length > 0) {
                rainBlocksText.push(`🌧️ ตกหนัก: ${heavyRainBlocks.join(', ')} น.`);
            }
            if (lightRainBlocks.length > 0) {
                rainBlocksText.push(`🌦️ ตกปรอยๆ: ${lightRainBlocks.join(', ')} น.`);
            }

            if (heavyRainBlocks.length > 0 && lightRainBlocks.length > 0) {
                employeeAdvice = `วันนี้ระวังฝนตกหนักและตกปรอยๆ ในบางช่วง อย่าลืมเตรียมร่ม/เสื้อกันฝน และเผื่อเวลาเดินทางด้วยนะครับ ⛈️`;
            } else if (heavyRainBlocks.length > 0) {
                employeeAdvice = `วันนี้คาดว่าจะมีฝนตกหนักในบางช่วง พกร่มหรือเสื้อกันฝนแบบหนา และวางแผนเผื่อเวลาในการเดินทางด้วยนะ 🌧️`;
            } else if (lightRainBlocks.length > 0) {
                employeeAdvice = `วันนี้คาดว่าจะมีฝนตกปรอยๆ/มีละอองฝนในบางช่วง พกร่มหรือเสื้อกันฝนติดตัวไว้ด้วยนะครับ 🌦️`;
            } else {
                employeeAdvice = `วันนี้ไม่มีฝนตก ท้องฟ้าค่อนข้างแจ่มใส ☀️`;
            }

            if (employeeAdvice.includes('ฝน')) {
                if (tempComparisonStatus === 'hotter') {
                    employeeAdvice += ` แถมอากาศจะอบอ้าวขึ้นด้วย ระวังเหนียวตัวและรักษาสุขภาพนะครับ`;
                } else if (tempComparisonStatus === 'colder') {
                    employeeAdvice += ` อากาศจะเย็นลงร่วมด้วย ระวังเป็นหวัดนะครับ`;
                } else {
                    employeeAdvice += ` ดูแลตัวเองดีๆ ด้วยความห่วงใยจาก Yuzu ครับ`;
                }
            } else {
                if (tempComparisonStatus === 'hotter') {
                    employeeAdvice += ` แต่อากาศจะร้อนกว่าเมื่อวาน หลีกเลี่ยงแดดจัดและดื่มน้ำบ่อยๆ นะครับ`;
                } else if (tempComparisonStatus === 'colder') {
                    employeeAdvice += ` และอากาศเย็นสบายกว่าเมื่อวานเล็กน้อย สบายตัวเลย ทำงานอย่างมีความสุขนะครับ!`;
                } else {
                    employeeAdvice += ` อุณหภูมิใกล้เคียงกับเมื่อวานเลย อากาศกำลังดีครับ`;
                }
            }
        }

        return {
            current: {
                temp: Math.round(current.temperature_2m),
                humidity: current.relative_humidity_2m,
                condition: getThaiCondition(conditionCode),
                wind: current.wind_speed_10m,
                conditionCode: conditionCode
            },
            tempDiffText,
            tempComparisonStatus,
            rainBlocks: rainBlocksText,
            heavyRainBlocks,
            lightRainBlocks,
            hasRain,
            employeeAdvice
        };

    } catch (error) {
        console.error("Get Weather Error", error);
        return null;
    }
}

export function formatWeatherMessage(weather) {
    if (!weather) return "ไม่สามารถดึงข้อมูลสภาพอากาศได้ในขณะนี้";

    const rainStr = weather.hasRain ? weather.rainBlocks.join(', ') : "ไม่มีฝนตกวันนี้ ☀️";

    return `🌤️ รายงานสภาพอากาศ (In The Haus)

🌡️ ปัจจุบัน: ${weather.current.temp}°C
สภาพอากาศ: ${weather.current.condition}
ความชื้น: ${weather.current.humidity}%
ลม: ${weather.current.wind} m/s

📊 เปรียบเทียบเมื่อวาน: ${weather.tempDiffText}
🌧️ ช่วงเวลาพยากรณ์ฝน: ${rainStr}
🐾 คำแนะนำจาก Yuzu: ${weather.employeeAdvice}`;
}

export function formatWeatherFlex(weather) {
    if (!weather) return null;

    const isRainy = weather.hasRain;
    const accentColor = isRainy ? "#38bdf8" : "#bef264"; // Sky blue for rain, Lime for clear
    const titleEmoji = isRainy ? "⛈️" : "🌤️";

    return {
        type: "flex",
        altText: `${titleEmoji} รายงานสภาพอากาศ: ปัจจุบัน ${weather.current.temp}°C - ${weather.current.condition}`,
        contents: {
            type: "bubble",
            size: "mega",
            styles: {
                header: {
                    backgroundColor: "#1e293b"
                },
                body: {
                    backgroundColor: "#0f172a"
                }
            },
            header: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: `${titleEmoji} รายงานสภาพอากาศ (In The Haus)`,
                        weight: "bold",
                        color: "#ffffff",
                        size: "md"
                    },
                    {
                        type: "text",
                        text: "ข้อมูลเรียลไทม์วิเคราะห์โดย Yuzu AI",
                        color: "#94a3b8",
                        size: "xs",
                        margin: "xs"
                    }
                ]
            },
            body: {
                type: "box",
                layout: "vertical",
                spacing: "lg",
                contents: [
                    // Main Temp display
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "box",
                                layout: "vertical",
                                flex: 3,
                                contents: [
                                    {
                                        type: "text",
                                        text: "อุณหภูมิปัจจุบัน",
                                        size: "xs",
                                        color: "#94a3b8"
                                    },
                                    {
                                        type: "text",
                                        text: `${weather.current.temp}°C`,
                                        size: "3xl",
                                        weight: "bold",
                                        color: "#ffffff",
                                        margin: "sm"
                                    },
                                    {
                                        type: "text",
                                        text: weather.current.condition,
                                        size: "sm",
                                        color: accentColor,
                                        weight: "bold",
                                        margin: "xs"
                                    }
                                ]
                            },
                            {
                                type: "box",
                                layout: "vertical",
                                flex: 3,
                                spacing: "md",
                                contents: [
                                    {
                                        type: "box",
                                        layout: "horizontal",
                                        contents: [
                                            {
                                                type: "text",
                                                text: "ความชื้น",
                                                size: "xs",
                                                color: "#64748b",
                                                flex: 1
                                            },
                                            {
                                                type: "text",
                                                text: `${weather.current.humidity}%`,
                                                size: "xs",
                                                color: "#e2e8f0",
                                                align: "end",
                                                weight: "bold",
                                                flex: 1
                                            }
                                        ]
                                    },
                                    {
                                        type: "box",
                                        layout: "horizontal",
                                        contents: [
                                            {
                                                type: "text",
                                                text: "ความเร็วลม",
                                                size: "xs",
                                                color: "#64748b",
                                                flex: 1
                                            },
                                            {
                                                type: "text",
                                                text: `${weather.current.wind} m/s`,
                                                size: "xs",
                                                color: "#e2e8f0",
                                                align: "end",
                                                weight: "bold",
                                                flex: 1
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        type: "separator",
                        color: "#334155"
                    },
                    // Grid info
                    {
                        type: "box",
                        layout: "vertical",
                        spacing: "sm",
                        contents: [
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    {
                                        type: "text",
                                        text: "📊 เทียบเมื่อวาน",
                                        size: "xs",
                                        color: "#94a3b8",
                                        flex: 2
                                    },
                                    {
                                        type: "text",
                                        text: weather.tempDiffText,
                                        size: "xs",
                                        color: "#ffffff",
                                        align: "end",
                                        weight: "bold",
                                        flex: 3
                                    }
                                ]
                            },
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    {
                                        type: "text",
                                        text: "🌧️ พยากรณ์ฝน",
                                        size: "xs",
                                        color: "#94a3b8",
                                        flex: 2
                                    },
                                    {
                                        type: "text",
                                        text: weather.hasRain ? weather.rainBlocks.join('\n') : "ไม่มีฝนตกวันนี้",
                                        size: "xs",
                                        color: weather.hasRain ? "#f59e0b" : "#10b981",
                                        align: "end",
                                        weight: "bold",
                                        flex: 3,
                                        wrap: true
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        type: "separator",
                        color: "#334155"
                    },
                    // Yuzu Tip Section
                    {
                        type: "box",
                        layout: "vertical",
                        spacing: "xs",
                        contents: [
                            {
                                type: "text",
                                text: "🐾 คำแนะนำจาก Yuzu",
                                weight: "bold",
                                size: "xs",
                                color: "#f97316"
                            },
                            {
                                type: "text",
                                text: weather.employeeAdvice,
                                size: "xs",
                                color: "#cbd5e1",
                                wrap: true,
                                margin: "xs"
                            }
                        ]
                    }
                ]
            }
        }
    };
}

export async function getCompactWeather() {
    try {
        const now = Date.now();
        if (weatherCache.data && now < weatherCache.expiry) {
            return weatherCache.data;
        }

        const weather = await getSchemaWeather();
        if (!weather) return "";

        const rainStr = weather.hasRain ? weather.rainBlocks.join(', ') : "ไม่มีฝนตก";
        const compact = `[WEATHER: ปัจจุบัน ${weather.current.temp}°C อากาศ${weather.current.condition} | เทียบเมื่อวาน: ${weather.tempDiffText} | ฝนตกวันนี้: ${rainStr} | คำแนะนำ Yuzu: ${weather.employeeAdvice}]`;
        weatherCache = { data: compact, expiry: now + CACHE_DURATION };
        return compact;
    } catch (e) {
        console.error("Compact Weather Error:", e);
        return "";
    }
}
