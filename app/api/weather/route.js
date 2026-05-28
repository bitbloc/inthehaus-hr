
import { NextResponse } from 'next/server';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');

    if (!lat || !lon) {
        return NextResponse.json({ error: 'Latitude and Longitude are required' }, { status: 400 });
    }

    // Switch to OpenMeteo (Free, No Key)
    // Switch to OpenMeteo (Free, No Key)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,precipitation,weather_code&wind_speed_unit=ms&past_days=1&timezone=Asia/Bangkok`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Weather API error: ${res.statusText}`);
        }
        const data = await res.json();
        const current = data.current;

        if (!current) {
            return NextResponse.json({ error: 'No weather data available' }, { status: 500 });
        }

        // Map WMO codes (OpenMeteo) to Tomorrow.io codes (used by frontend)
        const mapWmoToTomorrow = (wmo) => {
            // 0: Clear -> 1000
            if (wmo === 0) return 1000;
            // 1-3: Clouds -> 1100 (Mostly Sunny), 1101 (Partly), 1001 (Cloudy)
            if (wmo === 1) return 1100;
            if (wmo === 2) return 1101;
            if (wmo === 3) return 1001;
            // 45, 48: Fog -> 1001
            if (wmo === 45 || wmo === 48) return 1001;
            // 51-55: Drizzle -> 4000
            if (wmo >= 51 && wmo <= 57) return 4000;
            // 61: Rain Slight -> 4200
            if (wmo === 61 || wmo === 80) return 4200;
            // 63, 65, 81, 82: Rain -> 4001
            if (wmo >= 63 && wmo <= 67) return 4001;
            if (wmo >= 81 && wmo <= 82) return 4001;
            // 95+: Thunder -> 8000
            if (wmo >= 95) return 8000;
            return 1000; // Default
        };

        const conditionCode = mapWmoToTomorrow(current.weather_code);

        // Calculate advanced weather insights using hourly data
        const hourly = data.hourly;
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
                    return `${startStr} - ${endStr} น.`;
                });
            };

            heavyRainBlocks = groupHours(heavyRainHours);
            lightRainBlocks = groupHours(lightRainHours);
            hasRain = heavyRainBlocks.length > 0 || lightRainBlocks.length > 0;

            // Combine into backward compatible rainBlocksText
            if (heavyRainBlocks.length > 0) {
                rainBlocksText.push(...heavyRainBlocks.map(b => `🌧️ ตกหนัก: ${b}`));
            }
            if (lightRainBlocks.length > 0) {
                rainBlocksText.push(...lightRainBlocks.map(b => `🌦️ ตกปรอยๆ: ${b}`));
            }

            // Build employee advice
            if (heavyRainBlocks.length > 0 && lightRainBlocks.length > 0) {
                employeeAdvice = `วันนี้ระวังฝนตกหนักช่วง ${heavyRainBlocks.join(' และ ')} และอาจมีฝนตกปรอยๆ ช่วง ${lightRainBlocks.join(' และ ')} อย่าลืมเตรียมร่ม/เสื้อกันฝนหนาๆ และเผื่อเวลาเดินทางด้วยนะครับ ⛈️`;
            } else if (heavyRainBlocks.length > 0) {
                employeeAdvice = `วันนี้คาดว่าจะมีฝนตกหนักช่วง ${heavyRainBlocks.join(' และ ')} พกร่มหรือเสื้อกันฝนแบบหนา และวางแผนเผื่อเวลาในการเดินทางเข้า/เลิกงานด้วยนะ 🌧️`;
            } else if (lightRainBlocks.length > 0) {
                employeeAdvice = `วันนี้คาดว่าจะมีฝนตกปรอยๆ/มีละอองฝนช่วง ${lightRainBlocks.join(' และ ')} พกร่มหรือเสื้อกันฝนติดตัวไว้กันเหนียวด้วยนะครับ 🌦️`;
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

        let locationName = null;
        try {
            const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`, {
                headers: {
                    'User-Agent': 'InTheHausHR/1.0 (internal tool)'
                }
            });
            if (geoRes.ok) {
                const geoData = await geoRes.json();
                const addr = geoData.address;
                const parts = [];
                if (addr.city || addr.town || addr.village || addr.county) parts.push(addr.city || addr.town || addr.village || addr.county);
                if (addr.state || addr.province) parts.push(addr.state || addr.province);
                if (addr.country) parts.push(addr.country);

                locationName = parts.length > 0 ? parts.slice(0, 2).join(', ') : null;
            }
        } catch (e) {
            console.error("Geocode error", e);
        }

        return NextResponse.json({
            temperature: current.temperature_2m,
            conditionCode: conditionCode,
            humidity: current.relative_humidity_2m,
            windSpeed: current.wind_speed_10m,
            address: locationName,
            location: { lat, lon },
            tempDiff,
            tempComparisonStatus,
            tempDiffText,
            rainBlocks: rainBlocksText,
            heavyRainBlocks,
            lightRainBlocks,
            hasRain,
            employeeAdvice
        });

    } catch (error) {
        console.error('Weather API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch weather data' }, { status: 500 });
    }
}
