
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

        return NextResponse.json({
            temperature: current.temperature,
            conditionCode: current.weatherCode,
            humidity: current.humidity,
            windSpeed: current.windSpeed,
            location: { lat, lon } // Echo back or reverse geocode if needed later
        });

    } catch (error) {
        console.error('Weather API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch weather data' }, { status: 500 });
    }
}
