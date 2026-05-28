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
            className="w-full max-w-sm z-10 mb-6 px-6"
        >
            <div className="relative bg-white/70 backdrop-blur-xl border border-white rounded-[2rem] shadow-[0_8px_32px_0_rgba(31,38,135,0.06)] p-5 overflow-hidden transition-all duration-300 hover:shadow-[0_12px_40px_0_rgba(31,38,135,0.1)]">
                {/* Background ambient glow blob */}
                <div className={`absolute -top-12 -right-12 w-28 h-28 rounded-full bg-gradient-to-br ${glowClass} blur-xl pointer-events-none`} />

                {loading ? (
                    <div className="flex flex-col gap-4 py-3">
                        <div className="flex items-center gap-3">
                            <div className="animate-spin w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full" />
                            <div className="h-4 w-40 bg-slate-200 animate-pulse rounded-lg" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="h-16 bg-slate-100 animate-pulse rounded-2xl" />
                            <div className="h-16 bg-slate-100 animate-pulse rounded-2xl" />
                        </div>
                    </div>
                ) : error ? (
                    <div className="text-xs text-red-500 font-medium py-2 flex items-center gap-2">
                        <span>⚠️ ไม่สามารถโหลดข้อมูลสภาพอากาศได้</span>
                    </div>
                ) : (
                    <div className="flex flex-col">
                        {/* 1. Header Current Info */}
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100/80">
                            <div className="flex items-center gap-3.5">
                                <motion.span
                                    className="text-4xl drop-shadow-sm select-none block"
                                    animate={{ y: [0, -4, 0] }}
                                    transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                                >
                                    {getWeatherIcon(weather?.conditionCode)}
                                </motion.span>
                                <div className="flex flex-col">
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-3xl font-black tracking-tight text-slate-800">
                                            {Math.round(weather?.temperature)}
                                        </span>
                                        <span className="text-sm font-semibold text-slate-500">°C</span>
                                    </div>
                                    <span className="text-xs font-semibold text-slate-600">
                                        วันนี้อากาศ{getWeatherLabel(weather?.conditionCode)}
                                    </span>
                                </div>
                            </div>
                            <div className="flex flex-col items-end text-right">
                                <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                    <span>Location</span>
                                </div>
                                <span className="text-[11px] font-bold text-slate-600 truncate max-w-[120px]" title={weather?.address || locationName}>
                                    {weather?.address || locationName}
                                </span>
                            </div>
                        </div>

                        {/* 2. Grid Dashboard Insights */}
                        <div className="grid grid-cols-2 gap-3 mt-4">
                            {/* Yesterday Temperature Comparison */}
                            <div className={`p-3 rounded-2xl flex flex-col justify-between transition-all duration-300 ${
                                weather?.tempComparisonStatus === 'hotter'
                                    ? 'bg-gradient-to-br from-rose-50/60 to-rose-100/20 border border-rose-100/40 text-rose-800'
                                    : weather?.tempComparisonStatus === 'colder'
                                        ? 'bg-gradient-to-br from-sky-50/60 to-sky-100/20 border border-sky-100/40 text-sky-800'
                                        : 'bg-gradient-to-br from-slate-50/60 to-slate-100/20 border border-slate-200/40 text-slate-700'
                            }`}>
                                <div className="flex items-center gap-1.5 opacity-80 mb-1">
                                    <Thermometer className="w-3.5 h-3.5" />
                                    <span className="text-[10px] font-bold tracking-wide">เทียบเมื่อวาน</span>
                                </div>
                                <span className="text-[11px] font-black leading-snug">
                                    {weather?.tempDiffText || 'ใกล้เคียงกับเมื่อวาน'}
                                </span>
                            </div>

                            {/* Rain Timeline Details */}
                            <div className={`p-3 rounded-2xl flex flex-col justify-between transition-all duration-300 ${
                                weather?.hasRain
                                    ? 'bg-gradient-to-br from-amber-50/60 to-amber-100/20 border border-amber-200/40 text-amber-800'
                                    : 'bg-gradient-to-br from-emerald-50/50 to-emerald-100/20 border border-emerald-100/30 text-emerald-800'
                            }`}>
                                <div className="flex items-center gap-1.5 opacity-80 mb-1">
                                    <CloudRain className="w-3.5 h-3.5" />
                                    <span className="text-[10px] font-bold tracking-wide">ช่วงเวลาฝน</span>
                                </div>
                                <div className="text-[11px] font-black leading-snug">
                                    {weather?.hasRain ? (
                                        <div className="flex flex-col">
                                            {weather.rainBlocks.map((b, idx) => (
                                                <span key={idx}>{b}</span>
                                            ))}
                                        </div>
                                    ) : (
                                        <span>ไม่มีฝนตกวันนี้</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 3. Mascot Advice (Yuzu says) */}
                        <div className="bg-gradient-to-r from-orange-50/80 to-amber-50/40 border border-orange-100/60 rounded-2xl p-3.5 flex gap-2.5 items-start mt-4 shadow-sm">
                            <motion.div
                                animate={{ rotate: [0, 8, -8, 0] }}
                                transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
                            >
                                <Sparkles className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                            </motion.div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-orange-600 uppercase tracking-widest leading-none mb-1">Yuzu's Tip 🐾</span>
                                <p className="text-[11px] font-bold text-slate-700 leading-relaxed">
                                    {weather?.employeeAdvice}
                                </p>
                            </div>
                        </div>

                        {/* 4. Windy live radar map toggle button */}
                        <button
                            id="btn-toggle-windy-radar"
                            onClick={() => setShowRadar(prev => !prev)}
                            className="w-full py-2.5 px-4 mt-4 bg-slate-900/5 hover:bg-slate-900/10 active:scale-[0.98] text-slate-800 text-xs font-bold rounded-2xl flex items-center justify-center gap-2 transition-all duration-200 border border-slate-200 cursor-pointer"
                        >
                            <Compass className={`w-3.5 h-3.5 text-slate-600 transition-transform duration-300 ${showRadar ? 'rotate-180' : ''}`} />
                            <span>{showRadar ? 'ซ่อนแผนที่เรดาร์ฝน' : 'ดูเรดาร์ฝนสด (Windy.com)'}</span>
                            {showRadar ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>

                        {/* Expandable radar iframe */}
                        <AnimatePresence>
                            {showRadar && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0, marginTop: 0 }}
                                    animate={{ height: 'auto', opacity: 1, marginTop: 12 }}
                                    exit={{ height: 0, opacity: 0, marginTop: 0 }}
                                    transition={{ duration: 0.3, ease: "easeInOut" }}
                                    className="overflow-hidden w-full flex flex-col"
                                >
                                    <iframe
                                        id="windy-radar-iframe"
                                        src={`https://embed.windy.com/embed.html?lat=${latitude}&lon=${longitude}&zoom=9&level=surface&overlay=rain&product=ecmwf&menu=&message=&marker=true&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1`}
                                        className="w-full h-60 rounded-2xl border border-slate-200 shadow-inner"
                                        title="Windy Live Rain Radar"
                                        loading="lazy"
                                    />
                                    <span className="text-[9px] font-bold text-slate-400 mt-2 text-center block">
                                        *แผนที่พยากรณ์สดแบบมีปฏิสัมพันธ์จาก Windy.com
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
