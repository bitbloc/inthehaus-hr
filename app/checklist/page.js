"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import { format, isValid, parse, parseISO } from "date-fns";
import { th } from "date-fns/locale"; // Thai locale
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { 
    CheckCircle2, 
    AlertTriangle, 
    Camera, 
    User, 
    Clock, 
    DollarSign, 
    AlertCircle, 
    RefreshCw, 
    FileText, 
    Calendar, 
    ArrowUpRight, 
    ArrowDownRight, 
    Info, 
    X, 
    ChevronRight, 
    Search, 
    Filter,
    Check,
    CheckSquare,
    Play,
    Pause
} from "lucide-react";

// --- Utility: Class Merger ---
function cn(...inputs) {
    return twMerge(clsx(inputs));
}

// --- Configuration: Column Mapping ---
const COLUMN_MAP = {
    TIMESTAMP: ["Timestamp", "ประทับเวลา", "วันที่", "Group ID ของคุณคือ: C1210c7a0601b5a675060e312efe10bff"],
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
    PHOTO_OPEN: ["ถ่ายรูปหน้าร้านหลังเตรียมเสร็จ"],
    PHOTO_CLOSE: [
        "ถ่ายรูปพื้นที่ก่อนปิดร้าน", 
        "ภาพ Station บาร์โดยรวมก่อนกลับบ้าน * ( อัพทุกวัน )พื้น, และบาร์ด้านหลัง pos",
        "ถ่ายรูปสายยาง, กาง fly sheet ด้านข้าง"
    ]
};

// --- Helper: Parentheses-aware comma splitter ---
const splitTasks = (taskStr) => {
    if (!taskStr) return [];
    const result = [];
    let current = '';
    let depth = 0;
    for (let i = 0; i < taskStr.length; i++) {
        const char = taskStr[i];
        if (char === '(' || char === '[' || char === '{') {
            depth++;
        } else if (char === ')' || char === ']' || char === '}') {
            depth--;
        }
        
        if (char === ',' && depth === 0) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    if (current.trim()) {
        result.push(current.trim());
    }
    return result.filter(Boolean);
};

// --- Helper: Clean and Parse Cash Values ---
const parseCashVal = (cashStr) => {
    if (cashStr === undefined || cashStr === null) return null;
    const cleaned = String(cashStr)
        .replace(/,/g, '')
        .replace(/บาท/g, '')
        .replace(/\s+/g, '')
        .trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
};

// --- Helper: Extra Photo Extractor for specific columns ---
const extractPhotoLinksForKeys = (row, keys) => {
    const photos = [];
    keys.forEach(k => {
        const actualKey = Object.keys(row).find(rk => rk.trim().toLowerCase() === k.trim().toLowerCase());
        const val = actualKey ? row[actualKey] : null;
        if (typeof val === 'string' && val.includes('http')) {
            const links = val.split(/[\s,]+/).filter(s => s.startsWith('http'));
            links.forEach(link => {
                let id = null;
                const idMatch = link.match(/id=([a-zA-Z0-9_-]+)/) || link.match(/\/d\/([a-zA-Z0-9_-]+)/);
                if (idMatch) id = idMatch[1];
                if (id) {
                    photos.push({
                        thumbnail: `https://lh3.googleusercontent.com/d/${id}=s400`,
                        full: `https://drive.google.com/file/d/${id}/preview`
                    });
                } else {
                    photos.push({ thumbnail: link, full: link });
                }
            });
        }
    });
    return photos.filter((v, i, a) => a.findIndex(v2 => (v2.full === v.full)) === i);
};

export default function ChecklistPage() {
    // State Management
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('All');
    const [selectedImage, setSelectedImage] = useState(null);
    const [selectedMonth, setSelectedMonth] = useState('');
    const [selectedDayFilter, setSelectedDayFilter] = useState(null);
    
    // Auto-Sync States
    const [isAutoSync, setIsAutoSync] = useState(true);
    const [lastSyncedTime, setLastSyncedTime] = useState(null);
    const [countdown, setCountdown] = useState(30);

    const logsContainerRef = useRef(null);

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

    // Countdown / Polling logic
    useEffect(() => {
        let timer;
        if (isAutoSync && !loading) {
            timer = setInterval(() => {
                setCountdown(prev => {
                    if (prev <= 1) {
                        fetchData();
                        return 30;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else {
            setCountdown(30);
        }
        return () => clearInterval(timer);
    }, [isAutoSync, loading]);

    // --- Helper: Custom CSV Parser (Bypasses XLSX assumptions) ---
    const parseCSV = (text) => {
        const rows = [];
        let currentRow = [];
        let currentVal = '';
        let insideQuote = false;

        const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        for (let i = 0; i < cleanText.length; i++) {
            const char = cleanText[i];
            const nextChar = cleanText[i + 1];

            if (char === '"') {
                if (insideQuote && nextChar === '"') {
                    currentVal += '"';
                    i++; // Skip escaped quote
                } else {
                    insideQuote = !insideQuote;
                }
            } else if (char === ',' && !insideQuote) {
                currentRow.push(currentVal);
                currentVal = '';
            } else if (char === '\n' && !insideQuote) {
                currentRow.push(currentVal);
                rows.push(currentRow);
                currentRow = [];
                currentVal = '';
            } else {
                currentVal += char;
            }
        }
        if (currentVal || currentRow.length > 0) {
            currentRow.push(currentVal);
            rows.push(currentRow);
        }
        return rows;
    };

    const csvToJson = (rows) => {
        if (rows.length < 2) return [];
        const headers = rows[0].map(h => h.trim());
        
        // Handle duplicate headers cleanly
        const seenHeaders = {};
        const uniqueHeaders = headers.map(h => {
            if (!h) return '';
            if (seenHeaders[h] !== undefined) {
                seenHeaders[h]++;
                return `${h}_${seenHeaders[h]}`;
            } else {
                seenHeaders[h] = 0;
                return h;
            }
        });

        return rows.slice(1).map((row, idx) => {
            const obj = {};
            uniqueHeaders.forEach((h, i) => {
                if (row[i] !== undefined && h !== '') {
                    obj[h] = row[i];
                }
            });
            obj._rawRow = row;
            return obj;
        });
    };

    // --- Core Logic: Data Fetching & Processing ---
    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await fetch(SHEET_URL);

            if (!res.ok) throw new Error("Failed to connect to Database (Google Sheet)");

            const csvText = await res.text();
            const rows = parseCSV(csvText);
            const jsonData = csvToJson(rows);

            const processedData = jsonData.map((row, index) => {
                const findVal = (keyOrList) => {
                    let possibleKeys = keyOrList;
                    if (typeof keyOrList === 'string') {
                        possibleKeys = COLUMN_MAP[keyOrList];
                    }
                    if (!possibleKeys || !Array.isArray(possibleKeys)) return undefined;

                    for (const key of possibleKeys) {
                        const actualKey = Object.keys(row).find(k => k.trim().toLowerCase() === key.toLowerCase());
                        if (actualKey) return row[actualKey];
                    }
                    return undefined;
                };

                // 1. Parse Date
                let timestampVal = findVal('TIMESTAMP');
                if (!timestampVal) {
                    timestampVal = row._rawRow && row._rawRow[0];
                }
                const timestamp = parseGenericDate(timestampVal);

                // 2. Determine Type based on Check Time column or content
                const checkTimeCol = row["ช่วงเวลาที่ตรวจสอบ"] || "";
                let type = "Unknown";
                
                if (checkTimeCol.includes("เปิดร้าน")) {
                    type = "Opening";
                } else if (checkTimeCol.includes("ปิดร้าน")) {
                    type = "Closing";
                } else {
                    // Fallback to checking specific inputs
                    const hasOpeningData = findVal('OPENING_TASKS');
                    const hasClosingData = findVal('CLOSING_TASKS');
                    if (hasOpeningData) type = "Opening";
                    else if (hasClosingData) type = "Closing";
                    else if (isValid(timestamp)) {
                        const hours = timestamp.getHours();
                        type = (hours >= 5 && hours < 16) ? "Opening" : "Closing";
                    }
                }

                const isOpening = type === "Opening";

                // 3. Extract Tasks and split properly with paren-awareness
                const taskKeys = isOpening ? COLUMN_MAP.OPENING_TASKS : COLUMN_MAP.CLOSING_TASKS;
                let tasks = [];
                taskKeys.forEach(keyText => {
                    const val = findVal([keyText]);
                    if (val) {
                        tasks = tasks.concat(splitTasks(val));
                    }
                });

                // Extract specific details
                const cashStr = isOpening ? findVal(COLUMN_MAP.CASH_OPEN) : findVal(COLUMN_MAP.CASH_CLOSE);
                const cashVal = parseCashVal(cashStr);

                return {
                    id: index,
                    timestamp: timestamp,
                    staffName: findVal(COLUMN_MAP.STAFF_NAME) || "Unknown Staff",
                    type: type,
                    tasks: tasks,
                    cashStr: cashStr || null,
                    cash: cashVal,
                    photos: extractPhotoLinks(row),
                    note: findVal(COLUMN_MAP.NOTE),
                    raw: row
                };
            });

            // Filter valid dates and sort oldest-to-newest to run cumulative calculations
            const validData = processedData
                .filter(item => isValid(item.timestamp))
                .sort((a, b) => a.timestamp - b.timestamp);

            // Compute validation warnings & running cash discrepancies
            let lastClosingCash = null;
            let lastClosingDateStr = null;

            const validatedData = validData.map((item) => {
                const warnings = [];

                // A. Cash validation
                if (item.type === "Opening") {
                    if (item.cash !== null) {
                        if (lastClosingCash !== null) {
                            const cashDiff = item.cash - lastClosingCash;
                            if (cashDiff !== 0) {
                                warnings.push({
                                    type: "cash_mismatch",
                                    message: `ยอดเปิดร้าน (${item.cash.toLocaleString()} บ.) ไม่ตรงยอดปิดร้านกะก่อนหน้า (${lastClosingCash.toLocaleString()} บ.) ต่างกัน ${cashDiff > 0 ? '+' : ''}${cashDiff.toLocaleString()} บาท`,
                                    diff: cashDiff,
                                    prevVal: lastClosingCash,
                                    prevDate: lastClosingDateStr
                                });
                            }
                        }
                    } else if (item.cashStr) {
                        warnings.push({
                            type: "invalid_cash_format",
                            message: `ระบุยอดเงินแบบไม่ใช่ตัวเลข: "${item.cashStr}"`
                        });
                    } else {
                        warnings.push({
                            type: "missing_cash",
                            message: "ไม่ได้ระบุยอดเงินสดเปิดร้าน"
                        });
                    }
                } else if (item.type === "Closing") {
                    if (item.cash !== null) {
                        lastClosingCash = item.cash;
                        lastClosingDateStr = format(item.timestamp, "d MMM yy • HH:mm", { locale: th });
                    } else if (item.cashStr) {
                        warnings.push({
                            type: "invalid_cash_format",
                            message: `ระบุยอดเงินแบบไม่ใช่ตัวเลข: "${item.cashStr}"`
                        });
                    } else {
                        warnings.push({
                            type: "missing_cash",
                            message: "ไม่ได้ระบุยอดเงินสดปิดร้าน"
                        });
                    }
                }

                // B. Photo checks
                if (item.photos.length === 0) {
                    warnings.push({
                        type: "missing_photos",
                        message: "ไม่มีรูปภาพประกอบหลักฐาน"
                    });
                } else {
                    if (item.type === "Opening") {
                        const openPhotos = extractPhotoLinksForKeys(item.raw, COLUMN_MAP.PHOTO_OPEN);
                        if (openPhotos.length === 0) {
                            warnings.push({
                                type: "missing_required_photos",
                                message: "ขาดรูปถ่ายหน้าร้านหลักหลังเตรียมเสร็จ"
                            });
                        }
                    } else if (item.type === "Closing") {
                        const closePhotos = extractPhotoLinksForKeys(item.raw, COLUMN_MAP.PHOTO_CLOSE);
                        if (closePhotos.length === 0) {
                            warnings.push({
                                type: "missing_required_photos",
                                message: "ขาดรูปถ่ายพื้นที่บาร์หรือรูปปิดร้าน"
                            });
                        }
                    }
                }

                // C. Submission time checks (Punctuality)
                const hr = item.timestamp.getHours();
                const min = item.timestamp.getMinutes();
                const decimalTime = hr + min / 60;

                if (item.type === "Opening" && decimalTime > 11.0) {
                    warnings.push({
                        type: "late_submission",
                        message: `ส่งฟอร์มเปิดร้านล่าช้ามาก (${format(item.timestamp, "HH:mm")} น.)`
                    });
                } else if (item.type === "Closing" && decimalTime < 21.0) {
                    warnings.push({
                        type: "early_submission",
                        message: `ส่งฟอร์มปิดร้านเร็วเกินไป (${format(item.timestamp, "HH:mm")} น.)`
                    });
                }

                return {
                    ...item,
                    warnings,
                    hasDiscrepancies: warnings.length > 0
                };
            });

            // Sort back to newest-to-oldest for UI rendering
            const finalData = validatedData.sort((a, b) => b.timestamp - a.timestamp);
            setData(finalData);
            setLastSyncedTime(new Date());
            setError(null);
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
            return new Date((parseFloat(dateStr) - 25569) * 86400 * 1000);
        }

        // Clean string
        const str = String(dateStr).replace(/,/g, ' ').replace(/\s+/g, ' ').trim();

        // Case 2: Explicit Formats
        const formatsToTry = [
            'd/M/yyyy H:mm:ss',
            'd/M/yyyy HH:mm:ss',
            'dd/MM/yyyy HH:mm:ss',
            'yyyy-MM-dd HH:mm:ss',
            'd/M/yyyy H:mm',
            'd/M/yyyy',
            'd/M/yy H:mm:ss',
            'd/M/yy'
        ];

        for (const fmt of formatsToTry) {
            const parsed = parse(str, fmt, new Date());
            if (isValid(parsed)) {
                if (parsed.getFullYear() < 100) {
                    parsed.setFullYear(parsed.getFullYear() + 2000);
                }
                return parsed;
            }
        }

        // Case 3: Native Fallback (Restricted)
        if (!str.includes('/')) {
            const nativeParse = new Date(str);
            if (isValid(nativeParse)) return nativeParse;
        }

        return null;
    };

    // --- Helper: Photo Link Extractor ---
    const extractPhotoLinks = (row) => {
        const photos = [];
        Object.values(row).forEach(val => {
            if (typeof val === 'string' && val.includes('http')) {
                const links = val.split(/[\s,]+/).filter(s => s.startsWith('http'));
                links.forEach(link => {
                    let id = null;
                    const idMatch = link.match(/id=([a-zA-Z0-9_-]+)/) || link.match(/\/d\/([a-zA-Z0-9_-]+)/);
                    if (idMatch) id = idMatch[1];

                    if (id) {
                        photos.push({
                            thumbnail: `https://lh3.googleusercontent.com/d/${id}=s400`,
                            full: `https://drive.google.com/file/d/${id}/preview`
                        });
                    } else {
                        photos.push({ thumbnail: link, full: link });
                    }
                });
            }
        });
        return photos.filter((v, i, a) => a.findIndex(v2 => (v2.full === v.full)) === i);
    };

    // --- Derived State: Months ---
    const availableMonths = useMemo(() => {
        return [...new Set(data.map(item => format(item.timestamp, 'MMMM yyyy')))];
    }, [data]);

    // Set default month on data load
    useEffect(() => {
        if (availableMonths.length > 0 && !selectedMonth) {
            const current = format(new Date(), 'MMMM yyyy');
            setSelectedMonth(availableMonths.includes(current) ? current : availableMonths[0]);
        }
    }, [availableMonths]);

    // --- Derived State: Month Data ---
    const currentMonthData = useMemo(() => {
        if (!selectedMonth) return [];
        return data.filter(item => format(item.timestamp, 'MMMM yyyy') === selectedMonth);
    }, [data, selectedMonth]);

    // --- Derived State: Days of Selected Month ---
    const daysInMonth = useMemo(() => {
        if (!selectedMonth) return [];
        const parsedDate = parse(selectedMonth, 'MMMM yyyy', new Date());
        if (!isValid(parsedDate)) return [];
        
        const year = parsedDate.getFullYear();
        const month = parsedDate.getMonth();
        const numDays = new Date(year, month + 1, 0).getDate();
        
        const days = [];
        for (let d = 1; d <= numDays; d++) {
            days.push(new Date(year, month, d));
        }
        return days;
    }, [selectedMonth]);

    // Map month data to dates
    const dayStatusMap = useMemo(() => {
        const map = {};
        currentMonthData.forEach(item => {
            const dateStr = format(item.timestamp, 'yyyy-MM-dd');
            if (!map[dateStr]) {
                map[dateStr] = {
                    opening: null,
                    closing: null,
                    date: item.timestamp
                };
            }
            if (item.type === 'Opening') {
                map[dateStr].opening = item;
            } else if (item.type === 'Closing') {
                map[dateStr].closing = item;
            }
        });
        return map;
    }, [currentMonthData]);

    const firstDayOfWeek = useMemo(() => {
        if (daysInMonth.length === 0) return 0;
        return daysInMonth[0].getDay(); // 0: Sun, 1: Mon...
    }, [daysInMonth]);

    // --- Derived State: Statistics Dashboard ---
    const stats = useMemo(() => {
        const count = currentMonthData.length;
        const perfectCount = currentMonthData.filter(item => item.warnings.length === 0).length;
        const mismatchShifts = currentMonthData.filter(item => item.warnings.some(w => w.type === 'cash_mismatch'));
        const totalMismatches = mismatchShifts.length;
        
        let netMismatchValue = 0;
        mismatchShifts.forEach(item => {
            const warning = item.warnings.find(w => w.type === 'cash_mismatch');
            if (warning && warning.diff !== undefined) {
                netMismatchValue += warning.diff;
            }
        });

        const complianceScore = count > 0 ? Math.round((perfectCount / count) * 100) : 100;

        return {
            total: count,
            opening: currentMonthData.filter(item => item.type === 'Opening').length,
            closing: currentMonthData.filter(item => item.type === 'Closing').length,
            perfect: perfectCount,
            mismatches: totalMismatches,
            netMismatch: netMismatchValue,
            complianceScore
        };
    }, [currentMonthData]);

    // --- Derived State: Filtered List for View ---
    const filteredData = useMemo(() => {
        return currentMonthData.filter(item => {
            const typeMatch = filter === 'All' ? true : item.type === filter;
            let dayMatch = true;
            if (selectedDayFilter) {
                dayMatch = format(item.timestamp, 'yyyy-MM-dd') === selectedDayFilter;
            }
            return typeMatch && dayMatch;
        });
    }, [currentMonthData, filter, selectedDayFilter]);

    // Scroll to logs container when clicking calendar day
    const handleDayClick = (dateStr) => {
        if (selectedDayFilter === dateStr) {
            setSelectedDayFilter(null);
        } else {
            setSelectedDayFilter(dateStr);
            setTimeout(() => {
                logsContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 100);
        }
    };

    // --- RENDER ---
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-50 font-sans p-4 md:p-8 transition-colors duration-200">
            <div className="max-w-6xl mx-auto space-y-8">
                
                {/* Header Section */}
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white dark:bg-zinc-900 p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-100 dark:border-zinc-800">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white">Checklist System</h1>
                            <span className="relative flex h-3 w-3">
                                {isAutoSync && (
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                )}
                                <span className={cn(
                                    "relative inline-flex rounded-full h-3 w-3",
                                    isAutoSync ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"
                                )}></span>
                            </span>
                        </div>
                        <p className="text-slate-500 dark:text-zinc-400 text-sm font-medium">
                            ระบบบันทึกความถูกต้อง รายงานเปิด-ปิดร้านประจำวัน และการสรุปข้อมูลแบบ Real-time
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                        {/* Month Select */}
                        {availableMonths.length > 0 && (
                            <div className="relative">
                                <select
                                    value={selectedMonth}
                                    onChange={(e) => {
                                        setSelectedMonth(e.target.value);
                                        setSelectedDayFilter(null);
                                    }}
                                    className="appearance-none pl-4 pr-10 py-2.5 rounded-2xl bg-slate-100 dark:bg-zinc-800 border-0 text-sm font-semibold text-slate-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-lime-500/20 hover:bg-slate-200 dark:hover:bg-zinc-700/80 transition-all cursor-pointer min-w-[160px]"
                                >
                                    {availableMonths.map(m => (
                                        <option key={m} value={m}>
                                            {format(parse(m, 'MMMM yyyy', new Date()), 'MMMM yyyy', { locale: th })}
                                        </option>
                                    ))}
                                </select>
                                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-400">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
                                </div>
                            </div>
                        )}

                        {/* Auto-Sync Toggle Control */}
                        <button
                            onClick={() => setIsAutoSync(!isAutoSync)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all border shadow-sm",
                                isAutoSync 
                                    ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200/50 dark:border-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                                    : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400"
                            )}
                        >
                            {isAutoSync ? <Pause size={13} className="animate-pulse" /> : <Play size={13} />}
                            {isAutoSync ? `สด (Auto ${countdown}s)` : "หยุดอัปเดต"}
                        </button>

                        {/* Refresh Button */}
                        <button
                            onClick={fetchData}
                            disabled={loading}
                            className="p-3 flex items-center justify-center rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-400 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                        >
                            <RefreshCw size={16} className={cn(loading && "animate-spin")} />
                        </button>
                    </div>
                </header>

                {/* Dashboard Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Stat Card 1: Score */}
                    <div className="bg-white dark:bg-zinc-900 p-6 rounded-[2rem] border border-slate-100 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
                        <span className="text-slate-400 dark:text-zinc-400 text-xs font-bold uppercase tracking-wider">ความสมบูรณ์ข้อมูล</span>
                        <div className="flex items-end justify-between mt-4">
                            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white font-mono">
                                {stats.complianceScore}%
                            </h2>
                            <span className={cn(
                                "text-xs font-bold px-2 py-1 rounded-lg",
                                stats.complianceScore > 85 ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400" :
                                stats.complianceScore > 60 ? "bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400" :
                                "bg-rose-50 text-rose-600 dark:bg-rose-950/20 dark:text-rose-400"
                            )}>
                                {stats.complianceScore === 100 ? "สมบูรณ์ดีมาก" : stats.complianceScore > 85 ? "ดีมาก" : "ต้องปรับปรุง"}
                            </span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 dark:bg-zinc-800 rounded-full mt-4 overflow-hidden">
                            <div 
                                className={cn(
                                    "h-full rounded-full transition-all duration-500",
                                    stats.complianceScore > 85 ? "bg-emerald-500" :
                                    stats.complianceScore > 60 ? "bg-amber-500" : "bg-rose-500"
                                )} 
                                style={{ width: `${stats.complianceScore}%` }}
                            />
                        </div>
                    </div>

                    {/* Stat Card 2: Submissions */}
                    <div className="bg-white dark:bg-zinc-900 p-6 rounded-[2rem] border border-slate-100 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
                        <span className="text-slate-400 dark:text-zinc-400 text-xs font-bold uppercase tracking-wider">รายงานทั้งหมด (รอบ/วัน)</span>
                        <div className="mt-4">
                            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white font-mono">
                                {stats.total} <span className="text-sm font-normal text-slate-400">รายการ</span>
                            </h2>
                            <div className="flex gap-4 mt-2 text-xs font-semibold text-slate-400">
                                <span className="flex items-center gap-1"><span className="text-amber-500">☀️</span> เปิด {stats.opening}</span>
                                <span className="flex items-center gap-1"><span className="text-indigo-500">🌙</span> ปิด {stats.closing}</span>
                            </div>
                        </div>
                    </div>

                    {/* Stat Card 3: Discrepancy Count */}
                    <div className="bg-white dark:bg-zinc-900 p-6 rounded-[2rem] border border-slate-100 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
                        <span className="text-slate-400 dark:text-zinc-400 text-xs font-bold uppercase tracking-wider">จำนวนจุดบกพร่อง / ต่างกะ</span>
                        <div className="flex items-end justify-between mt-4">
                            <div>
                                <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white font-mono">
                                    {stats.mismatches} <span className="text-sm font-normal text-slate-400">กะ</span>
                                </h2>
                                <p className="text-xs text-slate-400 mt-1">ยอดเงินเปิด-ปิดข้ามกะไม่ตรง</p>
                            </div>
                            <div className={cn(
                                "p-2 rounded-xl flex items-center justify-center",
                                stats.mismatches > 0 ? "bg-amber-50 dark:bg-amber-950/20 text-amber-500" : "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500"
                            )}>
                                <AlertTriangle size={20} />
                            </div>
                        </div>
                    </div>

                    {/* Stat Card 4: Accum Discrepancy */}
                    <div className="bg-white dark:bg-zinc-900 p-6 rounded-[2rem] border border-slate-100 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
                        <span className="text-slate-400 dark:text-zinc-400 text-xs font-bold uppercase tracking-wider">ผลรวมเงินดรอเวอร์คลาดเคลื่อน</span>
                        <div className="flex items-end justify-between mt-4">
                            <div>
                                <h2 className={cn(
                                    "text-3xl md:text-4xl font-extrabold tracking-tight font-mono",
                                    stats.netMismatch > 0 ? "text-emerald-600 dark:text-emerald-400" :
                                    stats.netMismatch < 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-950 dark:text-white"
                                )}>
                                    {stats.netMismatch > 0 ? `+${stats.netMismatch}` : stats.netMismatch} <span className="text-sm font-normal text-slate-400">THB</span>
                                </h2>
                                <p className="text-xs text-slate-400 mt-1">สะสมสุทธิตามบัญชีเปิดปิด</p>
                            </div>
                            <div className={cn(
                                "p-2 rounded-xl flex items-center justify-center",
                                stats.netMismatch > 0 ? "bg-emerald-50 text-emerald-500" :
                                stats.netMismatch < 0 ? "bg-rose-50 text-rose-500" : "bg-slate-50 dark:bg-zinc-800 text-slate-400"
                            )}>
                                {stats.netMismatch > 0 ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Calendar View Grid */}
                <div className="bg-white dark:bg-zinc-900 p-6 md:p-8 rounded-[2rem] border border-slate-100 dark:border-zinc-800 shadow-sm">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                        <div>
                            <h2 className="text-xl font-bold text-slate-950 dark:text-white">ปฏิทินความถูกต้อง (Monthly Activity)</h2>
                            <p className="text-xs text-slate-400 mt-0.5">กดที่วันที่เพื่อดูรายละเอียด หรือกดซ้ำเพื่อยกเลิกตัวกรอง</p>
                        </div>
                        
                        {selectedDayFilter && (
                            <button
                                onClick={() => setSelectedDayFilter(null)}
                                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-xs font-semibold text-slate-600 dark:text-zinc-300 transition-all self-start md:self-auto"
                            >
                                <X size={12} />
                                ล้างตัวกรองวันที่: {format(parse(selectedDayFilter, 'yyyy-MM-dd', new Date()), 'd MMM yyyy', { locale: th })}
                            </button>
                        )}
                    </div>

                    {/* Weekday headers */}
                    <div className="grid grid-cols-7 gap-2 mb-2 text-center text-xs font-bold text-slate-400 dark:text-zinc-500">
                        {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map(day => (
                            <div key={day} className="py-2">{day}</div>
                        ))}
                    </div>

                    {/* Days grid */}
                    <div className="grid grid-cols-7 gap-2">
                        {/* Padding cells */}
                        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                            <div key={`pad-${i}`} className="aspect-square rounded-2xl bg-slate-50/50 dark:bg-zinc-900/50 border border-dashed border-slate-100 dark:border-zinc-800/40" />
                        ))}

                        {/* Day cells */}
                        {daysInMonth.map((day, idx) => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const status = dayStatusMap[dateStr];
                            const isToday = format(new Date(), 'yyyy-MM-dd') === dateStr;
                            const isSelected = selectedDayFilter === dateStr;

                            // Determine status styles for dots
                            const getDotClass = (entry) => {
                                if (!entry) return "bg-slate-200 dark:bg-zinc-700";
                                return entry.hasDiscrepancies 
                                    ? "bg-amber-500 ring-2 ring-amber-500/20" 
                                    : "bg-emerald-500 ring-2 ring-emerald-500/20";
                            };

                            return (
                                <div
                                    key={dateStr}
                                    onClick={() => handleDayClick(dateStr)}
                                    className={cn(
                                        "aspect-square rounded-2xl p-2 flex flex-col justify-between border cursor-pointer transition-all relative overflow-hidden group select-none",
                                        isSelected 
                                            ? "bg-lime-500/10 border-lime-500 dark:border-lime-500/60 shadow-sm"
                                            : isToday
                                                ? "bg-slate-50 dark:bg-zinc-800 border-slate-300 dark:border-zinc-700"
                                                : "bg-white dark:bg-zinc-900 border-slate-100 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700"
                                    )}
                                >
                                    {/* Day Number */}
                                    <div className="flex justify-between items-start">
                                        <span className={cn(
                                            "text-xs md:text-sm font-bold",
                                            isToday ? "text-lime-600 dark:text-lime-400 font-extrabold" : "text-slate-700 dark:text-zinc-300",
                                            isSelected && "text-lime-700 dark:text-lime-400"
                                        )}>
                                            {day.getDate()}
                                        </span>
                                        {isToday && (
                                            <span className="w-1.5 h-1.5 rounded-full bg-lime-500 animate-pulse" />
                                        )}
                                    </div>

                                    {/* Shift dots */}
                                    <div className="flex justify-center gap-1.5 mt-auto">
                                        {/* Opening Dot */}
                                        <div 
                                            title={status?.opening ? `เปิดกะ: ${status.opening.staffName}` : "ไม่มีข้อมูลเปิดร้าน"} 
                                            className={cn("w-2 h-2 rounded-full", getDotClass(status?.opening))}
                                        />
                                        {/* Closing Dot */}
                                        <div 
                                            title={status?.closing ? `ปิดกะ: ${status.closing.staffName}` : "ไม่มีข้อมูลปิดร้าน"} 
                                            className={cn("w-2 h-2 rounded-full", getDotClass(status?.closing))}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Content Section: Lists & Logs */}
                <div ref={logsContainerRef} className="space-y-6">
                    {/* Filter and Section Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-zinc-800 pb-5">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-950 dark:text-white">
                                {selectedDayFilter 
                                    ? `บันทึกรายการสำหรับวันที่ ${format(parse(selectedDayFilter, 'yyyy-MM-dd', new Date()), 'd MMMM yyyy', { locale: th })}`
                                    : "บันทึกการตรวจงานทั้งหมด"
                                }
                            </h2>
                            <p className="text-slate-400 text-xs mt-0.5">
                                กำลังแสดง {filteredData.length} รายการ จากทั้งหมดในเดือน
                            </p>
                        </div>

                        {/* Filter Tabs */}
                        <div className="flex p-1 bg-slate-100 dark:bg-zinc-800 rounded-xl max-w-fit">
                            {['All', 'Opening', 'Closing'].map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={cn(
                                        "px-4 py-2 rounded-lg text-xs font-bold transition-all ease-out duration-200",
                                        filter === f
                                            ? "bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                                            : "text-slate-400 hover:text-slate-600 dark:text-zinc-400 dark:hover:text-zinc-200"
                                    )}
                                >
                                    {f === 'All' ? 'ทั้งหมด' : f === 'Opening' ? '☀️ เปิดร้าน' : '🌙 ปิดร้าน'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Loader */}
                    {loading && data.length === 0 ? (
                        <div className="space-y-6">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="w-full h-56 bg-white dark:bg-zinc-900 rounded-[2rem] animate-pulse border border-slate-100 dark:border-zinc-800 shadow-sm" />
                            ))}
                        </div>
                    ) : filteredData.length === 0 ? (
                        <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-12 text-center border border-slate-100 dark:border-zinc-800 shadow-sm flex flex-col items-center justify-center">
                            <div className="p-4 bg-slate-50 dark:bg-zinc-800 rounded-full text-slate-400 mb-4">
                                <FileText size={32} />
                            </div>
                            <h3 className="text-lg font-bold text-slate-800 dark:text-zinc-200">ไม่พบรายงานบันทึก</h3>
                            <p className="text-slate-400 text-sm mt-1 max-w-xs">
                                ไม่มีรายงานที่ตรงตามเงื่อนไขในขณะนี้ ลองเลือกเงื่อนไขหรือวันที่อื่น
                            </p>
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
                                        className={cn(
                                            "bg-white dark:bg-zinc-900 rounded-[2rem] p-6 md:p-8 shadow-sm border transition-all overflow-hidden relative group",
                                            item.hasDiscrepancies
                                                ? "border-amber-200/60 dark:border-amber-900/30"
                                                : "border-slate-100 dark:border-zinc-800/80"
                                        )}
                                    >
                                        {/* Status Accent Strip */}
                                        <div className={cn(
                                            "absolute left-0 top-0 bottom-0 w-1.5 transition-colors duration-300",
                                            item.type === 'Opening' 
                                                ? "bg-amber-400" 
                                                : "bg-indigo-500"
                                        )} />

                                        <div className="pl-2 sm:pl-4">
                                            {/* Top Metadata Header */}
                                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-6">
                                                {/* Left Info Column */}
                                                <div className="space-y-2">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className={cn(
                                                            "text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-lg",
                                                            item.type === 'Opening'
                                                                ? "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400"
                                                                : "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-400"
                                                        )}>
                                                            {item.type === 'Opening' ? '☀️ OPENING (เปิดกะ)' : '🌙 CLOSING (ปิดกะ)'}
                                                        </span>
                                                        <span className="text-slate-400 dark:text-zinc-500 text-xs font-semibold flex items-center gap-1">
                                                            <Clock size={12} />
                                                            {format(item.timestamp, "d MMMM yyyy • HH:mm", { locale: th })} น.
                                                        </span>
                                                    </div>
                                                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                                        <User size={18} className="text-slate-400" />
                                                        {item.staffName}
                                                    </h3>
                                                </div>

                                                {/* Right Cash Badge */}
                                                {item.cashStr && (
                                                    <div className="flex flex-col md:items-end bg-slate-50 dark:bg-zinc-800/50 p-4 rounded-2xl border border-slate-100 dark:border-zinc-800 min-w-[150px]">
                                                        <span className="text-[10px] font-extrabold text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-1">
                                                            CASH IN DRAWER
                                                        </span>
                                                        <span className="font-mono text-xl font-black text-slate-800 dark:text-white tabular-nums">
                                                            {item.cash !== null ? item.cash.toLocaleString() : item.cashStr}{' '}
                                                            <span className="text-xs font-bold text-slate-400 dark:text-zinc-500">THB</span>
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Validation Warnings Panel (if any) */}
                                            {item.warnings.length > 0 && (
                                                <div className="mb-6 p-4 bg-amber-50/50 dark:bg-amber-950/10 rounded-2xl border border-amber-200/50 dark:border-amber-900/30 space-y-2">
                                                    <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400 font-bold text-sm">
                                                        <AlertCircle size={16} />
                                                        <span>พบความผิดปกติที่ต้องตรวจสอบ ({item.warnings.length} จุด)</span>
                                                    </div>
                                                    <ul className="space-y-1 pl-6 list-disc text-xs text-amber-700/90 dark:text-amber-400/80 leading-relaxed font-semibold">
                                                        {item.warnings.map((w, idx) => (
                                                            <li key={idx}>
                                                                {w.message}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            {/* Main Content Sections */}
                                            <div className="grid md:grid-cols-2 gap-6 mb-6">
                                                {/* Left Column: Tasks Completed */}
                                                <div className="bg-slate-50/80 dark:bg-zinc-800/30 rounded-2xl p-5 border border-slate-100 dark:border-zinc-800/40">
                                                    <div className="flex items-center justify-between mb-4 border-b border-slate-200/50 dark:border-zinc-800 pb-2">
                                                        <span className="text-xs font-extrabold text-slate-400 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                                                            <CheckSquare size={13} className="text-slate-400" />
                                                            รายการภารกิจที่ทำเสร็จ
                                                        </span>
                                                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400">
                                                            {item.tasks.length} สำเร็จ
                                                        </span>
                                                    </div>

                                                    {item.tasks.length > 0 ? (
                                                        <div className="space-y-2.5 max-h-[220px] overflow-y-auto custom-scrollbar pr-2">
                                                            {item.tasks.map((taskText, idx) => (
                                                                <div key={idx} className="flex items-start gap-2.5">
                                                                    <div className="mt-1 w-3.5 h-3.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center flex-shrink-0 border border-emerald-200/20">
                                                                        <Check size={10} className="text-emerald-500 dark:text-emerald-400" strokeWidth={3} />
                                                                    </div>
                                                                    <span className="text-slate-700 dark:text-zinc-300 text-xs leading-relaxed font-semibold">
                                                                        {taskText}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="text-slate-400 dark:text-zinc-500 text-xs italic py-2">
                                                            ไม่มีการบันทึกงานภารกิจหลัก
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Right Column: General Notes & Metadata Fields */}
                                                <div className="flex flex-col justify-between gap-4">
                                                    <div className="bg-slate-50/80 dark:bg-zinc-800/30 rounded-2xl p-5 border border-slate-100 dark:border-zinc-800/40 flex-1">
                                                        <span className="text-xs font-extrabold text-slate-400 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                                                            <FileText size={13} />
                                                            บันทึกเพิ่มเติม / หมายเหตุ
                                                        </span>
                                                        {item.note ? (
                                                            <p className="text-slate-700 dark:text-zinc-300 text-xs leading-relaxed font-semibold bg-white dark:bg-zinc-900 p-3.5 rounded-xl border border-slate-100 dark:border-zinc-800/60">
                                                                {item.note}
                                                            </p>
                                                        ) : (
                                                            <p className="text-slate-400 dark:text-zinc-500 text-xs italic py-2">
                                                                ไม่มีหมายเหตุเพิ่มเติม
                                                            </p>
                                                        )}
                                                    </div>

                                                    {/* Other form fields if present (e.g. coffee clean) */}
                                                    {(item.raw["[ เวรล้างถังน้ำเครื่องกาแฟ - ทุก 2 วัน]"] || item.raw["ใส่ชื่อผู้ล้าง ถังน้ำกาแฟ **"] || item.raw["จุดที่ไม่เรียบร้อย (จากกะกลางคืน ) เพื่อปรับปรุง ไม่มีให้เว้นว่างเอาไว้ *"]) && (
                                                        <div className="bg-slate-50/80 dark:bg-zinc-800/30 rounded-2xl p-4 border border-slate-100 dark:border-zinc-800/40 text-[11px] space-y-2">
                                                            {item.raw["ใส่ชื่อผู้ล้าง ถังน้ำกาแฟ **"] && (
                                                                <div className="flex justify-between">
                                                                    <span className="text-slate-400 font-bold">เวรล้างถังน้ำกาแฟ:</span>
                                                                    <span className="text-slate-700 dark:text-zinc-300 font-semibold">{item.raw["ใส่ชื่อผู้ล้าง ถังน้ำกาแฟ **"]}</span>
                                                                </div>
                                                            )}
                                                            {item.raw["จุดที่ไม่เรียบร้อย (จากกะกลางคืน ) เพื่อปรับปรุง ไม่มีให้เว้นว่างเอาไว้ *"] && (
                                                                <div className="flex flex-col gap-1">
                                                                    <span className="text-slate-400 font-bold">จุดบกพร่องจากกะก่อนหน้า:</span>
                                                                    <span className="text-slate-700 dark:text-zinc-300 font-semibold bg-amber-50 dark:bg-amber-950/20 p-2 rounded border border-amber-100/30">
                                                                        {item.raw["จุดที่ไม่เรียบร้อย (จากกะกลางคืน ) เพื่อปรับปรุง ไม่มีให้เว้นว่างเอาไว้ *"]}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Evidence Photo Gallery */}
                                            {item.photos.length > 0 && (
                                                <div className="space-y-3">
                                                    <span className="text-xs font-extrabold text-slate-400 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                                                        <Camera size={13} />
                                                        ภาพถ่ายหลักฐานประกอบ ({item.photos.length} รูป)
                                                    </span>
                                                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                                                        {item.photos.map((photo, i) => (
                                                            <div
                                                                key={i}
                                                                onClick={() => setSelectedImage(photo.full)}
                                                                className="aspect-square rounded-2xl overflow-hidden cursor-pointer relative group border border-slate-100 dark:border-zinc-800 shadow-sm hover:shadow-md hover:scale-105 active:scale-95 transition-all duration-300 bg-slate-100 dark:bg-zinc-800"
                                                            >
                                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors z-10" />
                                                                <img
                                                                    src={photo.thumbnail}
                                                                    alt="Checklist Evidence"
                                                                    className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500"
                                                                    onError={(e) => {
                                                                        e.target.style.display = 'none';
                                                                    }}
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            </div>

            {/* Lightbox / Google Drive IFrame Viewer */}
            <AnimatePresence>
                {selectedImage && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setSelectedImage(null)}
                        className="fixed inset-0 z-[100] bg-zinc-950/95 backdrop-blur-md flex items-center justify-center p-4 md:p-8"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full h-full max-w-5xl bg-black rounded-3xl overflow-hidden shadow-2xl relative border border-white/10"
                        >
                            {/* IFrame or Image Element */}
                            {selectedImage.includes('drive.google.com') ? (
                                <iframe
                                    src={selectedImage}
                                    className="w-full h-full border-0 bg-zinc-900"
                                    allow="autoplay"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-zinc-950 p-2">
                                    <img 
                                        src={selectedImage} 
                                        alt="Evidence Full" 
                                        className="max-w-full max-h-full object-contain rounded-2xl" 
                                    />
                                </div>
                            )}

                            {/* Close button */}
                            <button
                                onClick={() => setSelectedImage(null)}
                                className="absolute top-6 right-6 w-11 h-11 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center backdrop-blur-md border border-white/15 transition-all active:scale-90"
                            >
                                <X size={20} />
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}