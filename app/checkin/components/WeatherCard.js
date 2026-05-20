import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';

// Weather Codes Mapping (Simplified for Tomorrow.io)
const getWeatherIcon = (code) => {
    // Codes: 1000=Clear, 1100=Mostly Clear, 1101=Partly Cloudy, 1001=Cloudy
    // 4000=Drizzle, 4001=Rain, 4200=Light Rain, 8000=Thunderstorm
    const map = {
        1000: '☀️', 1100: '🌤️', 1101: '⛅', 1001: '☁️',
        4000: '🌧️', 4001: '🌧️', 4200: '🌦️', 8000: '⛈️'
    };
    return map[code] || '🌡️';
};

const getWeatherLabel = (code) => {
    const map = {
        1000: 'แจ่มใส', 1100: 'มีแดดเป็นส่วนมาก', 1101: 'มีเมฆบางส่วน', 1001: 'มีเมฆมาก',
        4000: 'ฝนตกปรอยๆ', 4001: 'ฝนตก', 4200: 'ฝนตกเล็กน้อย', 8000: 'พายุฝนฟ้าคะนอง'
    };
    return map[code] || 'ไม่ทราบสภาพอากาศ';
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
            <div className="px-5 py-4 bg-white/80 backdrop-blur-xl rounded-2xl border border-white shadow-sm flex items-center gap-3">
                {loading ? (
                    <div className="flex items-center gap-3 w-full">
                        <div className="animate-spin w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full" />
                        <div className="h-4 w-40 bg-slate-200 animate-pulse rounded" />
                    </div>
                ) : error ? (
                    <div className="text-xs text-red-500 font-medium">ไม่สามารถโหลดข้อมูลสภาพอากาศได้</div>
                ) : (
                    <p className="text-[13px] font-medium text-slate-700 leading-relaxed flex items-center gap-2">
                        <span className="text-2xl drop-shadow-sm">{getWeatherIcon(weather?.conditionCode)}</span>
                        <span>
                            วันนี้อากาศ <strong>{getWeatherLabel(weather?.conditionCode)}</strong> อุณหภูมิประมาณ <strong>{Math.round(weather?.temperature)}°C</strong> ที่ {weather?.address || locationName}
                        </span>
                    </p>
                )}
            </div>
        </motion.div>
    );
}
