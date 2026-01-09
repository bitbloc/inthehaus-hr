"use client";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { format, isValid } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs) {
    return twMerge(clsx(inputs));
}

export default function ChecklistPage() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('All'); // 'All', 'Opening', 'Closing'
    const [selectedImage, setSelectedImage] = useState(null); // For lightbox
    const [availableMonths, setAvailableMonths] = useState([]);
    const [selectedMonth, setSelectedMonth] = useState('');

    const SHEET_URL = "https://docs.google.com/spreadsheets/d/1AJVcXjwuzlm5U_UPD91wWPKz76jTRrW2VPsL22MR9CU/export?format=csv";

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') setSelectedImage(null);
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await fetch(SHEET_URL);
            if (!res.ok) throw new Error("Failed to fetch data");
            const csvText = await res.text();
            const workbook = XLSX.read(csvText, { type: "string" });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet);

            // Process data to match our needs
            const processedData = jsonData.map((row, index) => {
                // Helper to find value by trimmed key
                const getValue = (searchKey) => {
                    const key = Object.keys(row).find(k => k.trim() === searchKey.trim());
                    return key ? row[key] : undefined;
                };

                const timestamp = parseThaiDate(getValue("Timestamp") || getValue("ประทับเวลา") || Object.values(row)[0]);

                // Time-based Categorization
                // Opening: 10:00 - 16:30
                // Closing: 16:30 - 01:00 (next day) and beyond
                let type = "Closing"; // Default
                if (isValid(timestamp)) {
                    const hour = timestamp.getHours();
                    const minute = timestamp.getMinutes();
                    const totalMinutes = hour * 60 + minute;

                    // 10:00 (600 min) to 16:30 (990 min)
                    if (totalMinutes >= 600 && totalMinutes < 990) {
                        type = "Opening";
                    }
                }

                // Fallback to text detection if timestamp is invalid? 
                // Currently isValid(timestamp) logic handles the main path.

                const isOpening = type === "Opening";

                return {
                    id: index,
                    timestamp: timestamp,
                    staffName: getValue("ชื่อพนักงาน ( Aka )"),
                    type: type,
                    tasks: isOpening
                        ? [
                            getValue("เช็คความพร้อมก่อนเปิด"),
                            getValue("ระบบเงินและ POS")
                        ]
                        : [
                            getValue("ความสะอาดและสต็อก (Cleaning & Stock)"),
                            getValue("ระบบเงินและการปิดร้าน (Closing)")
                        ],
                    cash: getValue("ระบุยอดเงินในลิ้นชักก่อนเปิด (บาท)") || getValue("ระบุยอดเงินสดปิดร้าน (บาท)"),
                    photos: extractPhotoLinks(row),
                    note: getValue("หมายเหตุ"),
                    raw: row
                };
            });

            // Extract available months
            const months = [...new Set(processedData
                .filter(item => isValid(item.timestamp))
                .map(item => format(item.timestamp, 'MMMM yyyy'))
            )];
            setAvailableMonths(months);

            // Default to current month if not set
            if (!selectedMonth && months.length > 0) {
                const currentMonth = format(new Date(), 'MMMM yyyy');
                if (months.includes(currentMonth)) {
                    setSelectedMonth(currentMonth);
                } else {
                    setSelectedMonth(months[0]);
                }
            }

            setData(processedData);
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const parseThaiDate = (dateStr) => {
        if (!dateStr) return null;

        let date;
        const str = String(dateStr).trim();
        if (!str) return null;

        // Check if it's an Excel Serial Number (e.g. 45669.5)
        // Excel base date is Dec 30, 1899.
        if (!isNaN(dateStr) && parseFloat(dateStr) > 20000) {
            const excelDate = parseFloat(dateStr);
            // Conversion roughly: (Serial - 25569) * 86400 * 1000
            // But base date varies. Standard method:
            const excelEpoch = new Date(1899, 11, 30);
            const msPerDay = 86400 * 1000;
            // Add days
            const time = excelEpoch.getTime() + excelDate * msPerDay;
            // Adjustment for timezone? Excel serials are usually local.
            // But we can return the date object.
            // Note: Excel leap year bug (1900) - usually negligible for recent dates.
            date = new Date(time);

            // Compensate for local/UTC if needed? Usually Excel serial is "days since 1899 local".
            // JS Date(time) assumes UTC timestamp if we pass number?
            // No, new Date(ms) creates a date at that exact UTC time.
            // If Excel 45669.5 means "Local time", then we need to adjust for timezone offset if we want "Local" representation?
            // Actually, usually treating it as UTC milliseconds is safe if we don't care about shifting hours across zones too much.
            // Let's refine:
            // 45669.5 -> 2025-01-12...
            // Let's rely on standard formula: (value - 25569) * 86400000.
            // 25569 is offset for 1970-01-01.
            date = new Date((excelDate - 25569) * 86400000);

            // The result is a UTC date.
            // e.g. 2026-01-01T07:00:00Z.
            // If we display it in local time, it will be 14:00 (UTC+7).
            // But if the Sheet said "07:00", we want "07:00".
            // Excel Serial 07:00 is usually just 0.29...
            // If we want to preserve the "face value" of the date (e.g. it says Jan 1 07:00), we should treat the resulting Date object as if it's in the user's timezone.
            // But simpler: just return this date. The 1970 issue is mostly because it was treated as "0" or "invalid". Need to confirm via script.
        }
        else {
            // Enforce d/m/y parsing for Google Sheet exports
            // Matches start with d/m/y (allowing 1 or 2 digits)
            const dateMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);

            if (dateMatch) {
                const day = dateMatch[1].padStart(2, '0');
                const month = dateMatch[2].padStart(2, '0');
                const year = dateMatch[3];

                let hour = '00';
                let minute = '00';
                let second = '00';

                // Look for time component anywhere in the string
                const timeMatch = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
                if (timeMatch) {
                    hour = timeMatch[1].padStart(2, '0');
                    minute = timeMatch[2].padStart(2, '0');
                    if (timeMatch[3]) second = timeMatch[3].padStart(2, '0');
                }

                date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
            } else {
                // Fallback for standard ISO or other formats
                date = new Date(dateStr);
            }
        }

        if (!isValid(date) || date.getFullYear() < 2000) {
            // Filter out older dates (e.g. 1970) explicitly to be safe
            return null;
        }
        return date;
    }

    const extractPhotoLinks = (row) => {
        const photos = [];
        Object.values(row).forEach(val => {
            if (typeof val === 'string' && val.includes('http')) {
                const potentialLinks = val.split(',').map(s => s.trim()).filter(s => s.startsWith('http'));
                potentialLinks.forEach(link => {
                    const linkStr = String(link);
                    let id = null;

                    // Match id=XXX
                    const idMatch = linkStr.match(/id=([a-zA-Z0-9_-]+)/);
                    // Match /d/XXX
                    const dMatch = linkStr.match(/\/d\/([a-zA-Z0-9_-]+)/);

                    if (idMatch) id = idMatch[1];
                    else if (dMatch) id = dMatch[1];

                    if (id) {
                        photos.push({
                            thumbnail: `https://drive.google.com/thumbnail?id=${id}&sz=w400`,
                            full: `https://drive.google.com/file/d/${id}/preview`
                        });
                    } else {
                        photos.push({ thumbnail: linkStr, full: linkStr });
                    }
                });
            }
        });

        // Remove duplicates based on full url
        return photos.filter((v, i, a) => a.findIndex(v2 => (v2.full === v.full)) === i);
    }

    // Filter and Sort Logic
    // Filter and Sort Logic
    const filteredData = data
        .filter(item => {
            // Must have a valid timestamp to be shown
            if (!isValid(item.timestamp)) return false;

            // Month Filter
            if (selectedMonth) {
                if (format(item.timestamp, 'MMMM yyyy') !== selectedMonth) return false;
            }

            if (filter === 'All') return true;
            return item.type === filter;
        })
        .sort((a, b) => b.timestamp - a.timestamp);

    return (
        <div className="min-h-screen bg-background text-foreground font-sans p-6 md:p-12 font-feature-settings-['ss01'] max-w-4xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight mb-2">Checklist History</h1>
                    <p className="text-muted-foreground">Store opening and closing records</p>
                </div>

                <div className="flex flex-col md:flex-row items-center gap-2">
                    {/* Month Selector */}
                    {availableMonths.length > 0 && (
                        <div className="relative">
                            <select
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(e.target.value)}
                                className="appearance-none pl-4 pr-10 py-2 rounded-xl bg-white border border-border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm cursor-pointer hover:bg-zinc-50 transition-colors"
                            >
                                {availableMonths.map(month => (
                                    <option key={month} value={month}>{month}</option>
                                ))}
                            </select>
                            <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-zinc-500">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                            </div>
                        </div>
                    )}

                    {/* Filter Tabs */}
                    <div className="flex p-1 bg-muted rounded-xl">
                        {['All', 'Opening', 'Closing'].map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={cn(
                                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                                    filter === f ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {f === 'All' ? 'All' : f === 'Opening' ? '☀️ Opening' : '🌙 Closing'}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={fetchData}
                        disabled={loading}
                        className="w-10 h-10 flex items-center justify-center rounded-xl bg-muted hover:bg-muted/80 text-foreground transition-colors"
                    >
                        {loading ? <span className="animate-spin">↻</span> : <span>↺</span>}
                    </button>
                </div>
            </div>

            {loading && data.length === 0 ? (
                <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="w-full h-40 bg-card/50 rounded-3xl animate-pulse" />
                    ))}
                </div>
            ) : (
                <div className="grid gap-6">
                    <AnimatePresence mode="popLayout">
                        {filteredData.map((item) => (
                            <motion.div
                                key={item.id}
                                layout
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="bg-card rounded-3xl p-6 soft-shadow border border-border/50 overflow-hidden relative"
                            >
                                {/* Status Strip */}
                                <div className={cn(
                                    "absolute top-0 left-0 w-full h-1.5",
                                    item.type === 'Opening' ? "bg-gradient-to-r from-orange-300 to-yellow-300" : "bg-gradient-to-r from-indigo-400 to-purple-400"
                                )} />

                                <div className="flex flex-col md:flex-row md:items-start gap-6">
                                    {/* Header Info */}
                                    <div className="flex-1 min-w-[200px]">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className={cn(
                                                "w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-sm",
                                                item.type === 'Opening' ? "bg-orange-50 text-orange-500" : "bg-indigo-50 text-indigo-500"
                                            )}>
                                                {item.type === 'Opening' ? '☀️' : '🌙'}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-lg leading-tight">{item.staffName}</h3>
                                                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                                                    {item.type} • {isValid(item.timestamp) ? format(item.timestamp, "dd MMM, HH:mm") : 'Date Error'}
                                                </p>
                                            </div>
                                        </div>

                                        {item.cash && (
                                            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted/50 mb-4">
                                                <span className="text-xs font-bold text-muted-foreground uppercase">Cash</span>
                                                <span className="font-mono font-medium">{item.cash} THB</span>
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            {item.tasks.flat().filter(Boolean).map((taskStr, i) => {
                                                // Sometimes tasks are comma joined in one string
                                                return String(taskStr).split(',').map((t, j) => (
                                                    t.trim() && (
                                                        <div key={`${i}-${j}`} className="flex items-start gap-2 text-sm text-foreground/80">
                                                            <span className="text-green-500 mt-0.5">✓</span>
                                                            <span>{t.trim()}</span>
                                                        </div>
                                                    )
                                                ));
                                            })}
                                        </div>

                                        {item.note && (
                                            <div className="mt-4 p-3 bg-yellow-50 text-yellow-800 text-sm rounded-xl border border-yellow-100">
                                                <span className="font-bold mr-1">Note:</span> {item.note}
                                            </div>
                                        )}
                                    </div>

                                    {/* Gallery */}
                                    {item.photos.length > 0 && (
                                        <div className="flex gap-2 overflow-x-auto pb-2 md:w-1/3 md:grid md:grid-cols-2 md:gap-2 md:overflow-visible h-fit scrollbar-hide">
                                            {item.photos.map((photo, i) => (
                                                <div
                                                    key={i}
                                                    className="flex-shrink-0 relative group cursor-pointer"
                                                    onClick={() => setSelectedImage(photo.full)}
                                                >
                                                    <img
                                                        src={photo.thumbnail}
                                                        alt="Evidence"
                                                        referrerPolicy="no-referrer"
                                                        className="w-24 h-24 md:w-full md:h-24 object-cover rounded-xl bg-muted border border-border group-hover:opacity-90 transition-opacity"
                                                        onError={(e) => e.target.style.display = 'none'}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}

            {/* Lightbox Modal */}
            <AnimatePresence>
                {selectedImage && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setSelectedImage(null)}
                        className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="w-full max-w-5xl h-[80vh] bg-black rounded-2xl overflow-hidden relative shadow-2xl"
                            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking iframe area
                        >
                            <iframe
                                src={selectedImage}
                                className="w-full h-full border-0"
                                allow="autoplay"
                                title="Evidence Viewer"
                            />
                        </motion.div>

                        <button
                            className="absolute top-4 right-4 text-white p-2 rounded-full bg-black/50 hover:bg-black/70 z-50"
                            onClick={() => setSelectedImage(null)}
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
