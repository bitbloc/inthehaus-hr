
const API_KEY = 'HHgiMMzP47XhYsmXzWHaFQxHeaBuoMSw'; // In production use process.env
const SHOP_LAT = 17.390110564180162;
const SHOP_LONG = 104.79292673153263;

// In-memory cache (30 minutes)
let weatherCache = { data: null, expiry: 0 };
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

const weatherCodes = {
    1000: "ท้องฟ้าแจ่มใส ☀️",
    1100: "แจ่มใสเป็นส่วนใหญ่ 🌤️",
    1101: "มีเมฆบางส่วน ⛅",
    1001: "มีเมฆมาก ☁️",
    2000: "หมอก 🌫️",
    2100: "หมอกบาง 🌫️",
    4000: "ฝนปรอยๆ 🌧️",
    4001: "ฝนตก 🌧️",
    4200: "ฝนตกเล็กน้อย 🌦️",
    4201: "ฝนตกหนัก ⛈️",
    8000: "พายุฝนฟ้าคะนอง ⛈️"
};

const getThaiCondition = (code) => weatherCodes[code] || "ไม่ทราบสถานะ";

export async function getSchemaWeather(lat = SHOP_LAT, lon = SHOP_LONG) {
    try {
        const url = `https://api.tomorrow.io/v4/weather/forecast?location=${lat},${lon}&apikey=${API_KEY}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Weather API Error");
        const data = await res.json();

        const current = data.timelines?.minutely?.[0]?.values;
        const daily = data.timelines?.daily?.[0]?.values; // Forecast for today/tomorrow

        if (!current || !daily) return null;

        return {
            current: {
                temp: Math.round(current.temperature),
                humidity: current.humidity,
                condition: getThaiCondition(current.weatherCode),
                wind: current.windSpeed
            },
            forecast: {
                tempMax: Math.round(daily.temperatureMax),
                tempMin: Math.round(daily.temperatureMin),
                chanceOfRain: daily.precipitationProbabilityMax !== undefined ? daily.precipitationProbabilityMax : (daily.precipitationProbabilityAvg !== undefined ? daily.precipitationProbabilityAvg : 0),
                condition: getThaiCondition(daily.weatherCodeMax || daily.weatherCodeMin) // Simplified
            }
        };

    } catch (error) {
        console.error("Get Weather Error", error);
        return null;
    }
}

export function formatWeatherMessage(weather) {
    if (!weather) return "ไม่สามารถดึงข้อมูลสภาพอากาศได้ในขณะนี้";

    return `🌤️ รายงานสภาพอากาศ (In The Haus)

🌡️ ปัจจุบัน: ${weather.current.temp}°C
สภาพอากาศ: ${weather.current.condition}
ความชื้น: ${weather.current.humidity}%
ลม: ${weather.current.wind} m/s

🔮 พยากรณ์วันนี้
สูงสุด: ${weather.forecast.tempMax}°C | ต่ำสุด: ${weather.forecast.tempMin}°C
โอกาสฝนตก: ${weather.forecast.chanceOfRain}%
สภาพการณ์โดยรวม: ${weather.forecast.condition}`;
}

export function formatWeatherFlex(weather) {
    if (!weather) return null;

    return {
        type: "flex",
        altText: `🌤️ รายงานสภาพอากาศ: ปัจจุบัน ${weather.current.temp}°C - ${weather.current.condition}`,
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
                        text: "🌤️ รายงานสภาพอากาศ (In The Haus)",
                        weight: "bold",
                        color: "#ffffff",
                        size: "md"
                    },
                    {
                        type: "text",
                        text: "ข้อมูลเรียลไทม์จากระบบพยากรณ์อากาศ",
                        color: "#94a3b8",
                        size: "xs",
                        margin: "xs"
                    }
                ]
            },
            body: {
                type: "box",
                layout: "vertical",
                spacing: "md",
                contents: [
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
                                        color: "#38bdf8",
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
                        color: "#334155",
                        margin: "md"
                    },
                    {
                        type: "box",
                        layout: "vertical",
                        spacing: "sm",
                        contents: [
                            {
                                type: "text",
                                text: "🔮 พยากรณ์วันนี้",
                                weight: "bold",
                                size: "sm",
                                color: "#f1f5f9"
                            },
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    {
                                        type: "text",
                                        text: "สูงสุด / ต่ำสุด",
                                        size: "xs",
                                        color: "#94a3b8",
                                        flex: 2
                                    },
                                    {
                                        type: "text",
                                        text: `${weather.forecast.tempMax}°C / ${weather.forecast.tempMin}°C`,
                                        size: "xs",
                                        color: "#ffffff",
                                        align: "end",
                                        weight: "bold",
                                        flex: 2
                                    }
                                ]
                            },
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    {
                                        type: "text",
                                        text: "โอกาสฝนตก",
                                        size: "xs",
                                        color: "#94a3b8",
                                        flex: 2
                                    },
                                    {
                                        type: "text",
                                        text: `${weather.forecast.chanceOfRain}%`,
                                        size: "xs",
                                        color: "#38bdf8",
                                        align: "end",
                                        weight: "bold",
                                        flex: 2
                                    }
                                ]
                            },
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    {
                                        type: "text",
                                        text: "สภาพการณ์โดยรวม",
                                        size: "xs",
                                        color: "#94a3b8",
                                        flex: 2
                                    },
                                    {
                                        type: "text",
                                        text: weather.forecast.condition,
                                        size: "xs",
                                        color: "#ffffff",
                                        align: "end",
                                        weight: "bold",
                                        flex: 2
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        }
    };
}


/**
 * Get compact weather string for Yuzu context injection (cached 30 min)
 * Returns a short one-liner like: "[WEATHER: 35°C ร้อนจัด โอกาสฝน 20%]"
 */
export async function getCompactWeather() {
    try {
        const now = Date.now();
        if (weatherCache.data && now < weatherCache.expiry) {
            return weatherCache.data;
        }

        const weather = await getSchemaWeather();
        if (!weather) return "";

        const compact = `[WEATHER: ${weather.current.temp}°C ${weather.current.condition} โอกาสฝน${weather.forecast.chanceOfRain}%]`;
        weatherCache = { data: compact, expiry: now + CACHE_DURATION };
        return compact;
    } catch (e) {
        console.error("Compact Weather Error:", e);
        return "";
    }
}
