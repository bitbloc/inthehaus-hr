
import { NextResponse } from 'next/server';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');

    if (!lat || !lon) {
        return NextResponse.json({ error: 'Latitude and Longitude are required' }, { status: 400 });
    }

    const API_KEY = 'HHgiMMzP47XhYsmXzWHaFQxHeaBuoMSw'; // In production, use process.env.TOMORROW_IO_API_KEY
    const url = `https://api.tomorrow.io/v4/weather/forecast?location=${lat},${lon}&apikey=${API_KEY}`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Weather API error: ${res.statusText}`);
        }
        const data = await res.json();

        // Extract current conditions (first minutely data point)
        const current = data.timelines?.minutely?.[0]?.values;

        if (!current) {
            return NextResponse.json({ error: 'No weather data available' }, { status: 500 });
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
                // Try to construct a readable location string: "District, Province" or "City, Country"
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
            temperature: current.temperature,
            conditionCode: current.weatherCode,
            humidity: current.humidity,
            windSpeed: current.windSpeed,
            address: locationName,
            location: { lat, lon }
        });

    } catch (error) {
        console.error('Weather API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch weather data' }, { status: 500 });
    }
}
