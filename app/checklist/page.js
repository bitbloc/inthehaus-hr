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
        <div className="min-h-screen bg-rams-bg text-rams-ink font-sans p-4 md:p-8 font-feature-settings-['ss01'] pb-32 transition-colors">
            <div className="max-w-6xl mx-auto space-y-6">
                
                {/* Header Section */}
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-rams-panel p-6 border border-rams-rule-light rounded-[1.8rem] shadow-none">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <img src="/logo.png" className="h-8 w-auto object-contain mr-1" alt="Logo" onError={(e) => e.target.style.display = 'none'} />
                            <h1 className="text-2xl font-mono font-bold tracking-tight text-rams-ink uppercase">Checklist System</h1>
                            <span className="relative flex h-2.5 w-2.5">
                                {isAutoSync && (
                                    <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-rams-green opacity-75"></span>
                                )}
                                <span className={cn(
                                    "relative inline-flex rounded-full h-2.5 w-2.5 border border-rams-rule-light",
                                    isAutoSync ? "bg-rams-green" : "bg-rams-ink-muted"
                                )}></span>
                            </span>
                        </div>
                        <p className="text-rams-ink-muted text-xs font-semibold">
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
                                    className="appearance-none pl-3 pr-8 py-2 rounded-sm bg-rams-bg border border-rams-rule-light text-xs font-mono font-bold text-rams-ink focus:outline-none focus:border-rams-rule transition-all cursor-pointer min-w-[150px]"
                                >
                                    {availableMonths.map(m => (
                                        <option key={m} value={m}>
                                            {format(parse(m, 'MMMM yyyy', new Date()), 'MMMM yyyy', { locale: th }).toUpperCase()}
                                        </option>
                                    ))}
                                </select>
                                <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-rams-ink-muted">
                                    <ChevronRight size={14} className="rotate-90" />
                                </div>
                            </div>
                        )}

                        {/* Auto-Sync Toggle Control */}
                        <button
                            onClick={() => setIsAutoSync(!isAutoSync)}
                            className={cn(
                                "flex items-center gap-2 px-3 py-2 rounded-sm text-[10px] font-mono font-bold uppercase transition-all border cursor-pointer select-none active:translate-y-[1px]",
                                isAutoSync 
                                    ? "bg-rams-green/10 text-rams-green border-rams-green/30"
                                    : "bg-rams-bg border-rams-rule-light text-rams-ink-muted hover:text-rams-ink"
                            )}
                        >
                            {isAutoSync ? <Pause size={11} className="animate-pulse" /> : <Play size={11} />}
                            {isAutoSync ? `LIVE (Auto ${countdown}s)` : "SYNC OFF"}
                        </button>

                        {/* Refresh Button */}
                        <button
                            onClick={fetchData}
                            disabled={loading}
                            className="p-2 flex items-center justify-center rounded-sm bg-rams-bg border border-rams-rule-light hover:bg-rams-panel/50 hover:text-rams-ink text-rams-ink-muted transition-all active:translate-y-[1px] cursor-pointer disabled:opacity-50"
                        >
                            <RefreshCw size={14} className={cn(loading && "animate-spin")} />
                        </button>
                    </div>
                </header>

                {/* Dashboard Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Stat Card 1: Score */}
                    <div className="bg-rams-panel p-5 border border-rams-rule-light rounded-[1.8rem] shadow-none flex flex-col justify-between">
                        <span className="text-rams-ink-muted text-[9px] font-mono font-bold tracking-widest uppercase block mb-3">ความสมบูรณ์ข้อมูล</span>
                        <div className="flex items-end justify-between">
                            <h2 className="text-3xl font-mono font-black tracking-tight text-rams-ink">
                                {stats.complianceScore}%
                            </h2>
                            <span className={cn(
                                "text-[9px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-lg border",
                                stats.complianceScore > 85 ? "bg-rams-green/10 text-rams-green border-rams-green/30" :
                                stats.complianceScore > 60 ? "bg-rams-amber/10 text-rams-amber border-rams-amber/30" :
                                "bg-rams-red/10 text-rams-red border-rams-red/30"
                            )}>
                                {stats.complianceScore === 100 ? "EXCELLENT" : stats.complianceScore > 85 ? "GOOD" : "WARNING"}
                            </span>
                        </div>
                        <div className="h-2 w-full bg-rams-bg border border-rams-rule-light rounded-lg mt-3.5 overflow-hidden">
                            <div 
                                className={cn(
                                    "h-full transition-all duration-500",
                                    stats.complianceScore > 85 ? "bg-rams-green" :
                                    stats.complianceScore > 60 ? "bg-rams-amber" : "bg-rams-red"
                                )} 
                                style={{ width: `${stats.complianceScore}%` }}
                            />
                        </div>
                    </div>

                    {/* Stat Card 2: Submissions */}
                    <div className="bg-rams-panel p-5 border border-rams-rule-light rounded-[1.8rem] shadow-none flex flex-col justify-between">
                        <span className="text-rams-ink-muted text-[9px] font-mono font-bold tracking-widest uppercase block mb-3">รายงานทั้งหมด</span>
                        <div>
                            <h2 className="text-3xl font-mono font-black tracking-tight text-rams-ink">
                                {stats.total} <span className="text-xs font-normal text-rams-ink-muted">REPORTS</span>
                            </h2>
                            <div className="flex gap-3 mt-3 text-[9px] font-mono font-bold tracking-wider text-rams-ink-muted uppercase">
                                <span className="flex items-center gap-1 text-rams-orange">☀️ OPEN: {stats.opening}</span>
                                <span className="flex items-center gap-1 text-rams-ink">🌙 CLOSE: {stats.closing}</span>
                            </div>
                        </div>
                    </div>

                    {/* Stat Card 3: Discrepancy Count */}
                    <div className="bg-rams-panel p-5 border border-rams-rule-light rounded-[1.8rem] shadow-none flex flex-col justify-between">
                        <span className="text-rams-ink-muted text-[9px] font-mono font-bold tracking-widest uppercase block mb-3">จุดบกพร่อง / ต่างกะ</span>
                        <div className="flex items-end justify-between">
                            <div>
                                <h2 className="text-3xl font-mono font-black tracking-tight text-rams-ink">
                                    {stats.mismatches} <span className="text-xs font-normal text-rams-ink-muted">SHIFTS</span>
                                </h2>
                                <p className="text-[9px] font-mono text-rams-ink-muted uppercase tracking-wider mt-1.5">ยอดข้ามกะไม่ตรงกัน</p>
                            </div>
                            <div className={cn(
                                "p-2 rounded-sm border flex items-center justify-center",
                                stats.mismatches > 0 ? "bg-rams-amber/10 border-rams-amber/30 text-rams-amber" : "bg-rams-green/10 border-rams-green/30 text-rams-green"
                            )}>
                                <AlertTriangle size={16} />
                            </div>
                        </div>
                    </div>

                    {/* Stat Card 4: Accum Discrepancy */}
                    <div className="bg-rams-panel p-5 border border-rams-rule-light rounded-[1.8rem] shadow-none flex flex-col justify-between">
                        <span className="text-rams-ink-muted text-[9px] font-mono font-bold tracking-widest uppercase block mb-3">สะสมเงินคลาดเคลื่อน</span>
                        <div className="flex items-end justify-between">
                            <div>
                                <h2 className={cn(
                                    "text-3xl font-mono font-black tracking-tight",
                                    stats.netMismatch > 0 ? "text-rams-green" :
                                    stats.netMismatch < 0 ? "text-rams-red" : "text-rams-ink"
                                )}>
                                    {stats.netMismatch > 0 ? `+${stats.netMismatch}` : stats.netMismatch} <span className="text-xs font-normal text-rams-ink-muted">THB</span>
                                </h2>
                                <p className="text-[9px] font-mono text-rams-ink-muted uppercase tracking-wider mt-1.5">ดรอเวอร์ดิฟสะสม</p>
                            </div>
                            <div className={cn(
                                "p-2 rounded-xl border flex items-center justify-center",
                                stats.netMismatch > 0 ? "bg-rams-green/10 border-rams-green/30 text-rams-green" :
                                stats.netMismatch < 0 ? "bg-rams-red/10 border-rams-red/30 text-rams-red" : "bg-rams-bg border-rams-rule-light text-rams-ink-muted"
                            )}>
                                {stats.netMismatch > 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Calendar View Grid */}
                <div className="bg-rams-panel p-6 border border-rams-rule-light rounded-[1.8rem] shadow-none">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                        <div>
                            <h2 className="text-lg font-mono font-bold text-rams-ink uppercase tracking-wider">ปฏิทินความถูกต้อง (Monthly Activity)</h2>
                            <p className="text-[10px] font-mono text-rams-ink-muted uppercase tracking-wider mt-0.5">กดเลือกวันที่ต้องการตรวจสอบรายการบันทึก หรือกดซ้ำเพื่อยกเลิกตัวกรอง</p>
                        </div>
                        
                        {selectedDayFilter && (
                            <button
                                onClick={() => setSelectedDayFilter(null)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-rams-bg border border-rams-rule-light hover:bg-rams-panel/50 hover:text-rams-ink text-xs font-mono font-bold text-rams-ink transition-all self-start md:self-auto cursor-pointer"
                            >
                                <X size={12} />
                                CLEAR FILTER: {format(parse(selectedDayFilter, 'yyyy-MM-dd', new Date()), 'd MMM yyyy', { locale: th }).toUpperCase()}
                            </button>
                        )}
                    </div>

                    {/* Weekday headers */}
                    <div className="grid grid-cols-7 gap-2 mb-2 text-center text-[10px] font-mono font-extrabold uppercase text-rams-ink-muted border-b border-rams-rule-light pb-2">
                        {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map(day => (
                            <div key={day} className="py-1">{day}</div>
                        ))}
                    </div>

                    {/* Days grid */}
                    <div className="grid grid-cols-7 gap-2">
                        {/* Padding cells */}
                        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                            <div key={`pad-${i}`} className="aspect-square rounded-sm bg-rams-bg/30 border border-dashed border-rams-rule-light/40" />
                        ))}

                        {/* Day cells */}
                        {daysInMonth.map((day, idx) => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const status = dayStatusMap[dateStr];
                            const isToday = format(new Date(), 'yyyy-MM-dd') === dateStr;
                            const isSelected = selectedDayFilter === dateStr;

                            // Determine status styles for dots
                            const getDotClass = (entry) => {
                                if (!entry) return "bg-rams-bg border border-rams-rule-light/50";
                                return entry.hasDiscrepancies 
                                    ? "bg-rams-amber border border-rams-amber" 
                                    : "bg-rams-green border border-rams-green";
                            };

                            return (
                                <div
                                    key={dateStr}
                                    onClick={() => handleDayClick(dateStr)}
                                    className={cn(
                                        "aspect-square rounded-sm p-2 flex flex-col justify-between border cursor-pointer transition-all relative overflow-hidden group select-none",
                                        isSelected 
                                            ? "bg-rams-orange/10 border-rams-orange"
                                            : isToday
                                                ? "bg-rams-bg border-rams-rule"
                                                : "bg-rams-panel border-rams-rule-light hover:border-rams-rule"
                                    )}
                                >
                                    {/* Day Number */}
                                    <div className="flex justify-between items-start">
                                        <span className={cn(
                                            "text-xs font-mono font-bold",
                                            isToday ? "text-rams-orange font-black" : "text-rams-ink",
                                            isSelected && "text-rams-orange"
                                        )}>
                                            {day.getDate()}
                                        </span>
                                        {isToday && (
                                            <span className="w-1.5 h-1.5 rounded-full bg-rams-orange animate-pulse" />
                                        )}
                                    </div>

                                    {/* Shift dots */}
                                    <div className="flex justify-center gap-1 mt-auto">
                                        {/* Opening Dot */}
                                        <div 
                                            title={status?.opening ? `เปิดกะ: ${status.opening.staffName}` : "ไม่มีข้อมูลเปิดร้าน"} 
                                            className={cn("w-1.5 h-1.5 rounded-full", getDotClass(status?.opening))}
                                        />
                                        {/* Closing Dot */}
                                        <div 
                                            title={status?.closing ? `ปิดกะ: ${status.closing.staffName}` : "ไม่มีข้อมูลปิดร้าน"} 
                                            className={cn("w-1.5 h-1.5 rounded-full", getDotClass(status?.closing))}
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
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-rams-rule-light pb-5">
                        <div className="space-y-0.5">
                            <h2 className="text-xl font-mono font-bold text-rams-ink uppercase tracking-wider">
                                {selectedDayFilter 
                                    ? `บันทึกสำหรับวันที่ ${format(parse(selectedDayFilter, 'yyyy-MM-dd', new Date()), 'd MMMM yyyy', { locale: th }).toUpperCase()}`
                                    : "บันทึกการตรวจงานทั้งหมด"
                                }
                            </h2>
                            <p className="text-rams-ink-muted text-[10px] font-mono uppercase tracking-wider">
                                SHOWING {filteredData.length} OF {currentMonthData.length} MONTHLY ENTRIES
                            </p>
                        </div>

                        {/* Filter Tabs */}
                        <div className="flex p-0.5 bg-rams-bg border border-rams-rule-light rounded-xl max-w-fit">
                            {['All', 'Opening', 'Closing'].map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={cn(
                                        "px-3.5 py-1.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer select-none",
                                        filter === f
                                            ? "bg-rams-ink text-rams-panel border border-rams-rule"
                                            : "text-rams-ink-muted hover:text-rams-ink"
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
                                <div key={i} className="w-full h-56 bg-rams-panel rounded-sm animate-pulse border border-rams-rule-light shadow-none" />
                            ))}
                        </div>
                    ) : filteredData.length === 0 ? (
                        <div className="bg-rams-panel rounded-sm p-12 text-center border border-rams-rule-light shadow-none flex flex-col items-center justify-center">
                            <div className="p-3 bg-rams-bg border border-rams-rule-light text-rams-ink-muted mb-4 rounded-sm">
                                <FileText size={24} />
                            </div>
                            <h3 className="text-sm font-mono font-bold text-rams-ink uppercase tracking-wider">ไม่พบรายงานบันทึก</h3>
                            <p className="text-rams-ink-muted text-xs font-mono uppercase tracking-wider mt-1 max-w-xs leading-relaxed">
                                NO ENTRIES COMPLY WITH THE APPLIED DATE OR SHIFT FILTERS
                            </p>
                        </div>
                    ) : (
                        <div className="grid gap-6">
                            <AnimatePresence mode="popLayout">
                                {filteredData.map((item) => (
                                    <motion.div
                                        key={item.id}
                                        layout
                                        initial={{ opacity: 0, scale: 0.99 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.98 }}
                                        transition={{ duration: 0.15 }}
                                        className={cn(
                                            "bg-rams-panel rounded-[1.8rem] p-6 md:p-8 shadow-none border transition-all overflow-hidden relative group",
                                            item.hasDiscrepancies
                                                ? "border-rams-amber"
                                                : "border-rams-rule-light"
                                        )}
                                    >
                                        {/* Status Accent Strip */}
                                        <div className={cn(
                                            "absolute left-0 top-0 bottom-0 w-1 transition-colors duration-300",
                                            item.type === 'Opening' 
                                                ? "bg-rams-orange" 
                                                : "bg-rams-ink"
                                        )} />

                                        <div className="pl-2">
                                            {/* Top Metadata Header */}
                                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-6">
                                                {/* Left Info Column */}
                                                <div className="space-y-2">
                                                    <div className="flex flex-wrap items-center gap-3">
                                                        <span className={cn(
                                                            "text-[9px] font-mono font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-sm border",
                                                            item.type === 'Opening'
                                                                ? "bg-rams-orange/10 text-rams-orange border-rams-orange/30"
                                                                : "bg-rams-ink text-rams-panel border border-rams-rule"
                                                        )}>
                                                            {item.type === 'Opening' ? '☀️ OPENING' : '🌙 CLOSING'}
                                                        </span>
                                                        <span className="text-rams-ink-muted text-xs font-mono font-semibold flex items-center gap-1">
                                                            <Clock size={12} />
                                                            {format(item.timestamp, "d MMMM yyyy • HH:mm", { locale: th })} น.
                                                        </span>
                                                    </div>
                                                    <h3 className="text-2xl font-mono font-black text-rams-ink flex items-center gap-2">
                                                        <User size={18} className="text-rams-ink-muted" />
                                                        {item.staffName.toUpperCase()}
                                                    </h3>
                                                </div>

                                                {/* Right Cash Badge */}
                                                {item.cashStr && (
                                                    <div className="flex flex-col md:items-end bg-rams-bg p-3.5 rounded-sm border border-rams-rule-light min-w-[140px] shadow-none">
                                                        <span className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1.5">
                                                            CASH IN DRAWER
                                                        </span>
                                                        <span className="font-mono text-xl font-black text-rams-ink tabular-nums">
                                                            {item.cash !== null ? item.cash.toLocaleString() : item.cashStr}{' '}
                                                            <span className="text-xs font-bold text-rams-ink-muted">THB</span>
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Validation Warnings Panel (if any) */}
                                            {item.warnings.length > 0 && (
                                                <div className="mb-6 p-4 bg-rams-amber/5 rounded-sm border border-rams-amber/35 space-y-2">
                                                    <div className="flex items-center gap-2 text-rams-amber font-mono font-bold text-xs uppercase tracking-wider">
                                                        <AlertCircle size={14} />
                                                        <span>พบจุดที่ต้องตรวจสอบ ({item.warnings.length} รายการ)</span>
                                                    </div>
                                                    <ul className="space-y-1 pl-5 list-disc text-xs text-rams-ink-muted leading-relaxed font-mono font-semibold">
                                                        {item.warnings.map((w, idx) => (
                                                            <li key={idx} className="marker:text-rams-amber">
                                                                {w.message}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            {/* Main Content Sections */}
                                            <div className="grid md:grid-cols-2 gap-6 mb-6">
                                                {/* Left Column: Tasks Completed */}
                                                <div className="bg-rams-bg rounded-sm p-4 border border-rams-rule-light">
                                                    <div className="flex items-center justify-between mb-4 border-b border-rams-rule-light/60 pb-2">
                                                        <span className="text-[10px] font-mono font-bold text-rams-ink-muted uppercase tracking-wider flex items-center gap-1.5">
                                                            <CheckSquare size={12} className="text-rams-ink-muted" />
                                                            รายการภารกิจที่ทำเสร็จ
                                                        </span>
                                                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-sm bg-rams-green/10 text-rams-green border border-rams-green/20">
                                                            {item.tasks.length} COMPLETED
                                                        </span>
                                                    </div>

                                                    {item.tasks.length > 0 ? (
                                                        <div className="space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                                                            {item.tasks.map((taskText, idx) => (
                                                                <div key={idx} className="flex items-start gap-2.5">
                                                                    <div className="mt-1 w-3 h-3 rounded-full bg-rams-green/10 flex items-center justify-center flex-shrink-0 border border-rams-green/20">
                                                                        <Check size={8} className="text-rams-green" strokeWidth={3} />
                                                                    </div>
                                                                    <span className="text-rams-ink text-xs leading-relaxed font-mono font-semibold">
                                                                        {taskText}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="text-rams-ink-muted font-mono text-xs italic py-1">
                                                            ไม่มีการบันทึกงานภารกิจหลัก
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Right Column: General Notes & Metadata Fields */}
                                                <div className="flex flex-col justify-between gap-4">
                                                    <div className="bg-rams-bg rounded-sm p-4 border border-rams-rule-light flex-1">
                                                        <span className="text-[10px] font-mono font-bold text-rams-ink-muted uppercase tracking-wider flex items-center gap-1.5 mb-3">
                                                            <FileText size={12} className="text-rams-ink-muted" />
                                                            บันทึกเพิ่มเติม / หมายเหตุ
                                                        </span>
                                                        {item.note ? (
                                                            <p className="text-rams-ink text-xs leading-relaxed font-mono font-semibold bg-rams-panel p-3 rounded-sm border border-rams-rule-light">
                                                                {item.note}
                                                            </p>
                                                        ) : (
                                                            <p className="text-rams-ink-muted font-mono text-xs italic py-1">
                                                                ไม่มีหมายเหตุเพิ่มเติม
                                                            </p>
                                                        )}
                                                    </div>

                                                    {/* Other form fields if present (e.g. coffee clean) */}
                                                    {(item.raw["[ เวรล้างถังน้ำเครื่องกาแฟ - ทุก 2 วัน]"] || item.raw["ใส่ชื่อผู้ล้าง ถังน้ำกาแฟ **"] || item.raw["จุดที่ไม่เรียบร้อย (จากกะกลางคืน ) เพื่อปรับปรุง ไม่มีให้เว้นว่างเอาไว้ *"]) && (
                                                        <div className="bg-rams-bg rounded-sm p-3.5 border border-rams-rule-light text-[10px] font-mono space-y-2">
                                                            {item.raw["ใส่ชื่อผู้ล้าง ถังน้ำกาแฟ **"] && (
                                                                <div className="flex justify-between">
                                                                    <span className="text-rams-ink-muted font-bold">เวรล้างถังน้ำกาแฟ:</span>
                                                                    <span className="text-rams-ink font-semibold">{item.raw["ใส่ชื่อผู้ล้าง ถังน้ำกาแฟ **"].toUpperCase()}</span>
                                                                </div>
                                                            )}
                                                            {item.raw["จุดที่ไม่เรียบร้อย (จากกะกลางคืน ) เพื่อปรับปรุง ไม่มีให้เว้นว่างเอาไว้ *"] && (
                                                                <div className="flex flex-col gap-1.5 pt-1.5 border-t border-rams-rule-light/40">
                                                                    <span className="text-rams-ink-muted font-bold">จุดบกพร่องจากกะก่อนหน้า:</span>
                                                                    <span className="text-rams-ink font-semibold bg-rams-amber/5 p-2 rounded-sm border border-rams-amber/25">
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
                                                    <span className="text-[10px] font-mono font-bold text-rams-ink-muted uppercase tracking-wider flex items-center gap-1.5">
                                                        <Camera size={12} />
                                                        ภาพถ่ายหลักฐานประกอบ ({item.photos.length} รูป)
                                                    </span>
                                                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                                                        {item.photos.map((photo, i) => (
                                                            <div
                                                                key={i}
                                                                onClick={() => setSelectedImage(photo.full)}
                                                                className="aspect-square rounded-sm overflow-hidden cursor-pointer relative group border border-rams-rule-light bg-rams-bg hover:border-rams-rule transition-all duration-200"
                                                            >
                                                                <div className="absolute inset-0 bg-rams-ink/0 group-hover:bg-rams-ink/5 transition-colors z-10" />
                                                                <img
                                                                    src={photo.thumbnail}
                                                                    alt="Checklist Evidence"
                                                                    className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-300"
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
                        className="fixed inset-0 z-[100] bg-rams-ink/90 backdrop-blur-sm flex items-center justify-center p-4 md:p-8"
                    >
                        <motion.div
                            initial={{ scale: 0.98, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.98, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full h-full max-w-5xl bg-rams-bg rounded-sm overflow-hidden shadow-none relative border border-rams-rule"
                        >
                            {/* IFrame or Image Element */}
                            {selectedImage.includes('drive.google.com') ? (
                                <iframe
                                    src={selectedImage}
                                    className="w-full h-full border-0 bg-rams-bg"
                                    allow="autoplay"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-rams-bg p-2">
                                    <img 
                                        src={selectedImage} 
                                        alt="Evidence Full" 
                                        className="max-w-full max-h-full object-contain rounded-sm" 
                                    />
                                </div>
                            )}

                            {/* Close button */}
                            <button
                                onClick={() => setSelectedImage(null)}
                                className="absolute top-4 right-4 w-9 h-9 bg-rams-panel hover:bg-rams-bg text-rams-ink rounded-sm flex items-center justify-center border border-rams-rule-light transition-all active:translate-y-[1px] cursor-pointer"
                            >
                                <X size={16} />
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            {/* Brand Footer */}
            <footer className="w-full text-center py-6 mt-8 text-[9px] font-mono tracking-[0.2em] text-rams-ink-muted uppercase select-none">
                ONHAUS SYSTEM © {new Date().getFullYear()}
            </footer>
        </div>
    );
}