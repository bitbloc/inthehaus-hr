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

            setData(processedData);
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const parseThaiDate = (dateStr) => {
        if (!dateStr) return new Date();
        const str = String(dateStr);
        let date;

        // Google sheets formats: "25/11/2025, 14:12:50"
        const parts = str.match(/(\d+)\/(\d+)\/(\d+), (\d+):(\d+):(\d+)/);
        if (parts) {
            const day = parts[1].padStart(2, '0');
            const month = parts[2].padStart(2, '0');
            const year = parts[3];
            const hour = parts[4].padStart(2, '0');
            const minute = parts[5].padStart(2, '0');
            const second = parts[6].padStart(2, '0');
            date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
        } else {
            date = new Date(dateStr);
        }

        if (!isValid(date)) {
            console.warn("Invalid date parsed:", dateStr);
            return new Date();
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
                    if (linkStr.includes('drive.google.com')) {
                        const idMatch = linkStr.match(/id=([a-zA-Z0-9_-]+)/);
                        if (idMatch) {
                            photos.push({
                                thumbnail: `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w400`,
                                full: `https://drive.google.com/uc?export=view&id=${idMatch[1]}`
                            });
                        } else {
                            photos.push({ thumbnail: linkStr, full: linkStr });
                        }
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
    const filteredData = data
        .filter(item => {
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

                <div className="flex items-center gap-2">
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
                        <motion.img
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            src={selectedImage}
                            alt="Full Screen Evidence"
                            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                        />
                        <button
                            className="absolute top-4 right-4 text-white p-2 rounded-full bg-black/50 hover:bg-black/70"
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
