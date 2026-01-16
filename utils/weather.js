
const API_KEY = 'HHgiMMzP47XhYsmXzWHaFQxHeaBuoMSw'; // In production use process.env
const SHOP_LAT = 17.390110564180162;
const SHOP_LONG = 104.79292673153263;

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
                chanceOfRain: daily.precipitationProbability,
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
