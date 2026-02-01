
import { NextResponse } from 'next/server';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');

    if (!lat || !lon) {
        return NextResponse.json({ error: 'Latitude and Longitude are required' }, { status: 400 });
    }

    // Switch to OpenMeteo (Free, No Key)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&wind_speed_unit=ms`;

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
            location: { lat, lon }
        });

    } catch (error) {
        console.error('Weather API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch weather data' }, { status: 500 });
    }
}
