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

    const SHEET_URL = "https://docs.google.com/spreadsheets/d/1AJVcXjwuzlm5U_UPD91wWPKz76jTRrW2VPsL22MR9CU/export?format=csv";

    useEffect(() => {
        fetchData();
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
                return {
                    id: index,
                    timestamp: parseThaiDate(row["Timestamp"] || row["ประทับเวลา"] || Object.values(row)[0]),
                    staffName: row["ชื่อพนักงาน ( Aka )"],
                    type: row["ช่วงเวลาที่ตรวจสอบ"]?.includes("เปิด") ? "Opening" : "Closing", // "☀️ เปิดร้าน" or "🌙 ปิดร้าน"
                    tasks: row["ช่วงเวลาที่ตรวจสอบ"]?.includes("เปิด")
                        ? [
                            row["เช็คความพร้อมก่อนเปิด"],
                            row["ระบบเงินและ POS"],
                            row["ถ่ายรูปหน้าร้านหลังเตรียมเสร็จ"]
                        ]
                        : [
                            row["ความสะอาดและสต็อก (Cleaning & Stock)"],
                            row["ระบบเงินและการปิดร้าน (Closing)"],
                            row["ถ่ายรูปพื้นที่ก่อนปิดร้าน"]
                        ],
                    cash: row["ระบุยอดเงินในลิ้นชักก่อนเปิด (บาท)"] || row["ระบุยอดเงินสดปิดร้าน (บาท)"],
                    photos: extractPhotoLinks(row),
                    note: row["หมายเหตุ"],
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

        // Google sheets formats: "25/11/2025, 14:12:50" or "14/12/2025, 0:58:34"
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
            return new Date(); // Fallback to now to prevent crash
        }
        return date;
    }

    const extractPhotoLinks = (row) => {
        const inks = [];
        Object.values(row).forEach(val => {
            if (typeof val === 'string' && val.includes('http')) {
                const potentialLinks = val.split(',').map(s => s.trim()).filter(s => s.startsWith('http'));
                potentialLinks.forEach(link => {
                    const linkStr = String(link);
                    if (linkStr.includes('drive.google.com')) {
                        const idMatch = linkStr.match(/id=([a-zA-Z0-9_-]+)/);
                        if (idMatch) {
                            inks.push(`https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w400`);
                        } else {
                            inks.push(linkStr);
                        }
                    } else {
                        inks.push(linkStr);
                    }
                });
            }
        });
        return [...new Set(inks)];
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
                                            {item.photos.map((src, i) => (
                                                <a href={src.replace('thumbnail?', 'view?')} target="_blank" rel="noopener noreferrer" key={i} className="flex-shrink-0 relative group">
                                                    <img
                                                        src={src}
                                                        alt="Evidence"
                                                        loading="lazy"
                                                        referrerPolicy="no-referrer"
                                                        className="w-24 h-24 md:w-full md:h-24 object-cover rounded-xl bg-muted border border-border"
                                                        onError={(e) => e.target.style.display = 'none'}
                                                    />
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}
