/* Hallmark · route: /checklist · structure: utilitarian operations & logs dashboard
 * paper: oklch(96% 0.006 80) · accent: oklch(62% 0.16 45) · display: Geist Mono · body: Geist Sans
 * axes: light / geometric-sans / warm · gates: all-pass
 */
"use client";
import React, { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { format, isValid, parse } from "date-fns";
import { th } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Camera,
  User,
  Clock,
  DollarSign,
  RefreshCw,
  FileText,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  X,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Search,
  ExternalLink,
  Play,
  Pause,
  Layers,
  Sparkles
} from "lucide-react";
import NavigationDock from "../_components/NavigationDock";

const GOOGLE_FORM_URL = "https://forms.gle/8agnXqC7ZSojmqra6";
const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1AJVcXjwuzlm5U_UPD91wWPKz76jTRrW2VPsL22MR9CU/export?format=csv";

// --- Configuration: Column Mapping ---
const COLUMN_MAP = {
  TIMESTAMP: [
    "Group ID ของคุณคือ: C1210c7a0601b5a675060e312efe10bff",
    "Timestamp",
    "ประทับเวลา",
    "วันที่"
  ],
  STAFF_NAME: ["ชื่อพนักงาน ( Aka )", "Staff Name", "ชื่อพนักงาน"],
  SHIFT_TIME: ["ช่วงเวลาที่ตรวจสอบ", "ช่วงเวลากะ", "Shift"],
  OPENING_TASKS: [
    "เช็คความพร้อมก่อนเปิด",
    "ระบบเงินและ POS",
    "เช็คความพร้อมก่อนเปิด (Opening Checklist)",
    "ระบบเงินและ POS (Opening Cash & POS)"
  ],
  MIDDAY_TASKS: ["ตรวจสอบภารกิจระหว่างวัน (Time-based)"],
  CLOSING_TASKS: [
    "ความสะอาดและสต็อก (Cleaning & Stock)",
    "ระบบเงินและการปิดร้าน (Closing)",
    "ความสะอาดและสต็อก",
    "ระบบเงินและการปิดร้าน",
    "ระบบเงินและการปิดร้าน (Closing Money & System)"
  ],
  CASH_OPEN: ["ระบุยอดเงินในลิ้นชักก่อนเปิด (บาท)", "Opening Cash", "เงินเปิดร้าน"],
  CASH_CLOSE: ["ระบุยอดเงินสดปิดร้าน (บาท)", "Closing Cash", "เงินปิดร้าน"],
  NOTE: ["หมายเหตุ", "หมายเหตุ (Note)", "Note"],
  PHOTO_OPEN: ["ถ่ายรูปหน้าร้านหลังเตรียมเสร็จ"],
  PHOTO_CLOSE: [
    "ถ่ายรูปพื้นที่ก่อนปิดร้าน",
    "ภาพ Station บาร์โดยรวมก่อนกลับบ้าน * ( อัพทุกวัน ) พื้น, และบาร์ด้านหลัง pos",
    "ถ่ายรูปสายยาง, กาง fly sheet ด้านข้าง"
  ],
  COFFEE_SCHEDULE: ["[ เวรล้างถังน้ำเครื่องกาแฟ - ทุก 2 วัน]"],
  COFFEE_CLEANER: ["ใส่ชื่อผู้ล้าง ถังน้ำกาแฟ **", "ใส่ชื่อผู้ล้าง ถังน้ำกาแฟ"],
  NIGHT_DEFECTS: ["จุดที่ไม่เรียบร้อย (จากกะกลางคืน ) เพื่อปรับปรุง ไม่มีให้เว้นว่างเอาไว้ *"]
};

// --- Helper: Parentheses-aware Comma Splitter ---
const splitTasks = (taskStr) => {
  if (!taskStr) return [];
  const result = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < taskStr.length; i++) {
    const char = taskStr[i];
    if (char === "(" || char === "[" || char === "{") {
      depth++;
    } else if (char === ")" || char === "]" || char === "}") {
      depth--;
    }

    if (char === "," && depth === 0) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    result.push(current.trim());
  }
  return result.filter(Boolean);
};

// --- Helper: Clean & Parse Cash ---
const parseCashVal = (cashStr) => {
  if (cashStr === undefined || cashStr === null) return null;
  const cleaned = String(cashStr)
    .replace(/,/g, "")
    .replace(/บาท/g, "")
    .replace(/\s+/g, "")
    .trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
};

// --- Helper: Robust Date Parser ---
const parseGenericDate = (dateStr) => {
  if (!dateStr) return null;
  const clean = String(dateStr).trim();

  // Case 1: Excel Serial Date
  if (!isNaN(clean) && parseFloat(clean) > 30000) {
    return new Date((parseFloat(clean) - 25569) * 86400 * 1000);
  }

  // Case 2: Standard regex for d/M/yyyy, H:m:s
  const parts = clean.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[,\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
  );
  if (parts) {
    const day = parseInt(parts[1], 10);
    const month = parseInt(parts[2], 10) - 1;
    let year = parseInt(parts[3], 10);
    if (year < 100) year += 2000;
    const hour = parts[4] ? parseInt(parts[4], 10) : 0;
    const min = parts[5] ? parseInt(parts[5], 10) : 0;
    const sec = parts[6] ? parseInt(parts[6], 10) : 0;
    const d = new Date(year, month, day, hour, min, sec);
    if (isValid(d)) return d;
  }

  // Case 3: Native Fallback
  const nativeParse = new Date(clean);
  if (isValid(nativeParse)) return nativeParse;

  return null;
};

// --- Helper: Photo Link Extractor ---
const extractPhotoLinks = (row) => {
  const photos = [];
  Object.values(row).forEach((val) => {
    if (typeof val === "string" && val.includes("http")) {
      const links = val.split(/[\s,]+/).filter((s) => s.startsWith("http"));
      links.forEach((link) => {
        let id = null;
        const idMatch =
          link.match(/id=([a-zA-Z0-9_-]+)/) ||
          link.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
          link.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
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
  return photos.filter((v, i, a) => a.findIndex((v2) => v2.full === v.full) === i);
};

const extractPhotoLinksForKeys = (row, keys) => {
  const photos = [];
  keys.forEach((k) => {
    const actualKey = Object.keys(row).find(
      (rk) => rk.trim().toLowerCase() === k.trim().toLowerCase()
    );
    const val = actualKey ? row[actualKey] : null;
    if (typeof val === "string" && val.includes("http")) {
      const links = val.split(/[\s,]+/).filter((s) => s.startsWith("http"));
      links.forEach((link) => {
        let id = null;
        const idMatch =
          link.match(/id=([a-zA-Z0-9_-]+)/) || link.match(/\/d\/([a-zA-Z0-9_-]+)/);
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
  return photos.filter((v, i, a) => a.findIndex((v2) => v2.full === v.full) === i);
};

// --- Custom CSV Parser ---
const parseCSV = (text) => {
  const rows = [];
  let currentRow = [];
  let currentVal = "";
  let insideQuote = false;
  const cleanText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        currentVal += '"';
        i++;
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === "," && !insideQuote) {
      currentRow.push(currentVal);
      currentVal = "";
    } else if (char === "\n" && !insideQuote) {
      currentRow.push(currentVal);
      rows.push(currentRow);
      currentRow = [];
      currentVal = "";
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

export default function ChecklistPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [shiftFilter, setShiftFilter] = useState("All"); // 'All' | 'Opening' | 'Closing' | 'Discrepancy'
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedDayFilter, setSelectedDayFilter] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [expandedTasksMap, setExpandedTasksMap] = useState({});

  // Auto Sync
  const [isAutoSync, setIsAutoSync] = useState(true);
  const [countdown, setCountdown] = useState(30);
  const [lastSyncedTime, setLastSyncedTime] = useState(null);

  const logsContainerRef = useRef(null);

  useEffect(() => {
    fetchData();
  }, []);

  // Handle ESC for Lightbox
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape") setSelectedImage(null);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  // Live Sync Countdown
  useEffect(() => {
    let timer;
    if (isAutoSync && !loading) {
      timer = setInterval(() => {
        setCountdown((prev) => {
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

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch(SHEET_CSV_URL);
      if (!res.ok) throw new Error("ไม่สามารถเชื่อมต่อข้อมูล Google Sheet ได้");

      const csvText = await res.text();
      const rows = parseCSV(csvText);
      if (rows.length < 2) {
        setData([]);
        setLoading(false);
        return;
      }

      const headers = rows[0].map((h) => h.trim());
      const rawEntries = rows.slice(1).map((r, idx) => {
        const obj = {};
        headers.forEach((h, i) => {
          if (h) obj[h] = r[i] || "";
        });
        obj._rawRow = r;
        obj._index = idx;
        return obj;
      });

      const processed = rawEntries.map((row, index) => {
        const findVal = (keyOrList) => {
          let possibleKeys = keyOrList;
          if (typeof keyOrList === "string") {
            possibleKeys = COLUMN_MAP[keyOrList];
          }
          if (!possibleKeys || !Array.isArray(possibleKeys)) return undefined;
          for (const key of possibleKeys) {
            const actualKey = Object.keys(row).find(
              (k) => k.trim().toLowerCase() === key.toLowerCase()
            );
            if (actualKey && row[actualKey] !== undefined) return row[actualKey];
          }
          return undefined;
        };

        let timestampVal = findVal("TIMESTAMP") || (row._rawRow && row._rawRow[0]);
        const timestamp = parseGenericDate(timestampVal);

        const checkTimeCol = findVal("SHIFT_TIME") || "";
        let type = "Unknown";
        if (checkTimeCol.includes("เปิดร้าน") || checkTimeCol.includes("เปิด")) {
          type = "Opening";
        } else if (checkTimeCol.includes("ปิดร้าน") || checkTimeCol.includes("ปิด")) {
          type = "Closing";
        } else {
          const hasOpening = findVal("OPENING_TASKS");
          const hasClosing = findVal("CLOSING_TASKS");
          if (hasOpening) type = "Opening";
          else if (hasClosing) type = "Closing";
          else if (timestamp && isValid(timestamp)) {
            const hr = timestamp.getHours();
            type = hr >= 5 && hr < 16 ? "Opening" : "Closing";
          }
        }

        const isOpening = type === "Opening";
        const taskKeys = isOpening ? COLUMN_MAP.OPENING_TASKS : COLUMN_MAP.CLOSING_TASKS;
        let tasks = [];
        taskKeys.forEach((k) => {
          const val = findVal([k]);
          if (val) tasks = tasks.concat(splitTasks(val));
        });

        const middayVal = findVal("MIDDAY_TASKS");
        if (middayVal) {
          tasks = tasks.concat(splitTasks(middayVal));
        }

        const cashStr = isOpening ? findVal("CASH_OPEN") : findVal("CASH_CLOSE");
        const cashVal = parseCashVal(cashStr);

        return {
          id: `log_${index}`,
          timestamp,
          staffName: findVal("STAFF_NAME") || "Unknown Staff",
          type,
          tasks,
          cashStr: cashStr || null,
          cash: cashVal,
          photos: extractPhotoLinks(row),
          note: findVal("NOTE") || "",
          coffeeCleaner: findVal("COFFEE_CLEANER") || "",
          nightDefects: findVal("NIGHT_DEFECTS") || "",
          raw: row
        };
      });

      // Filter valid timestamps and sort chronologically for discrepancy math
      const validData = processed
        .filter((item) => item.timestamp && isValid(item.timestamp))
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      let lastClosingCash = null;
      let lastClosingDateStr = null;

      const validatedData = validData.map((item) => {
        const warnings = [];

        // 1. Cash checks
        if (item.type === "Opening") {
          if (item.cash !== null) {
            if (lastClosingCash !== null) {
              const cashDiff = item.cash - lastClosingCash;
              if (cashDiff !== 0) {
                warnings.push({
                  type: "cash_mismatch",
                  message: `ยอดเปิดร้าน (฿${item.cash.toLocaleString()}) ไม่ตรงยอดปิดร้านกะก่อนหน้า (฿${lastClosingCash.toLocaleString()}) ต่างกัน ${
                    cashDiff > 0 ? "+" : ""
                  }${cashDiff.toLocaleString()} บาท`,
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

        // 2. Photo checks
        if (item.photos.length === 0) {
          warnings.push({
            type: "missing_photos",
            message: "ไม่มีรูปภาพประกอบหลักฐาน"
          });
        }

        // 3. Punctuality
        const hr = item.timestamp.getHours();
        const min = item.timestamp.getMinutes();
        const decimalTime = hr + min / 60;

        if (item.type === "Opening" && decimalTime > 12.0) {
          warnings.push({
            type: "late_submission",
            message: `ส่งฟอร์มเปิดร้านล่าช้า (${format(item.timestamp, "HH:mm")} น.)`
          });
        }

        return {
          ...item,
          warnings,
          hasDiscrepancies: warnings.length > 0
        };
      });

      // Sort newest to oldest for display
      const finalData = validatedData.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setData(finalData);
      setLastSyncedTime(new Date());
      setError(null);
    } catch (err) {
      console.error("Fetch Checklist Data Error:", err);
      setError(err.message || "เกิดข้อผิดพลาดในการโหลดข้อมูล");
    } finally {
      setLoading(false);
    }
  };

  // --- Derived State: Months ---
  const availableMonths = useMemo(() => {
    return [...new Set(data.map((item) => format(item.timestamp, "MMMM yyyy")))];
  }, [data]);

  useEffect(() => {
    if (availableMonths.length > 0 && !selectedMonth) {
      const current = format(new Date(), "MMMM yyyy");
      setSelectedMonth(availableMonths.includes(current) ? current : availableMonths[0]);
    }
  }, [availableMonths, selectedMonth]);

  // --- Derived State: Month Data ---
  const currentMonthData = useMemo(() => {
    if (!selectedMonth) return [];
    return data.filter((item) => format(item.timestamp, "MMMM yyyy") === selectedMonth);
  }, [data, selectedMonth]);

  // --- Derived State: Days in Selected Month ---
  const daysInMonth = useMemo(() => {
    if (!selectedMonth) return [];
    const parsedDate = parse(selectedMonth, "MMMM yyyy", new Date());
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

  const firstDayOfWeek = useMemo(() => {
    if (daysInMonth.length === 0) return 0;
    return daysInMonth[0].getDay();
  }, [daysInMonth]);

  // Day Status Map for Calendar
  const dayStatusMap = useMemo(() => {
    const map = {};
    currentMonthData.forEach((item) => {
      const dateStr = format(item.timestamp, "yyyy-MM-dd");
      if (!map[dateStr]) {
        map[dateStr] = {
          opening: null,
          closing: null,
          entries: []
        };
      }
      map[dateStr].entries.push(item);
      if (item.type === "Opening") {
        map[dateStr].opening = item;
      } else if (item.type === "Closing") {
        map[dateStr].closing = item;
      }
    });
    return map;
  }, [currentMonthData]);

  // --- Derived State: Metrics ---
  const stats = useMemo(() => {
    const count = currentMonthData.length;
    const perfectCount = currentMonthData.filter((item) => item.warnings.length === 0).length;
    const mismatchShifts = currentMonthData.filter((item) =>
      item.warnings.some((w) => w.type === "cash_mismatch")
    );
    const totalMismatches = mismatchShifts.length;

    let netMismatchValue = 0;
    mismatchShifts.forEach((item) => {
      const warning = item.warnings.find((w) => w.type === "cash_mismatch");
      if (warning && warning.diff !== undefined) {
        netMismatchValue += warning.diff;
      }
    });

    const complianceScore = count > 0 ? Math.round((perfectCount / count) * 100) : 100;

    return {
      total: count,
      opening: currentMonthData.filter((item) => item.type === "Opening").length,
      closing: currentMonthData.filter((item) => item.type === "Closing").length,
      perfect: perfectCount,
      mismatches: totalMismatches,
      netMismatch: netMismatchValue,
      complianceScore
    };
  }, [currentMonthData]);

  // --- Filtered Data ---
  const filteredData = useMemo(() => {
    return currentMonthData.filter((item) => {
      let shiftMatch = true;
      if (shiftFilter === "Opening") shiftMatch = item.type === "Opening";
      else if (shiftFilter === "Closing") shiftMatch = item.type === "Closing";
      else if (shiftFilter === "Discrepancy") shiftMatch = item.hasDiscrepancies;

      let dayMatch = true;
      if (selectedDayFilter) {
        dayMatch = format(item.timestamp, "yyyy-MM-dd") === selectedDayFilter;
      }

      let queryMatch = true;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        queryMatch =
          item.staffName.toLowerCase().includes(q) ||
          item.type.toLowerCase().includes(q) ||
          item.note.toLowerCase().includes(q) ||
          item.coffeeCleaner.toLowerCase().includes(q) ||
          item.nightDefects.toLowerCase().includes(q) ||
          format(item.timestamp, "d MMMM yyyy", { locale: th }).toLowerCase().includes(q);
      }

      return shiftMatch && dayMatch && queryMatch;
    });
  }, [currentMonthData, shiftFilter, selectedDayFilter, searchQuery]);

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

  const toggleTaskExpand = (id) => {
    setExpandedTasksMap((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  return (
    <div className="min-h-screen bg-rams-bg text-rams-ink safe-bottom-dock font-sans pb-32">
      {/* Top Header */}
      <header className="border-b border-rams-rule-light bg-rams-panel px-4 sm:px-6 py-4 sticky top-0 z-30 shadow-none">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rams-orange"></span>
              <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-rams-ink-muted">
                IN THE HAUS · OPERATIONS & CHECKLIST LOGS
              </span>
              <span className="relative flex h-2 w-2 ml-1">
                {isAutoSync && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rams-green opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isAutoSync ? "bg-rams-green" : "bg-rams-ink-muted"
                  }`}
                ></span>
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-mono font-bold tracking-tight text-rams-ink mt-0.5">
              ระบบตรวจร้าน & สรุปบันทึก (CHECKLIST)
            </h1>
            <p className="text-xs font-mono text-rams-ink-muted mt-0.5">
              {lastSyncedTime
                ? `อัปเดตล่าสุด: ${format(lastSyncedTime, "HH:mm:ss น.")}`
                : "กำลังโหลดข้อมูล..."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Primary Action Button to Google Form */}
            <Link
              href={GOOGLE_FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-rams-orange hover:bg-rams-orange-active text-rams-panel border border-rams-rule px-4 py-2.5 rounded-sm font-mono font-bold text-xs uppercase tracking-wider transition-all tactile-btn shadow-none cursor-pointer"
            >
              <span>📋 เปิด Google Form Checklist</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>

            {/* Month Select */}
            {availableMonths.length > 0 && (
              <div className="relative">
                <select
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(e.target.value);
                    setSelectedDayFilter(null);
                  }}
                  className="appearance-none pl-3 pr-8 py-2.5 rounded-sm bg-rams-bg border border-rams-rule-light text-xs font-mono font-bold text-rams-ink focus:outline-none focus:border-rams-orange transition-all cursor-pointer min-w-[140px]"
                >
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>
                      {format(parse(m, "MMMM yyyy", new Date()), "MMMM yyyy", { locale: th })}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-2.5 flex items-center pointer-events-none text-rams-ink-muted">
                  <ChevronRight size={14} className="rotate-90" />
                </div>
              </div>
            )}

            {/* Auto-Sync Toggle */}
            <button
              onClick={() => setIsAutoSync(!isAutoSync)}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-sm text-[11px] font-mono font-bold uppercase transition-all border cursor-pointer select-none tactile-btn-sm ${
                isAutoSync
                  ? "bg-rams-green/10 text-rams-green border-rams-green/30"
                  : "bg-rams-bg border-rams-rule-light text-rams-ink-muted hover:text-rams-ink"
              }`}
            >
              {isAutoSync ? <Pause size={12} className="animate-pulse" /> : <Play size={12} />}
              <span>{isAutoSync ? `LIVE (${countdown}s)` : "SYNC OFF"}</span>
            </button>

            {/* Manual Refresh */}
            <button
              onClick={fetchData}
              disabled={loading}
              title="รีเฟรชข้อมูลจาก Google Sheets"
              className="p-2.5 flex items-center justify-center rounded-sm bg-rams-bg border border-rams-rule-light hover:bg-rams-panel hover:text-rams-ink text-rams-ink-muted transition-all tactile-btn-sm cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? "animate-spin text-rams-orange" : ""} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-sm bg-rams-red/10 border border-rams-red text-rams-red text-xs font-mono font-bold flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={fetchData}
              className="underline hover:text-rams-ink cursor-pointer ml-4"
            >
              ลองใหม่อีกครั้ง
            </button>
          </div>
        )}

        {/* 1. Dashboard Metrics Summary Cards */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 font-mono">
          {/* Card 1: Compliance Score */}
          <div className="bg-rams-panel p-4 sm:p-5 border border-rams-rule-light rounded-sm flex flex-col justify-between shadow-none">
            <span className="text-[10px] font-bold text-rams-ink-muted tracking-widest uppercase block mb-2">
              ความสมบูรณ์ข้อมูล
            </span>
            <div className="flex items-end justify-between">
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-rams-ink">
                {stats.complianceScore}%
              </h2>
              <span
                className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm border ${
                  stats.complianceScore >= 85
                    ? "bg-rams-green/10 text-rams-green border-rams-green/30"
                    : stats.complianceScore >= 60
                    ? "bg-rams-amber/10 text-rams-amber border-rams-amber/30"
                    : "bg-rams-red/10 text-rams-red border-rams-red/30"
                }`}
              >
                {stats.complianceScore === 100
                  ? "EXCELLENT"
                  : stats.complianceScore >= 85
                  ? "GOOD"
                  : "WARNING"}
              </span>
            </div>
            <div className="h-1.5 w-full bg-rams-bg border border-rams-rule-light rounded-sm mt-3 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  stats.complianceScore >= 85
                    ? "bg-rams-green"
                    : stats.complianceScore >= 60
                    ? "bg-rams-amber"
                    : "bg-rams-red"
                }`}
                style={{ width: `${stats.complianceScore}%` }}
              />
            </div>
          </div>

          {/* Card 2: Total Reports */}
          <div className="bg-rams-panel p-4 sm:p-5 border border-rams-rule-light rounded-sm flex flex-col justify-between shadow-none">
            <span className="text-[10px] font-bold text-rams-ink-muted tracking-widest uppercase block mb-2">
              รายงานทั้งหมด
            </span>
            <div>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-rams-ink">
                {stats.total}{" "}
                <span className="text-xs font-normal text-rams-ink-muted">REPORTS</span>
              </h2>
              <div className="flex gap-2.5 mt-2.5 text-[10px] font-bold tracking-wider text-rams-ink-muted uppercase">
                <span className="text-rams-orange">☀️ OPEN: {stats.opening}</span>
                <span>•</span>
                <span className="text-rams-ink">🌙 CLOSE: {stats.closing}</span>
              </div>
            </div>
          </div>

          {/* Card 3: Shift Discrepancies */}
          <div className="bg-rams-panel p-4 sm:p-5 border border-rams-rule-light rounded-sm flex flex-col justify-between shadow-none">
            <span className="text-[10px] font-bold text-rams-ink-muted tracking-widest uppercase block mb-2">
              จุดบกพร่อง / ต่างกะ
            </span>
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-rams-ink">
                  {stats.mismatches}{" "}
                  <span className="text-xs font-normal text-rams-ink-muted">SHIFTS</span>
                </h2>
                <p className="text-[10px] text-rams-ink-muted uppercase tracking-wider mt-1">
                  ยอดเงินข้ามกะไม่ตรงกัน
                </p>
              </div>
              <div
                className={`p-2 rounded-sm border flex items-center justify-center ${
                  stats.mismatches > 0
                    ? "bg-rams-amber/10 border-rams-amber/30 text-rams-amber"
                    : "bg-rams-green/10 border-rams-green/30 text-rams-green"
                }`}
              >
                <AlertTriangle size={16} />
              </div>
            </div>
          </div>

          {/* Card 4: Accumulated Cash Discrepancy */}
          <div className="bg-rams-panel p-4 sm:p-5 border border-rams-rule-light rounded-sm flex flex-col justify-between shadow-none">
            <span className="text-[10px] font-bold text-rams-ink-muted tracking-widest uppercase block mb-2">
              สะสมเงินคลาดเคลื่อน
            </span>
            <div className="flex items-end justify-between">
              <div>
                <h2
                  className={`text-2xl sm:text-3xl font-black tracking-tight ${
                    stats.netMismatch > 0
                      ? "text-rams-green"
                      : stats.netMismatch < 0
                      ? "text-rams-red"
                      : "text-rams-ink"
                  }`}
                >
                  {stats.netMismatch > 0 ? `+${stats.netMismatch}` : stats.netMismatch}{" "}
                  <span className="text-xs font-normal text-rams-ink-muted">THB</span>
                </h2>
                <p className="text-[10px] text-rams-ink-muted uppercase tracking-wider mt-1">
                  ดรอเวอร์ดิฟสะสมเดือนนี้
                </p>
              </div>
              <div
                className={`p-2 rounded-sm border flex items-center justify-center ${
                  stats.netMismatch > 0
                    ? "bg-rams-green/10 border-rams-green/30 text-rams-green"
                    : stats.netMismatch < 0
                    ? "bg-rams-red/10 border-rams-red/30 text-rams-red"
                    : "bg-rams-bg border-rams-rule-light text-rams-ink-muted"
                }`}
              >
                {stats.netMismatch > 0 ? (
                  <ArrowUpRight size={16} />
                ) : stats.netMismatch < 0 ? (
                  <ArrowDownRight size={16} />
                ) : (
                  <Check size={16} />
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 2. Monthly Activity Calendar Grid */}
        <section className="bg-rams-panel p-4 sm:p-6 border border-rams-rule-light rounded-sm font-mono shadow-none">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-base font-bold text-rams-ink uppercase tracking-wider flex items-center gap-2">
                <Calendar className="w-4 h-4 text-rams-orange" />
                <span>ปฏิทินตรวจการทำงานรายเดือน (MONTHLY ACTIVITY)</span>
              </h2>
              <p className="text-[11px] text-rams-ink-muted mt-0.5">
                แตะเลือกวันที่เพื่อกรองดูรายการบันทึกของวันนั้น หรือกดซ้ำเพื่อดูทั้งหมด
              </p>
            </div>

            {selectedDayFilter && (
              <button
                onClick={() => setSelectedDayFilter(null)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-rams-orange/10 border border-rams-orange text-xs font-bold text-rams-orange transition-all self-start sm:self-auto cursor-pointer"
              >
                <X size={12} />
                <span>
                  CLEAR FILTER:{" "}
                  {format(parse(selectedDayFilter, "yyyy-MM-dd", new Date()), "d MMM yyyy", {
                    locale: th
                  }).toUpperCase()}
                </span>
              </button>
            )}
          </div>

          {/* Weekdays */}
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2 mb-2 text-center text-[10px] font-bold uppercase text-rams-ink-muted border-b border-rams-rule-light pb-2">
            {["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day Cells */}
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {/* Leading padding */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div
                key={`pad-${i}`}
                className="aspect-square rounded-sm bg-rams-bg/40 border border-dashed border-rams-rule-light/40"
              />
            ))}

            {daysInMonth.map((day) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const dayStatus = dayStatusMap[dateStr];
              const isToday = format(new Date(), "yyyy-MM-dd") === dateStr;
              const isSelected = selectedDayFilter === dateStr;

              const getDotClass = (entry) => {
                if (!entry) return "bg-rams-bg border border-rams-rule-light";
                return entry.hasDiscrepancies
                  ? "bg-rams-amber border border-rams-amber"
                  : "bg-rams-green border border-rams-green";
              };

              return (
                <div
                  key={dateStr}
                  onClick={() => handleDayClick(dateStr)}
                  className={`aspect-square rounded-sm p-1.5 sm:p-2 flex flex-col justify-between border cursor-pointer transition-all relative overflow-hidden select-none ${
                    isSelected
                      ? "bg-rams-orange/10 border-rams-orange shadow-none ring-1 ring-rams-orange"
                      : isToday
                      ? "bg-rams-bg border-rams-rule"
                      : "bg-rams-panel border-rams-rule-light hover:border-rams-rule"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span
                      className={`text-xs font-bold ${
                        isToday
                          ? "text-rams-orange font-black"
                          : isSelected
                          ? "text-rams-orange"
                          : "text-rams-ink"
                      }`}
                    >
                      {day.getDate()}
                    </span>
                    {isToday && <span className="w-1.5 h-1.5 rounded-full bg-rams-orange animate-pulse" />}
                  </div>

                  <div className="flex justify-center items-center gap-1 mt-auto">
                    <div
                      title={
                        dayStatus?.opening
                          ? `เปิดร้าน: ${dayStatus.opening.staffName}`
                          : "ไม่มีบันทึกเปิดร้าน"
                      }
                      className={`w-1.5 h-1.5 rounded-full ${getDotClass(dayStatus?.opening)}`}
                    />
                    <div
                      title={
                        dayStatus?.closing
                          ? `ปิดร้าน: ${dayStatus.closing.staffName}`
                          : "ไม่มีบันทึกปิดร้าน"
                      }
                      className={`w-1.5 h-1.5 rounded-full ${getDotClass(dayStatus?.closing)}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 3. Toolbar & Log Feed Section */}
        <section ref={logsContainerRef} className="space-y-4 font-mono">
          {/* Toolbar */}
          <div className="bg-rams-panel p-4 border border-rams-rule-light rounded-sm flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-none">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 text-rams-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="ค้นหาชื่อพนักงาน (Aka), วันที่, หรือหมายเหตุ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-rams-bg border border-rams-rule-light focus:border-rams-orange rounded-sm pl-9 pr-3 py-2 text-xs font-sans text-rams-ink outline-none transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-rams-ink-muted hover:text-rams-ink text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap bg-rams-bg p-1 rounded-sm border border-rams-rule-light gap-1">
              {[
                { id: "All", label: "ทั้งหมด (All)" },
                { id: "Opening", label: "☀️ เปิดร้าน" },
                { id: "Closing", label: "🌙 ปิดร้าน" },
                { id: "Discrepancy", label: "⚠️ มีจุดสังเกต" }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setShiftFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-sm text-[11px] font-bold transition-all cursor-pointer tactile-btn-sm ${
                    shiftFilter === tab.id
                      ? "bg-rams-ink text-rams-panel border border-rams-ink"
                      : "text-rams-ink-muted hover:text-rams-ink"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Result Count Status */}
          <div className="flex justify-between items-center px-1 text-[11px] text-rams-ink-muted">
            <span>
              {selectedDayFilter
                ? `บันทึกสำหรับวันที่ ${format(
                    parse(selectedDayFilter, "yyyy-MM-dd", new Date()),
                    "d MMMM yyyy",
                    { locale: th }
                  )}`
                : "รายการบันทึกทั้งหมดประจำเดือน"}
            </span>
            <span className="font-bold">
              แสดง {filteredData.length} จาก {currentMonthData.length} รายการ
            </span>
          </div>

          {/* Loading Skeleton */}
          {loading && data.length === 0 ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-full h-48 bg-rams-panel rounded-sm animate-pulse border border-rams-rule-light"
                />
              ))}
            </div>
          ) : filteredData.length === 0 ? (
            /* Empty State */
            <div className="bg-rams-panel rounded-sm p-12 text-center border border-rams-rule-light flex flex-col items-center justify-center space-y-3">
              <div className="p-3 bg-rams-bg border border-rams-rule-light text-rams-ink-muted rounded-sm">
                <FileText size={28} />
              </div>
              <h3 className="text-sm font-bold text-rams-ink uppercase tracking-wider">
                ไม่พบบันทึกตามเงื่อนไขที่เลือก
              </h3>
              <p className="text-rams-ink-muted text-xs max-w-sm leading-relaxed font-sans">
                ไม่มีรายงานการตรวจร้านที่ตรงกับวันที่ หรือตัวกรองที่คุณกำหนด กรุณาเปลี่ยนตัวกรองหรือลองค้นหาคำใหม่
              </p>
              {selectedDayFilter && (
                <button
                  onClick={() => setSelectedDayFilter(null)}
                  className="bg-rams-orange text-rams-panel px-3.5 py-1.5 rounded-sm text-xs font-bold hover:bg-rams-orange-active transition"
                >
                  ดูบันทึกทั้งเดือน
                </button>
              )}
            </div>
          ) : (
            /* Log Cards Feed */
            <div className="space-y-4">
              {filteredData.map((item) => {
                const isExpanded = !!expandedTasksMap[item.id];
                const displayedTasks = isExpanded ? item.tasks : item.tasks.slice(0, 4);

                return (
                  <div
                    key={item.id}
                    className={`bg-rams-panel rounded-sm p-5 border transition-all relative overflow-hidden shadow-none ${
                      item.hasDiscrepancies ? "border-rams-amber" : "border-rams-rule-light"
                    }`}
                  >
                    {/* Left Indicator Strip */}
                    <div
                      className={`absolute left-0 top-0 bottom-0 w-1 ${
                        item.type === "Opening" ? "bg-rams-orange" : "bg-rams-ink"
                      }`}
                    />

                    <div className="pl-2 space-y-4">
                      {/* Top Header Row */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-rams-rule-light/60">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm border ${
                                item.type === "Opening"
                                  ? "bg-rams-orange/10 text-rams-orange border-rams-orange/30"
                                  : "bg-rams-ink text-rams-panel border border-rams-ink"
                              }`}
                            >
                              {item.type === "Opening" ? "☀️ OPENING (เปิดร้าน)" : "🌙 CLOSING (ปิดร้าน)"}
                            </span>
                            <span className="text-rams-ink-muted text-xs font-semibold flex items-center gap-1">
                              <Clock size={12} />
                              {format(item.timestamp, "d MMMM yyyy • HH:mm", { locale: th })} น.
                            </span>
                          </div>

                          <h3 className="text-xl font-black text-rams-ink flex items-center gap-2 mt-2">
                            <User size={16} className="text-rams-ink-muted" />
                            <span>{item.staffName}</span>
                          </h3>
                        </div>

                        {/* Cash Badge */}
                        {item.cashStr && (
                          <div className="flex flex-col sm:items-end bg-rams-bg p-3 rounded-sm border border-rams-rule-light min-w-[140px]">
                            <span className="text-[9px] font-bold text-rams-ink-muted uppercase tracking-widest mb-1">
                              {item.type === "Opening" ? "เงินทอนเปิดร้าน (POS)" : "เงินสดปิดร้าน"}
                            </span>
                            <span className="text-lg font-black text-rams-ink tabular-nums">
                              {item.cash !== null ? `฿${item.cash.toLocaleString()}` : item.cashStr}{" "}
                              <span className="text-[10px] font-bold text-rams-ink-muted">THB</span>
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Warnings Panel */}
                      {item.warnings.length > 0 && (
                        <div className="p-3.5 bg-rams-amber/10 rounded-sm border border-rams-amber/40 space-y-1.5">
                          <div className="flex items-center gap-2 text-rams-amber font-bold text-xs uppercase tracking-wider">
                            <AlertCircle size={14} />
                            <span>พบจุดที่ต้องตรวจสอบ ({item.warnings.length} รายการ)</span>
                          </div>
                          <ul className="space-y-1 pl-5 list-disc text-xs text-rams-ink leading-relaxed font-sans font-medium">
                            {item.warnings.map((w, idx) => (
                              <li key={idx} className="marker:text-rams-amber">
                                {w.message}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Content Grid */}
                      <div className="grid md:grid-cols-2 gap-4">
                        {/* Tasks Checklist */}
                        <div className="bg-rams-bg rounded-sm p-4 border border-rams-rule-light flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between mb-3 border-b border-rams-rule-light/60 pb-2">
                              <span className="text-[10px] font-bold text-rams-ink-muted uppercase tracking-wider flex items-center gap-1.5">
                                <Check size={12} className="text-rams-green" />
                                ภารกิจที่ตรวจเช็ค
                              </span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-sm bg-rams-green/10 text-rams-green border border-rams-green/20">
                                {item.tasks.length} รายการ
                              </span>
                            </div>

                            {item.tasks.length > 0 ? (
                              <div className="space-y-2">
                                {displayedTasks.map((t, idx) => (
                                  <div key={idx} className="flex items-start gap-2">
                                    <div className="w-3.5 h-3.5 rounded-full bg-rams-green/10 flex items-center justify-center shrink-0 mt-0.5 border border-rams-green/30">
                                      <Check size={8} className="text-rams-green" strokeWidth={3} />
                                    </div>
                                    <span className="text-xs text-rams-ink leading-relaxed font-sans font-medium">
                                      {t}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-rams-ink-muted text-xs italic font-sans py-1">
                                ไม่มีการบันทึกรายการภารกิจ
                              </p>
                            )}
                          </div>

                          {item.tasks.length > 4 && (
                            <button
                              onClick={() => toggleTaskExpand(item.id)}
                              className="mt-3 pt-2 border-t border-rams-rule-light/60 text-xs font-bold text-rams-orange hover:underline flex items-center gap-1 self-start cursor-pointer"
                            >
                              {isExpanded ? (
                                <>
                                  <span>ย่อรายการ</span>
                                  <ChevronUp size={12} />
                                </>
                              ) : (
                                <>
                                  <span>ดูทั้งหมด {item.tasks.length} รายการ</span>
                                  <ChevronDown size={12} />
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        {/* Notes & Extra Info */}
                        <div className="space-y-3">
                          {/* General Note */}
                          <div className="bg-rams-bg rounded-sm p-4 border border-rams-rule-light h-full flex flex-col">
                            <span className="text-[10px] font-bold text-rams-ink-muted uppercase tracking-wider flex items-center gap-1.5 mb-2">
                              <FileText size={12} />
                              หมายเหตุเพิ่มเติม
                            </span>
                            {item.note ? (
                              <p className="text-xs text-rams-ink leading-relaxed font-sans bg-rams-panel p-2.5 rounded-sm border border-rams-rule-light flex-1 italic">
                                "{item.note}"
                              </p>
                            ) : (
                              <p className="text-rams-ink-muted text-xs italic font-sans flex-1">
                                ไม่มีหมายเหตุเพิ่มเติม
                              </p>
                            )}

                            {/* Extra fields: coffee cleaner / defects */}
                            {(item.coffeeCleaner || item.nightDefects) && (
                              <div className="mt-3 pt-2.5 border-t border-rams-rule-light space-y-2 text-xs font-sans">
                                {item.coffeeCleaner && (
                                  <div className="flex justify-between items-center bg-rams-panel p-2 rounded-sm border border-rams-rule-light">
                                    <span className="text-rams-ink-muted font-bold text-[10px] uppercase">
                                      ☕ เวรล้างถังน้ำกาแฟ:
                                    </span>
                                    <span className="font-bold text-rams-ink">{item.coffeeCleaner}</span>
                                  </div>
                                )}

                                {item.nightDefects && (
                                  <div className="p-2 rounded-sm bg-rams-amber/10 border border-rams-amber/30 text-rams-ink">
                                    <span className="text-rams-amber font-bold text-[10px] uppercase block mb-0.5">
                                      ⚠️ จุดบกพร่องจากกะก่อนหน้า:
                                    </span>
                                    <p className="text-[11px] leading-relaxed">{item.nightDefects}</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Evidence Photo Gallery */}
                      {item.photos.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-rams-rule-light/60">
                          <span className="text-[10px] font-bold text-rams-ink-muted uppercase tracking-wider flex items-center gap-1.5">
                            <Camera size={12} />
                            รูปถ่ายหลักฐาน ({item.photos.length} รูป)
                          </span>
                          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                            {item.photos.map((photo, i) => (
                              <div
                                key={i}
                                onClick={() => setSelectedImage(photo.full)}
                                className="aspect-square rounded-sm overflow-hidden cursor-pointer relative group border border-rams-rule-light bg-rams-bg hover:border-rams-orange transition-all"
                              >
                                <img
                                  src={photo.thumbnail}
                                  alt="Checklist Evidence"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                  onError={(e) => {
                                    e.target.style.display = "none";
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Lightbox / Google Drive Viewer Modal */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedImage(null)}
            className="fixed inset-0 z-50 bg-rams-ink/80 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-4xl h-[85vh] bg-rams-panel rounded-sm overflow-hidden border border-rams-rule shadow-2xl flex flex-col"
            >
              {/* Modal Header */}
              <div className="p-3 border-b border-rams-rule-light flex justify-between items-center bg-rams-bg font-mono">
                <span className="text-xs font-bold text-rams-ink flex items-center gap-2">
                  <Camera className="w-3.5 h-3.5 text-rams-orange" />
                  หลักฐานรูปภาพประกอบ (EVIDENCE PREVIEW)
                </span>
                <button
                  onClick={() => setSelectedImage(null)}
                  className="bg-rams-panel hover:bg-rams-ink hover:text-rams-panel border border-rams-rule px-2.5 py-1 rounded-sm text-xs font-bold text-rams-ink transition cursor-pointer"
                >
                  ✕ ปิด (CLOSE)
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 bg-rams-bg p-2 overflow-hidden flex items-center justify-center">
                {selectedImage.includes("drive.google.com") ? (
                  <iframe
                    src={selectedImage}
                    className="w-full h-full border-0 rounded-sm"
                    allow="autoplay"
                  />
                ) : (
                  <img
                    src={selectedImage}
                    alt="Evidence Preview"
                    className="max-w-full max-h-full object-contain rounded-sm"
                  />
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation Dock for Staff Mobile Flow */}
      <NavigationDock />
    </div>
  );
}