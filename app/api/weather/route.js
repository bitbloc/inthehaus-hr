import { NextResponse } from 'next/server';
import { getSchemaWeather } from '../../../utils/weather';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');

    if (!lat || !lon) {
        return NextResponse.json({ error: 'Latitude and Longitude are required' }, { status: 400 });
    }

    try {
        const weather = await getSchemaWeather(Number(lat), Number(lon));
        
        if (!weather) {
            return NextResponse.json({ error: 'No weather data available' }, { status: 500 });
        }

        // Fetch location name reverse geocoding
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
            temperature: weather.current.temp,
            conditionCode: weather.current.conditionCode,
            humidity: weather.current.humidity,
            windSpeed: weather.current.wind,
            address: locationName,
            location: { lat, lon },
            tempDiff: weather.tempComparisonStatus === 'hotter' ? 1 : weather.tempComparisonStatus === 'colder' ? -1 : 0,
            tempComparisonStatus: weather.tempComparisonStatus,
            tempDiffText: weather.tempDiffText,
            rainBlocks: weather.rainBlocks,
            heavyRainBlocks: weather.heavyRainBlocks,
            lightRainBlocks: weather.lightRainBlocks,
            hasRain: weather.hasRain,
            employeeAdvice: weather.employeeAdvice
        });

    } catch (error) {
        console.error('Weather API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch weather data' }, { status: 500 });
    }
}
