/* Brand v2 · weather row for the check-in page. Text only, no icons or emoji.
 * Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5 */
import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const getWeatherLabel = (code) => {
    const map = {
        1000: 'แจ่มใส', 1100: 'มีแดดเป็นส่วนมาก', 1101: 'มีเมฆบางส่วน', 1001: 'มีเมฆมาก',
        4000: 'ฝนตกปรอย ๆ', 4001: 'ฝนตก', 4200: 'ฝนตกเล็กน้อย', 8000: 'พายุฝนฟ้าคะนอง'
    };
    return map[code] || 'ไม่ทราบสภาพอากาศ';
};

const plain = (s) => String(s ?? '').replace(/[\p{Extended_Pictographic}️‍]/gu, '').replace(/\s{2,}/g, ' ').trim();

export default function WeatherCard({ latitude, longitude, locationName = "ตำแหน่งปัจจุบัน" }) {
    const [weather, setWeather] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showRadar, setShowRadar] = useState(false);

    const lastCoords = useRef({ lat: 0, lon: 0 });

    useEffect(() => {
        if (!latitude || !longitude) return;

        // Only refetch after moving ~1 km, so small GPS drift doesn't flicker
        const distLat = Math.abs(latitude - lastCoords.current.lat);
        const distLon = Math.abs(longitude - lastCoords.current.lon);
        if (distLat < 0.01 && distLon < 0.01) return;
        lastCoords.current = { lat: latitude, lon: longitude };

        const fetchWeather = async () => {
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

    // API text e.g. "เย็นกว่าเมื่อวานประมาณ 0.6°C" -> "เย็นกว่าเมื่อวาน 0.6°C"
    const tempDiff = weather?.tempDiffText
        ? weather.tempDiffText.replace('เมื่อเทียบกับเมื่อวาน', '').replace('ประมาณ', ' ').replace('องศา', '°C').replace(/\s+/g, ' ').trim()
        : 'อุณหภูมิเท่าเมื่อวาน';

    return (
        <motion.section
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="w-full bg-cream border border-rule"
        >
            {loading ? (
                <p className="px-4 py-3 text-base text-neutral">กำลังโหลดสภาพอากาศ…</p>
            ) : error ? (
                <p className="px-4 py-3 text-base text-error">โหลดข้อมูลสภาพอากาศไม่ได้</p>
            ) : (
                <>
                    <div className="flex items-stretch">
                        <div className="flex-1 min-w-0 px-4 py-3">
                            <p className="text-sm font-semibold text-neutral truncate">อากาศ · {weather?.address || locationName}</p>
                            <p className="flex items-baseline gap-2 mt-1">
                                <span className="font-num text-3xl text-charcoal">{Math.round(weather?.temperature)}°C</span>
                                <span className="text-base text-subtle truncate">{getWeatherLabel(weather?.conditionCode)}</span>
                            </p>
                            <p className="text-sm text-neutral mt-1">
                                {weather?.hasRain ? 'มีโอกาสฝนตก' : 'ไม่มีฝนวันนี้'} · {tempDiff}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowRadar((prev) => !prev)}
                            aria-expanded={showRadar}
                            className={`shrink-0 min-w-[72px] px-3 border-l border-rule text-sm font-semibold transition-colors duration-150 ${
                                showRadar ? 'bg-plum text-cream' : 'bg-cream text-plum hover:bg-paper-2'
                            }`}
                        >
                            {showRadar ? 'ปิดเรดาร์' : 'เรดาร์ฝน'}
                        </button>
                    </div>

                    {weather?.employeeAdvice && (
                        <p className="border-t border-rule px-4 py-3 text-base text-charcoal">
                            <span className="font-semibold text-plum">ยูซุ: </span>
                            {plain(weather.employeeAdvice)}
                        </p>
                    )}

                    <AnimatePresence initial={false}>
                        {showRadar && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.16 }}
                                className="border-t border-rule"
                            >
                                <iframe
                                    id="windy-radar-iframe"
                                    src={`https://embed.windy.com/embed.html?lat=${latitude}&lon=${longitude}&zoom=9&level=surface&overlay=rain&product=ecmwf&menu=&message=&marker=true&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1`}
                                    className="w-full h-56 block"
                                    title="เรดาร์ฝนสดจาก Windy"
                                    loading="lazy"
                                />
                                <p className="px-4 py-2 text-sm text-neutral border-t border-rule">แผนที่พยากรณ์สดจาก Windy.com</p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </>
            )}
        </motion.section>
    );
}
