"use client";
import { useEffect, useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { format, isValid, parse, parseISO } from "date-fns";
import { th } from "date-fns/locale"; // เพิ่ม locale ไทยสำหรับการแสดงผล
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// --- Utility: Class Merger ---
function cn(...inputs) {
    return twMerge(clsx(inputs));
}

// --- Configuration: Column Mapping ---
// วิธีนี้ช่วยให้แก้ไขง่ายในอนาคต หากมีการเปลี่ยนชื่อหัวข้อใน Google Form
const COLUMN_MAP = {
    TIMESTAMP: ["Timestamp", "ประทับเวลา", "วันที่"],
    STAFF_NAME: ["ชื่อพนักงาน ( Aka )", "Staff Name"],
    OPENING_TASKS: [
        "เช็คความพร้อมก่อนเปิด (Opening Checklist)",
        "ระบบเงินและ POS (Opening Cash & POS)",
        "เช็คความพร้อมก่อนเปิด",
        "ระบบเงินและ POS"
    ],
    CLOSING_TASKS: [
        "ความสะอาดและสต็อก (Cleaning & Stock)",
        "ระบบเงินและการปิดร้าน (Closing Money & System)",
        "ความสะอาดและสต็อก (Cleaning & Stock)",
        "ระบบเงินและการปิดร้าน (Closing)"
    ],
    CASH_OPEN: ["ระบุยอดเงินในลิ้นชักก่อนเปิด (บาท)", "Opening Cash"],
    CASH_CLOSE: ["ระบุยอดเงินสดปิดร้าน (บาท)", "Closing Cash"],
    NOTE: ["หมายเหตุ (Note)", "หมายเหตุ"],
};

export default function ChecklistPage() {
    // State Management
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('All');
    const [selectedImage, setSelectedImage] = useState(null);
    const [selectedMonth, setSelectedMonth] = useState('');

    // Google Sheet CSV Endpoint
    const SHEET_URL = "https://docs.google.com/spreadsheets/d/1AJVcXjwuzlm5U_UPD91wWPKz76jTRrW2VPsL22MR9CU/export?format=csv";

    // --- Hooks ---
    useEffect(() => {
        fetchData();
    }, []);

    // Handle ESC key for lightbox
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') setSelectedImage(null);
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    // --- Core Logic: Data Fetching & Processing ---
    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await fetch(SHEET_URL);

            if (!res.ok) throw new Error("Failed to connect to Database (Google Sheet)");

            const csvText = await res.text();
            const workbook = XLSX.read(csvText, { type: "string" });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet);

            const processedData = jsonData.map((row, index) => {
                // Helper: Find value flexibly based on config
                const findVal = (possibleKeys) => {
                    if (!Array.isArray(possibleKeys)) possibleKeys = [possibleKeys];
                    for (const key of possibleKeys) {
                        const foundKey = Object.keys(row).find(k => k.trim() === key);
                        if (foundKey && row[foundKey]) return row[foundKey];
                    }
                    return undefined;
                };

                // 1. Parse Date (Critical Fix)
                // Fallback to first column (Object.values(row)[0]) if named columns fail
                const timestampStr = findVal(COLUMN_MAP.TIMESTAMP) || Object.values(row)[0];
                const timestamp = parseGenericDate(timestampStr);

                // 2. Determine Type based on Content (Smart Detection)
                // แทนที่จะดูเวลา เราดูว่าเขากรอกช่องไหนมา ถ้ากรอกช่องเปิดร้าน ก็คือ Opening
                const hasOpeningData = findVal(COLUMN_MAP.OPENING_TASKS);
                const hasClosingData = findVal(COLUMN_MAP.CLOSING_TASKS);

                let type = "Unknown";
                if (hasOpeningData) type = "Opening";
                else if (hasClosingData) type = "Closing";
                else {
                    // Fallback to time if content is ambiguous
                    if (isValid(timestamp)) {
                        const hours = timestamp.getHours();
                        type = (hours >= 5 && hours < 16) ? "Opening" : "Closing";
                    }
                }

                const isOpening = type === "Opening";

                // 3. Extract Tasks
                // ดึงข้อมูล Task ตามประเภทที่ระบุ
                const taskKeys = isOpening ? COLUMN_MAP.OPENING_TASKS : COLUMN_MAP.CLOSING_TASKS;
                let tasks = [];
                // วนลูปหา value จาก key ที่ match
                taskKeys.forEach(keyText => {
                    const val = findVal([keyText]);
                    if (val) tasks.push(val);
                });

                return {
                    id: index,
                    timestamp: timestamp,
                    staffName: findVal(COLUMN_MAP.STAFF_NAME) || "Unknown Staff",
                    type: type,
                    tasks: tasks,
                    cash: isOpening ? findVal(COLUMN_MAP.CASH_OPEN) : findVal(COLUMN_MAP.CASH_CLOSE),
                    photos: extractPhotoLinks(row),
                    note: findVal(COLUMN_MAP.NOTE),
                    raw: row
                };
            });

            // Clean Data: Remove invalid dates & Sort
            const validData = processedData
                .filter(item => isValid(item.timestamp))
                .sort((a, b) => b.timestamp - a.timestamp);

            setData(validData);
        } catch (err) {
            console.error("Critical Data Error:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // --- Helper: Robust Date Parser ---
    const parseGenericDate = (dateStr) => {
        if (!dateStr) return null;

        // Case 1: Excel Serial Date (Numbers)
        if (!isNaN(dateStr) && parseFloat(dateStr) > 30000) {
            // Excel uses 1900 epoch, JS uses 1970. (Serial - 25569) * 86400 * 1000
            // Adjusted for timezone offsets usually manually
            return new Date((parseFloat(dateStr) - 25569) * 86400 * 1000);
        }

        // Clean string: Normalize
        // Replace comma with space, then collapse multiple spaces
        // "1/1/2026, 4:05:59" -> "1/1/2026 4:05:59"
        const str = String(dateStr).replace(/,/g, ' ').replace(/\s+/g, ' ').trim();

        // Case 2: DD/MM/YYYY HH:mm:ss (Common in TH/UK Sheets)
        // Try parsing with explicit format
        const formatsToTry = [
            'd/M/yyyy H:mm:ss',
            'd/M/yyyy HH:mm:ss',
            'dd/MM/yyyy HH:mm:ss',
            'M/d/yyyy H:mm:ss',
            'yyyy-MM-dd HH:mm:ss',
            'd/M/yyyy H:mm',
            'd/M/yyyy'
        ];

        for (const fmt of formatsToTry) {
            const parsed = parse(str, fmt, new Date());
            if (isValid(parsed)) return parsed;
        }

        // Case 3: Fallback to native
        const nativeParse = new Date(str);
        if (isValid(nativeParse)) return nativeParse;

        return null; // Strict return null to avoid "1970"
    };

    // --- Helper: Photo Link Extractor ---
    const extractPhotoLinks = (row) => {
        const photos = [];
        Object.values(row).forEach(val => {
            if (typeof val === 'string' && val.includes('http')) {
                // Split logic for multiple links in one cell
                const links = val.split(/[\s,]+/).filter(s => s.startsWith('http'));
                links.forEach(link => {
                    let id = null;
                    // Google Drive ID Extraction
                    const idMatch = link.match(/id=([a-zA-Z0-9_-]+)/) || link.match(/\/d\/([a-zA-Z0-9_-]+)/);
                    if (idMatch) id = idMatch[1];

                    if (id) {
                        photos.push({
                            thumbnail: `https://lh3.googleusercontent.com/d/${id}=s400`, // Better optimized Google thumbnail
                            full: `https://drive.google.com/file/d/${id}/preview`
                        });
                    } else {
                        // Regular image link
                        photos.push({ thumbnail: link, full: link });
                    }
                });
            }
        });
        // Deduplicate
        return photos.filter((v, i, a) => a.findIndex(v2 => (v2.full === v.full)) === i);
    };

    // --- Derived State: Months ---
    const availableMonths = useMemo(() => {
        const months = [...new Set(data.map(item => format(item.timestamp, 'MMMM yyyy')))];
        // If current selection is invalid, reset it
        if (months.length > 0 && !months.includes(selectedMonth)) {
            // Use setTimeout to avoid render loop warning, or handle in useEffect. 
            // Here we just let the UI handle empty state or user picks.
            // Actually, setting default here is safer:
            if (!selectedMonth) return months;
        }
        return months;
    }, [data]);

    // Set default month on data load
    useEffect(() => {
        if (availableMonths.length > 0 && !selectedMonth) {
            // Default to current month if exists, else first available
            const current = format(new Date(), 'MMMM yyyy');
            setSelectedMonth(availableMonths.includes(current) ? current : availableMonths[0]);
        }
    }, [availableMonths]);


    // --- Derived State: Filtered List ---
    const filteredData = data.filter(item => {
        const monthMatch = selectedMonth ? format(item.timestamp, 'MMMM yyyy') === selectedMonth : true;
        const typeMatch = filter === 'All' ? true : item.type === filter;
        return monthMatch && typeMatch;
    });

    // --- RENDER ---
    return (
        <div className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F] font-sans p-6 md:p-12 font-feature-settings-['ss01']">
            <div className="max-w-4xl mx-auto">

                {/* Header Section */}
                <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-6">
                    <div>
                        <h1 className="text-4xl font-bold tracking-tight text-black mb-2">Checklist History</h1>
                        <p className="text-zinc-500 font-medium">บันทึกการเปิด-ปิดร้านประจำวัน</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                        {/* Month Select */}
                        {availableMonths.length > 0 && (
                            <div className="relative group">
                                <select
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="appearance-none pl-4 pr-10 py-2.5 rounded-xl bg-white border border-zinc-200 text-sm font-semibold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm hover:border-zinc-300 transition-all cursor-pointer min-w-[160px]"
                                >
                                    {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-zinc-400">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
                                </div>
                            </div>
                        )}

                        {/* Filter Tabs - iOS Segmented Control Style */}
                        <div className="flex p-1 bg-zinc-200/60 rounded-xl backdrop-blur-md">
                            {['All', 'Opening', 'Closing'].map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={cn(
                                        "px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ease-out duration-200",
                                        filter === f
                                            ? "bg-white text-black shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
                                            : "text-zinc-500 hover:text-zinc-700"
                                    )}
                                >
                                    {f === 'All' ? 'ทั้งหมด' : f === 'Opening' ? '☀️ เปิดร้าน' : '🌙 ปิดร้าน'}
                                </button>
                            ))}
                        </div>

                        {/* Refresh Button */}
                        <button
                            onClick={fetchData}
                            disabled={loading}
                            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-600 transition-all shadow-sm active:scale-95"
                        >
                            {loading ? <span className="animate-spin text-lg">⟳</span> : <span className="text-lg">⟳</span>}
                        </button>
                    </div>
                </header>

                {/* Content Area */}
                {loading && data.length === 0 ? (
                    <div className="space-y-6">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="w-full h-48 bg-white rounded-3xl animate-pulse shadow-sm" />
                        ))}
                    </div>
                ) : (
                    <div className="grid gap-6">
                        <AnimatePresence mode="popLayout">
                            {filteredData.map((item) => (
                                <motion.div
                                    key={item.id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.98 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    transition={{ duration: 0.3, type: "spring", bounce: 0.2 }}
                                    className="bg-white rounded-[2rem] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-zinc-100 overflow-hidden relative group"
                                >
                                    {/* Decorative Status Line */}
                                    <div className={cn(
                                        "absolute left-0 top-8 bottom-8 w-1.5 rounded-r-lg transition-colors duration-300",
                                        item.type === 'Opening' ? "bg-orange-400" : "bg-indigo-500"
                                    )} />

                                    <div className="pl-6">
                                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-6">
                                            {/* Info Block */}
                                            <div>
                                                <div className="flex items-center gap-3 mb-2">
                                                    <span className={cn(
                                                        "text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-md",
                                                        item.type === 'Opening'
                                                            ? "bg-orange-50 text-orange-600"
                                                            : "bg-indigo-50 text-indigo-600"
                                                    )}>
                                                        {item.type}
                                                    </span>
                                                    <span className="text-zinc-400 text-sm font-medium">
                                                        {format(item.timestamp, "d MMMM yyyy • HH:mm", { locale: th })}
                                                    </span>
                                                </div>
                                                <h3 className="text-2xl font-bold text-zinc-900">{item.staffName}</h3>
                                            </div>

                                            {/* Cash Badge */}
                                            {item.cash && (
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">CASH DRAWER</span>
                                                    <span className="font-mono text-xl font-bold text-zinc-800 tabular-nums">
                                                        {item.cash} <span className="text-sm text-zinc-400">THB</span>
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Tasks List */}
                                        <div className="bg-zinc-50 rounded-2xl p-5 mb-6 space-y-3 border border-zinc-100/50">
                                            {item.tasks.length > 0 ? (
                                                item.tasks.flat().map((taskStr, i) => (
                                                    String(taskStr).split(',').map((t, j) => t.trim() && (
                                                        <div key={`${i}-${j}`} className="flex items-start gap-3">
                                                            <div className="mt-1 w-4 h-4 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                                                                <svg className="w-2.5 h-2.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                                                            </div>
                                                            <span className="text-zinc-600 text-sm leading-relaxed">{t.trim()}</span>
                                                        </div>
                                                    ))
                                                ))
                                            ) : (
                                                <p className="text-zinc-400 text-sm italic">No tasks recorded</p>
                                            )}
                                        </div>

                                        {/* Note Section */}
                                        {item.note && (
                                            <div className="mb-6 text-sm text-zinc-500 bg-amber-50/50 p-4 rounded-xl border border-amber-100/50">
                                                <strong className="text-amber-700/80 mr-1">Note:</strong> {item.note}
                                            </div>
                                        )}

                                        {/* Gallery Grid */}
                                        {item.photos.length > 0 && (
                                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                                {item.photos.map((photo, i) => (
                                                    <div
                                                        key={i}
                                                        onClick={() => setSelectedImage(photo.full)}
                                                        className="aspect-square rounded-xl overflow-hidden cursor-pointer relative group shadow-sm hover:shadow-md transition-all"
                                                    >
                                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors z-10" />
                                                        <img
                                                            src={photo.thumbnail}
                                                            alt="Evidence"
                                                            className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500"
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
            </div>

            {/* Lightbox Overlay */}
            <AnimatePresence>
                {selectedImage && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setSelectedImage(null)}
                        className="fixed inset-0 z-[100] bg-zinc-900/95 backdrop-blur-xl flex items-center justify-center p-4 md:p-10"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full h-full max-w-6xl bg-black rounded-3xl overflow-hidden shadow-2xl relative ring-1 ring-white/10"
                        >
                            <iframe
                                src={selectedImage}
                                className="w-full h-full border-0"
                                allow="autoplay"
                            />
                            <button
                                onClick={() => setSelectedImage(null)}
                                className="absolute top-6 right-6 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center backdrop-blur-md transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}