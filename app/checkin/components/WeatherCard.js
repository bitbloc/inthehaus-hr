import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Thermometer, CloudRain, Sparkles, Compass, ChevronDown, ChevronUp, MapPin } from 'lucide-react';

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
};

export default function WeatherCard({ latitude, longitude, locationName = "Current Location" }) {
    const [weather, setWeather] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showRadar, setShowRadar] = useState(false);

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

    // Determine ambient glow color based on weather condition
    const isRainy = weather?.hasRain || weather?.conditionCode === 4000 || weather?.conditionCode === 4001 || weather?.conditionCode === 4200 || weather?.conditionCode === 8000;
    const glowClass = isRainy
        ? "from-blue-400/20 via-indigo-400/10 to-transparent"
        : "from-amber-300/20 via-orange-300/10 to-transparent";

    return (
        <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-sm z-10 mb-4 px-6"
        >
            <div className="relative bg-white/70 backdrop-blur-xl border border-white rounded-[2rem] shadow-[0_8px_32px_0_rgba(31,38,135,0.06)] p-4 overflow-hidden transition-all duration-300 hover:shadow-[0_12px_40px_0_rgba(31,38,135,0.1)]">
                {/* Background ambient glow blob */}
                <div className={`absolute -top-12 -right-12 w-28 h-28 rounded-full bg-gradient-to-br ${glowClass} blur-xl pointer-events-none`} />

                {loading ? (
                    <div className="flex items-center gap-3 py-2">
                        <div className="animate-spin w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full" />
                        <div className="h-4 w-40 bg-slate-200 animate-pulse rounded-lg" />
                    </div>
                ) : error ? (
                    <div className="text-xs text-red-500 font-medium py-1 flex items-center gap-2">
                        <span>⚠️ ไม่สามารถโหลดข้อมูลสภาพอากาศได้</span>
                    </div>
                ) : (
                    <div className="flex flex-col">
                        {/* Compact Main Row */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 min-w-0">
                                <motion.span
                                    className="text-3xl drop-shadow-sm select-none block shrink-0"
                                    animate={{ y: [0, -2, 0] }}
                                    transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                                >
                                    {getWeatherIcon(weather?.conditionCode)}
                                </motion.span>
                                <div className="flex flex-col min-w-0">
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-2xl font-black tracking-tight text-slate-800">
                                            {Math.round(weather?.temperature)}°C
                                        </span>
                                        <span className="text-[10px] font-bold text-slate-500 truncate">
                                            • อากาศ{getWeatherLabel(weather?.conditionCode)}
                                        </span>
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-bold flex items-center gap-0.5 truncate">
                                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                        <span className="truncate">{weather?.address || locationName}</span>
                                    </span>
                                </div>
                            </div>

                            {/* Info on the Right & Radar Trigger */}
                            <div className="flex items-center gap-3 shrink-0 ml-2">
                                <div className="flex flex-col items-end text-right text-[9px] font-bold text-slate-500 leading-snug">
                                    <span>
                                        {weather?.tempDiffText 
                                            ? `🌡️ ${weather.tempDiffText.replace('เมื่อเทียบกับเมื่อวาน ', '').replace('องศา', '°C')}` 
                                            : '🌡️ ใกล้เคียงเมื่อวาน'}
                                    </span>
                                    <span>
                                        {weather?.hasRain 
                                            ? `🌧️ ฝน: ${weather.rainBlocks.join(', ')}` 
                                            : '☀️ ไม่มีฝนวันนี้'}
                                    </span>
                                </div>
                                <button
                                    onClick={() => setShowRadar(prev => !prev)}
                                    className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all ${
                                        showRadar 
                                            ? 'bg-slate-900 border-slate-950 text-white shadow-sm' 
                                            : 'bg-slate-900/5 border-slate-200/40 text-slate-600 hover:bg-slate-900/10'
                                    }`}
                                    title="ดูเรดาร์ฝนสด"
                                >
                                    <Compass className={`w-4 h-4 transition-transform duration-300 ${showRadar ? 'rotate-180 text-indigo-400' : ''}`} />
                                </button>
                            </div>
                        </div>

                        {/* Minimal mascot advice row */}
                        <div className="mt-3 pt-2.5 border-t border-slate-100/80 flex items-start gap-1.5 text-[10px] font-semibold text-slate-600">
                            <span className="text-orange-500 font-extrabold shrink-0 flex items-center gap-0.5">
                                <Sparkles className="w-3 h-3 text-orange-400" /> Yuzu 🐾
                            </span>
                            <p className="flex-1 leading-normal text-slate-700">
                                {weather?.employeeAdvice}
                            </p>
                        </div>

                        {/* Expandable radar iframe */}
                        <AnimatePresence>
                            {showRadar && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0, marginTop: 0 }}
                                    animate={{ height: 'auto', opacity: 1, marginTop: 10 }}
                                    exit={{ height: 0, opacity: 0, marginTop: 0 }}
                                    transition={{ duration: 0.25, ease: "easeInOut" }}
                                    className="overflow-hidden w-full flex flex-col"
                                >
                                    <iframe
                                        id="windy-radar-iframe"
                                        src={`https://embed.windy.com/embed.html?lat=${latitude}&lon=${longitude}&zoom=9&level=surface&overlay=rain&product=ecmwf&menu=&message=&marker=true&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1`}
                                        className="w-full h-56 rounded-2xl border border-slate-200 shadow-inner"
                                        title="Windy Live Rain Radar"
                                        loading="lazy"
                                    />
                                    <span className="text-[9px] font-bold text-slate-400 mt-1.5 text-center block">
                                        *แผนที่พยากรณ์สดจาก Windy.com
                                    </span>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </motion.div>
    );
}
