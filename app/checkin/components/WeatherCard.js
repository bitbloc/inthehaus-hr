import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';

// Weather Codes Mapping (Simplified for Tomorrow.io)
const getWeatherIcon = (code) => {
    // Codes: 1000=Clear, 1100=Mostly Clear, 1101=Partly Cloudy, 1001=Cloudy
    // 4000=Drizzle, 4001=Rain, 4200=Light Rain, 8000=Thunderstorm
    const map = {
        1000: '☀️', 1100: '🌤️', 1101: 'bq', 1001: '☁️',
        4000: 'Vm', 4001: '🌧️', 4200: '🌦️', 8000: '⛈️'
    };
    return map[code] || '🌡️';
};

const getWeatherLabel = (code) => {
    const map = {
        1000: 'Sunny', 1100: 'Mostly Sunny', 1101: 'Partly Cloudy', 1001: 'Cloudy',
        4000: 'Drizzle', 4001: 'Rain', 4200: 'Light Rain', 8000: 'Thunderstorm'
    };
    return map[code] || 'Unknown';
}

export default function WeatherCard({ latitude, longitude, locationName = "Current Location" }) {
    const [weather, setWeather] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const lastCoords = useRef({ lat: 0, lon: 0 });

    useEffect(() => {
        if (!latitude || !longitude) return;

        // Throttling: Check if moved significantly (approx ~1km or 0.01 deg)
        // This prevents flickering on small GPS drifts
        const distLat = Math.abs(latitude - lastCoords.current.lat);
        const distLon = Math.abs(longitude - lastCoords.current.lon);

        if (distLat < 0.01 && distLon < 0.01) return;

        lastCoords.current = { lat: latitude, lon: longitude };

        const fetchWeather = async () => {
            // Only show loading spinner on initial load, not during updates
            if (!weather) setLoading(true);

            try {
                const res = await fetch(`/api/weather?lat=${latitude}&lon=${longitude}`);
                if (!res.ok) throw new Error('Failed to load weather');
                const data = await res.json();
                setWeather(data);
            } catch (err) {
                console.error(err);
                setError(true);
            } finally {
                setLoading(false);
            }
        };

        fetchWeather();
    }, [latitude, longitude]);

    if (!weather && !loading) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-sm z-10 mb-6 px-6"
        >
            <div className="flex items-center justify-between px-5 py-3 bg-white/60 backdrop-blur-md rounded-2xl border border-white/60 shadow-sm relative overflow-hidden">
                {/* Decorative background blob */}
                <div className="absolute -right-4 -top-4 w-20 h-20 bg-blue-400/20 blur-2xl rounded-full pointer-events-none" />

                <div className="flex items-center gap-4 relative z-10 w-full">
                    <div className="w-12 h-12 rounded-xl bg-blue-50/80 flex items-center justify-center text-2xl shadow-sm border border-blue-100">
                        {loading ? (
                            <div className="animate-spin w-4 h-4 border-2 border-blue-200 border-t-blue-500 rounded-full" />
                        ) : (
                            getWeatherIcon(weather?.conditionCode)
                        )}
                    </div>

                    <div className="flex-1">
                        <div className="flex justify-between items-start">
                            <div>
                                <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-1">
                                    📍 {weather?.address || locationName}
                                </h4>
                                <div className="flex items-baseline gap-1">
                                    {loading ? (
                                        <div className="h-6 w-16 bg-neutral-200 animate-pulse rounded mt-1" />
                                    ) : error ? (
                                        <span className="text-xs text-red-400">Unavailable</span>
                                    ) : (
                                        <>
                                            <span className="text-xl font-bold text-neutral-800">
                                                {Math.round(weather.temperature)}°
                                            </span>
                                            <span className="text-xs font-medium text-neutral-500">
                                                {getWeatherLabel(weather.conditionCode)}
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>

                            {!loading && !error && (
                                <div className="text-right">
                                    <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-0.5">Humidity</div>
                                    <div className="text-xs font-semibold text-neutral-600">{weather.humidity}%</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
