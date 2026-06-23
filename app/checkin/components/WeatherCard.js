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
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full z-10 mb-4"
        >
            <div className="relative bg-rams-panel border border-rams-rule-light p-4 overflow-hidden rounded-sm">
                {loading ? (
                    <div className="flex items-center gap-3 py-2 font-mono text-xs">
                        <div className="animate-spin w-4 h-4 border-2 border-rams-rule-light border-t-rams-rule rounded-full" />
                        <div className="h-4 w-40 bg-rams-bg animate-pulse rounded-sm" />
                    </div>
                ) : error ? (
                    <div className="text-xs text-rams-red font-mono py-1 flex items-center gap-2">
                        <span>⚠️ ไม่สามารถโหลดข้อมูลสภาพอากาศได้</span>
                    </div>
                ) : (
                    <div className="flex flex-col">
                        {/* Compact Main Row */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 min-w-0">
                                <motion.span
                                    className="text-3xl drop-shadow-none select-none block shrink-0"
                                    animate={{ y: [0, -1, 0] }}
                                    transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                                >
                                    {getWeatherIcon(weather?.conditionCode)}
                                </motion.span>
                                <div className="flex flex-col min-w-0">
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-2xl font-mono font-bold tracking-tight text-rams-ink">
                                            {Math.round(weather?.temperature)}°C
                                        </span>
                                        <span className="text-[10px] font-mono font-bold text-rams-ink-muted truncate">
                                            • อากาศ{getWeatherLabel(weather?.conditionCode)}
                                        </span>
                                    </div>
                                    <span className="text-[10px] text-rams-ink-muted/80 font-mono font-bold flex items-center gap-1 truncate">
                                        <MapPin className="w-3 h-3 text-rams-ink-muted shrink-0" />
                                        <span className="truncate">{weather?.address || locationName}</span>
                                    </span>
                                </div>
                            </div>

                            {/* Info on the Right & Radar Trigger */}
                            <div className="flex items-center gap-3 shrink-0 ml-2">
                                <div className="flex flex-col items-end text-right text-[10px] font-mono font-bold text-rams-ink-muted leading-tight">
                                    <span>
                                        {weather?.tempDiffText 
                                            ? `🌡️ ${weather.tempDiffText.replace('ประมาณ ', '').replace('เมื่อเทียบกับเมื่อวาน ', '').replace('องศา', '°C').trim()}` 
                                            : '🌡️ เท่าเมื่อวาน'}
                                    </span>
                                    <span>
                                        {weather?.hasRain 
                                            ? '🌧️ มีโอกาสฝนตก' 
                                            : '☀️ ไม่มีฝนวันนี้'}
                                    </span>
                                </div>
                                <button
                                    onClick={() => setShowRadar(prev => !prev)}
                                    className={`w-8 h-8 rounded-sm flex items-center justify-center border border-rams-rule-light transition-all active:translate-y-[1px] ${
                                        showRadar 
                                            ? 'bg-rams-ink text-rams-panel' 
                                            : 'bg-rams-bg text-rams-ink hover:bg-rams-rule-light'
                                    }`}
                                    title="ดูเรดาร์ฝนสด"
                                >
                                    <Compass className={`w-4 h-4 transition-transform duration-300 ${showRadar ? 'rotate-180 text-rams-orange' : ''}`} />
                                </button>
                            </div>
                        </div>

                        {/* Minimal advice row */}
                        <div className="mt-3 pt-2.5 border-t border-rams-rule-light flex items-start gap-1.5 text-[10px] font-mono font-semibold text-rams-ink">
                            <span className="text-rams-orange font-mono font-extrabold shrink-0 flex items-center gap-0.5">
                                <Sparkles className="w-3 h-3 text-rams-orange" /> Yuzu 🐾
                            </span>
                            <p className="flex-1 leading-normal text-rams-ink/90">
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
                                    transition={{ duration: 0.2, ease: "easeInOut" }}
                                    className="overflow-hidden w-full flex flex-col"
                                >
                                    <iframe
                                        id="windy-radar-iframe"
                                        src={`https://embed.windy.com/embed.html?lat=${latitude}&lon=${longitude}&zoom=9&level=surface&overlay=rain&product=ecmwf&menu=&message=&marker=true&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1`}
                                        className="w-full h-56 rounded-sm border border-rams-rule-light"
                                        title="Windy Live Rain Radar"
                                        loading="lazy"
                                    />
                                    <span className="text-[9px] font-mono font-bold text-rams-ink-muted mt-1.5 text-center block">
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
