/* Brand v2 (Thai Twist Modern) · /checklist: today's form status, zone check, month figures, calendar, log.
 * Cream surface, plum header, one charcoal primary (เปิดฟอร์มเปิด-ปิดร้าน). SOV_monomon heads, IBM Plex Sans Thai body, DM Mono numbers. No icons or emoji.
 * Hallmark · redesign: full · shape: app screen · theme: brand (inthehaus-booking/.agents/AGENTS.md)
 * Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5
 * Hallmark · waive 39b, 72 · calendar day cells are 64px tap targets holding the day and two form marks (AGENTS.md §4: taps ≥48px)
 * Hallmark · waive 76 · evidence thumbnails are staff photos on Google Drive; they load for signed-in viewers, onError hides the rest
 * Hallmark · waive 71 · the staff name sits under its own type and time line, which belongs to it */
"use client";
import React, { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { format, isValid, parse } from "date-fns";
import { th } from "date-fns/locale";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import NavigationDock from "../_components/NavigationDock";
import { supabase } from "../../lib/supabaseClient";

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

  // NFC Zone & In-App Quick Log State
  const [nfcStation, setNfcStation] = useState(null);
  const [activeZone, setActiveZone] = useState(null); // 'ESPRESSO' | 'BAR' | 'KITCHEN' | 'HALL' | 'CLOSING'
  const [showEspressoModal, setShowEspressoModal] = useState(false);
  const [espressoForm, setEspressoForm] = useState({
    staffName: "",
    dose: "18.5",
    yieldWeight: "36",
    shotTime: "28",
    tasteNotes: "Balanced, หวานคาราเมล ครีม่าเนียน",
    grinderAdjust: "คงเดิม"
  });
  const [espressoSubmitting, setEspressoSubmitting] = useState(false);
  const [zoneCheckedItems, setZoneCheckedItems] = useState({});
  const [zoneSubmitting, setZoneSubmitting] = useState(false);

  const logsContainerRef = useRef(null);

  useEffect(() => {
    fetchData();
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const z = (params.get("zone") || "").toUpperCase();
      const st = params.get("nfc_station");
      if (st) setNfcStation(st.toUpperCase());
      if (z) {
        setActiveZone(z);
        if (z === "ESPRESSO") {
          setShowEspressoModal(true);
        }
      }
    }
  }, []);

  const ZONE_SOP_ITEMS = {
    BAR: [
      "เปิดเครื่องชงกาแฟ เช็กแรงดันหม้อต้มและล้างหัวกรุ๊ป (Flush)",
      "ตรวจสอบความสะอาดก้านสตีมนมและถังน้ำทิ้ง",
      "เช็กสต็อกนมสด ไซรัป และเมล็ดกาแฟในโถบดพร้อมขาย",
      "ตรวจความสะอาดเคาน์เตอร์บาร์และหน้าจอ POS"
    ],
    KITCHEN: [
      "ตรวจสอบวาล์วถังแก๊ส พัดลมดูดควัน และความสะอาดเตา",
      "เช็กอุณหภูมิตู้แช่เนื้อสัตว์และวัตถุดิบสด",
      "ตักไขมันและทำความสะอาดถังดักไขมัน / ซิงก์ล้างจาน",
      "ตรวจสอบความสะอาดเขียง มีด และพื้นที่เตรียมอาหาร"
    ],
    HALL: [
      "เปิดแอร์/พัดลม จัดระเบียบโต๊ะและเก้าอี้โซนลูกค้า",
      "ตรวจความสะอาดห้องน้ำ กระดาษทิชชู่ และสบู่ล้างมือ",
      "เช็ดกระจกหน้าร้านและกวาดถูพื้นห้องอาหาร"
    ],
    CLOSING: [
      "แบล็กฟลัช (Backflush) เครื่องชงกาแฟและแช่อุปกรณ์บาร์",
      "ปิดวาล์วถังแก๊สและสับเบรกเกอร์เครื่องใช้ไฟฟ้าในครัว",
      "เคลียร์ถังขยะทั้งหมดออกนอกตัวอาคารและปิดฝามิดชิด",
      "ปิดแอร์ทุกตัว ปิดไฟหน้าร้าน และล็อกประตูทุกบานเรียบร้อย"
    ]
  };

  const handleEspressoSubmit = async (e) => {
    e.preventDefault();
    if (!espressoForm.staffName.trim()) {
      alert("กรุณาระบุชื่อบาริสต้าผู้สกัดช็อต");
      return;
    }
    setEspressoSubmitting(true);
    try {
      const summaryContent = `☕ [NFC ESPRESSO CALIBRATION] โดย ${espressoForm.staffName} | Dose: ${espressoForm.dose}g | Yield: ${espressoForm.yieldWeight}g | Time: ${espressoForm.shotTime}s | รสชาติ: ${espressoForm.tasteNotes} | การปรับบด: ${espressoForm.grinderAdjust}`;
      const { error: dbErr } = await supabase.from("yuzu_chat_history").insert({
        group_id: "NFC_ESPRESSO_STATION",
        user_id: espressoForm.staffName.trim(),
        role: "model",
        content: summaryContent,
        message_type: "espresso_report"
      });
      if (dbErr) throw dbErr;
      alert("☕ บันทึกผล Calibration ช็อตกาแฟเข้าสู่ระบบเรียบร้อยแล้ว!");
      setShowEspressoModal(false);
    } catch (err) {
      alert("เกิดข้อผิดพลาด: " + err.message);
    } finally {
      setEspressoSubmitting(false);
    }
  };

  const handleZoneSopSubmit = async () => {
    if (!activeZone || !ZONE_SOP_ITEMS[activeZone]) return;
    const items = ZONE_SOP_ITEMS[activeZone];
    const checkedList = items.filter((_, idx) => zoneCheckedItems[`${activeZone}_${idx}`]);
    if (checkedList.length === 0) {
      alert("กรุณาติ๊กเลือกรายการที่ตรวจสอบแล้วอย่างน้อย 1 รายการ");
      return;
    }
    setZoneSubmitting(true);
    try {
      const { error: taskErr } = await supabase.from("staff_tasks").insert({
        description: `[NFC ZONE: ${activeZone}] ตรวจเช็กสำเร็จ (${checkedList.length}/${items.length} ข้อ): ${checkedList.join(", ")}`,
        assigned_to: nfcStation || activeZone,
        status: "DONE",
        created_at: new Date().toISOString()
      });
      if (taskErr) console.warn("staff_tasks insert warning:", taskErr);
      alert(`✅ บันทึกการตรวจโซน ${activeZone} (${checkedList.length}/${items.length} รายการ) สำเร็จ!`);
      setZoneCheckedItems({});
    } catch (err) {
      alert("เกิดข้อผิดพลาด: " + err.message);
    } finally {
      setZoneSubmitting(false);
    }
  };

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

        // 3. Punctuality: the opening form covers opening and the afternoon
        // ("เปิดร้านและช่วงบ่าย"), so it is late only after 17:00 (owner, 2026-11-27).
        const hr = item.timestamp.getHours();
        const min = item.timestamp.getMinutes();
        const decimalTime = hr + min / 60;

        if (item.type === "Opening" && decimalTime > 17.0) {
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

  const ZONES = [
    { id: "BAR", label: "บาร์น้ำ" },
    { id: "KITCHEN", label: "ครัว" },
    { id: "HALL", label: "หน้าร้าน ห้องน้ำ" },
    { id: "CLOSING", label: "ล็อกร้านก่อนกลับ" }
  ];
  const SHIFT_TABS = [
    { id: "All", label: "ทั้งหมด" },
    { id: "Opening", label: "เปิดร้าน" },
    { id: "Closing", label: "ปิดร้าน" },
    { id: "Discrepancy", label: "มีจุดต้องตรวจ" }
  ];
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayStatus = dayStatusMap[todayStr];
  const signed = (n) => (n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString());
  const fieldCls =
    "w-full min-h-12 px-3 bg-cream border border-charcoal text-base text-charcoal placeholder:text-neutral outline-none focus-visible:border-plum";

  return (
    <MotionConfig reducedMotion="user">
    <div className="brand-v2 min-h-screen pb-36">
      {/* Header: plum bar, title cell + wordmark cell */}
      <header className="sticky top-0 z-30 bg-plum text-cream border-b border-plum-3">
        <div className="mx-auto max-w-5xl px-4 flex items-stretch">
          <Link
            href="/checkin"
            className="min-h-14 pr-4 flex items-center text-base text-on-plum-2 hover:text-cream focus-visible:!outline-cream transition-colors duration-150"
          >
            ← ลงเวลา
          </Link>
          <div className="flex-1 border-l border-plum-3 pl-4 py-2 flex items-center justify-end gap-3">
            <span className="text-sm text-on-plum-2">ตรวจร้าน</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-inbaan-wordmark-cream-96.png" alt="ในบ้าน" width={73} height={40} className="h-10 w-auto shrink-0" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-6 flex flex-col gap-8">
        {/* Title + actions */}
        <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h1 className="font-head text-3xl leading-normal text-charcoal break-words">ตรวจร้านเปิด-ปิด</h1>
            <p className="text-base text-subtle mt-1" role="status">
              {lastSyncedTime ? (
                <>
                  ข้อมูลจากฟอร์ม อัปเดตล่าสุด <span className="font-num">{format(lastSyncedTime, "HH:mm")}</span> น.
                </>
              ) : (
                "กำลังโหลดข้อมูลจากฟอร์ม…"
              )}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap md:justify-end">
            <Link
              href={GOOGLE_FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-12 px-5 flex items-center justify-center bg-charcoal hover:bg-charcoal-2 text-cream text-base font-semibold transition-colors duration-150"
            >
              เปิดฟอร์มเปิด-ปิดร้าน
            </Link>
            <button
              type="button"
              onClick={() => setShowEspressoModal(true)}
              className="min-h-12 px-4 border border-plum text-plum hover:bg-paper-2 text-base font-semibold transition-colors duration-150"
            >
              บันทึกช็อตกาแฟ
            </button>
          </div>
        </section>

        {/* Today: did the forms arrive? */}
        <section aria-labelledby="today-h" className="border border-charcoal grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="px-4 py-3 bg-plum text-cream flex flex-col justify-center">
            <h2 id="today-h" className="text-base font-semibold">วันนี้</h2>
            <p className="text-sm text-on-plum-2">{format(new Date(), "EEEE d MMMM", { locale: th })}</p>
          </div>
          {[
            { label: "ฟอร์มเปิดร้าน", entry: todayStatus?.opening },
            { label: "ฟอร์มปิดร้าน", entry: todayStatus?.closing }
          ].map(({ label, entry }) => (
            <div key={label} className="px-4 py-3 border-t sm:border-t-0 sm:border-l border-rule">
              <p className="text-sm text-neutral">{label}</p>
              {entry ? (
                <p className="text-base text-charcoal">
                  ได้รับแล้ว <span className="font-num">{format(entry.timestamp, "HH:mm")}</span> น. โดย {entry.staffName}
                </p>
              ) : (
                <p className="text-base text-subtle">ยังไม่ได้รับ</p>
              )}
            </div>
          ))}
        </section>

        {/* NFC zone check */}
        <section aria-labelledby="zone-h" className="flex flex-col gap-3">
          <div>
            <h2 id="zone-h" className="font-head text-2xl leading-normal text-charcoal">ตรวจตามโซน</h2>
            <p className="text-base text-subtle">
              {nfcStation
                ? `แตะแผ่น NFC ${nfcStation} แล้ว โซน ${activeZone || "BAR"}`
                : "เลือกโซน หรือแตะโทรศัพท์ที่แผ่น NFC ประจำจุด"}
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 border border-charcoal" role="group" aria-label="โซน">
            {ZONES.map((z, i) => {
              const on = activeZone === z.id;
              return (
                <button
                  key={z.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setActiveZone(on ? null : z.id)}
                  className={`min-h-12 px-3 text-base transition-colors duration-150 ${
                    i % 2 === 1 ? "border-l border-charcoal" : ""
                  } ${i >= 2 ? "border-t md:border-t-0 border-charcoal" : ""} ${
                    i === 2 ? "md:border-l" : ""
                  } ${on ? "bg-plum text-cream font-semibold" : "bg-cream text-charcoal hover:bg-paper-2"}`}
                >
                  {z.label}
                </button>
              );
            })}
          </div>

          {activeZone && ZONE_SOP_ITEMS[activeZone] && (
            <div className="border border-rule">
              <ul className="divide-y divide-rule">
                {ZONE_SOP_ITEMS[activeZone].map((itemText, idx) => {
                  const key = `${activeZone}_${idx}`;
                  const checked = Boolean(zoneCheckedItems[key]);
                  return (
                    <li key={key}>
                      <label className="min-h-12 px-4 py-3 flex items-start gap-3 cursor-pointer hover:bg-paper-2 transition-colors duration-150">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setZoneCheckedItems((prev) => ({ ...prev, [key]: !prev[key] }))
                          }
                          className="mt-1 size-5 shrink-0 accent-plum"
                        />
                        <span className="text-base text-charcoal">{itemText}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div className="border-t border-rule p-3 flex justify-end">
                <button
                  type="button"
                  onClick={handleZoneSopSubmit}
                  disabled={zoneSubmitting}
                  className="min-h-12 px-5 bg-plum hover:bg-plum-2 text-cream text-base font-semibold transition-colors duration-150 disabled:opacity-60"
                >
                  {zoneSubmitting ? "กำลังบันทึก…" : `ยืนยันการตรวจโซน${ZONES.find((z) => z.id === activeZone)?.label || ""}`}
                </button>
              </div>
            </div>
          )}
        </section>

        {error && (
          <div role="alert" className="border border-error px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-base text-error">{error}</p>
            <button
              type="button"
              onClick={fetchData}
              className="min-h-12 px-4 border border-error text-error text-base font-semibold hover:bg-paper-2 transition-colors duration-150"
            >
              ลองใหม่
            </button>
          </div>
        )}

        {/* Month: figures, then the calendar */}
        <section aria-labelledby="month-h" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="month-h" className="font-head text-2xl leading-normal text-charcoal">ประจำเดือน</h2>
            <div className="flex flex-wrap items-center gap-2">
              {availableMonths.length > 0 && (
                <label className="flex items-center gap-2">
                  <span className="text-sm text-neutral">เดือน</span>
                  <select
                    value={selectedMonth}
                    onChange={(e) => {
                      setSelectedMonth(e.target.value);
                      setSelectedDayFilter(null);
                    }}
                    className="min-h-12 px-3 bg-cream border border-charcoal text-base text-charcoal outline-none focus-visible:border-plum cursor-pointer"
                  >
                    {availableMonths.map((m) => (
                      <option key={m} value={m}>
                        {format(parse(m, "MMMM yyyy", new Date()), "MMMM yyyy", { locale: th })}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="button"
                aria-pressed={isAutoSync}
                onClick={() => setIsAutoSync(!isAutoSync)}
                className={`min-h-12 px-4 border text-base transition-colors duration-150 ${
                  isAutoSync ? "border-plum bg-plum text-cream" : "border-charcoal text-charcoal hover:bg-paper-2"
                }`}
              >
                {isAutoSync ? "อัปเดตอัตโนมัติ เปิด" : "อัปเดตอัตโนมัติ ปิด"}
              </button>
              <button
                type="button"
                onClick={fetchData}
                disabled={loading}
                className="min-h-12 px-4 border border-charcoal text-charcoal text-base hover:bg-paper-2 transition-colors duration-150 disabled:opacity-60"
              >
                {loading ? "กำลังโหลด…" : "โหลดใหม่"}
              </button>
            </div>
          </div>

          <dl className="grid grid-cols-2 lg:grid-cols-4 border border-rule">
            <div className="px-4 py-3">
              <dt className="text-sm text-neutral">ฟอร์มครบไม่มีจุดต้องตรวจ</dt>
              <dd className="font-num text-3xl text-charcoal tabular-nums">{stats.complianceScore}%</dd>
            </div>
            <div className="px-4 py-3 border-l border-rule">
              <dt className="text-sm text-neutral">รายงานทั้งหมด</dt>
              <dd className="font-num text-3xl text-charcoal tabular-nums">{stats.total}</dd>
              <dd className="text-sm text-subtle">
                เปิด <span className="font-num">{stats.opening}</span> ปิด <span className="font-num">{stats.closing}</span>
              </dd>
            </div>
            <div className="px-4 py-3 border-t lg:border-t-0 lg:border-l border-rule">
              <dt className="text-sm text-neutral">กะที่ยอดเงินข้ามกะไม่ตรง</dt>
              <dd className={`font-num text-3xl tabular-nums ${stats.mismatches > 0 ? "text-plum" : "text-charcoal"}`}>
                {stats.mismatches}
              </dd>
            </div>
            <div className="px-4 py-3 border-t border-l lg:border-t-0 border-rule">
              <dt className="text-sm text-neutral">เงินลิ้นชักต่างสะสม (บาท)</dt>
              <dd className={`font-num text-3xl tabular-nums ${stats.netMismatch !== 0 ? "text-plum" : "text-charcoal"}`}>
                {signed(stats.netMismatch)}
              </dd>
            </div>
          </dl>

          {/* Calendar */}
          <div className="border border-rule">
            <div className="grid grid-cols-7 border-b border-rule bg-paper-2">
              {["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map((d) => (
                <div key={d} className="py-2 text-center text-sm text-neutral">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`pad-${i}`} aria-hidden="true" />
              ))}
              {daysInMonth.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const dayStatus = dayStatusMap[dateStr];
                const isToday = todayStr === dateStr;
                const isSelected = selectedDayFilter === dateStr;
                const mark = (entry, word) =>
                  entry ? (
                    <span className={entry.hasDiscrepancies ? (isSelected ? "text-cream underline" : "text-plum underline") : ""}>
                      {word}
                    </span>
                  ) : (
                    <span className="opacity-0">{word}</span>
                  );
                const label = `${format(day, "d MMMM", { locale: th })} ${
                  dayStatus?.opening ? `เปิดร้านโดย ${dayStatus.opening.staffName}` : "ไม่มีฟอร์มเปิดร้าน"
                } ${dayStatus?.closing ? `ปิดร้านโดย ${dayStatus.closing.staffName}` : "ไม่มีฟอร์มปิดร้าน"}`;
                return (
                  <button
                    key={dateStr}
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={label}
                    title={label}
                    onClick={() => handleDayClick(dateStr)}
                    className={`min-h-16 px-2 py-1.5 flex flex-col items-start justify-between text-left -mt-px -ml-px border transition-colors duration-150 ${
                      isSelected
                        ? "bg-plum text-cream border-plum relative z-10"
                        : isToday
                        ? "bg-cream text-charcoal border-charcoal relative z-10"
                        : "bg-cream text-charcoal border-rule hover:bg-paper-2"
                    }`}
                  >
                    <span className={`font-num text-sm ${isToday && !isSelected ? "font-medium" : ""}`}>{day.getDate()}</span>
                    <span className="flex flex-col text-xs leading-tight">
                      {mark(dayStatus?.opening, "เปิด")}
                      {mark(dayStatus?.closing, "ปิด")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <p className="text-sm text-subtle">
            เปิด และ ปิด ในช่องวัน คือได้รับฟอร์มแล้ว ขีดเส้นใต้สีม่วงคือมีจุดต้องตรวจ แตะวันเพื่อดูเฉพาะวันนั้น
          </p>
        </section>

        {/* Log feed */}
        <section ref={logsContainerRef} aria-labelledby="log-h" className="flex flex-col gap-4 scroll-mt-20">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="log-h" className="font-head text-2xl leading-normal text-charcoal">
                {selectedDayFilter
                  ? `บันทึกวันที่ ${format(parse(selectedDayFilter, "yyyy-MM-dd", new Date()), "d MMMM yyyy", { locale: th })}`
                  : "บันทึกทั้งเดือน"}
              </h2>
              <p className="text-sm text-neutral">
                แสดง <span className="font-num">{filteredData.length}</span> จาก{" "}
                <span className="font-num">{currentMonthData.length}</span> รายการ
              </p>
            </div>
            {selectedDayFilter && (
              <button
                type="button"
                onClick={() => setSelectedDayFilter(null)}
                className="min-h-12 px-4 border border-plum text-plum text-base hover:bg-paper-2 transition-colors duration-150"
              >
                ดูทั้งเดือน
              </button>
            )}
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <label className="flex-1 max-w-md">
              <span className="block text-sm text-neutral mb-1">ค้นหา</span>
              <input
                type="search"
                placeholder="ชื่อพนักงาน วันที่ หรือหมายเหตุ"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={fieldCls}
              />
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 border border-charcoal" role="group" aria-label="กรองประเภท">
              {SHIFT_TABS.map((tab, i) => {
                const on = shiftFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setShiftFilter(tab.id)}
                    className={`min-h-12 px-3 text-base transition-colors duration-150 ${
                      i % 2 === 1 ? "border-l border-charcoal" : ""
                    } ${i >= 2 ? "border-t sm:border-t-0 border-charcoal" : ""} ${i === 2 ? "sm:border-l" : ""} ${
                      on ? "bg-charcoal text-cream font-semibold" : "bg-cream text-charcoal hover:bg-paper-2"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {loading && data.length === 0 ? (
            <div role="status" className="flex flex-col gap-3">
              <span className="sr-only">กำลังโหลดบันทึก</span>
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-40 bg-paper-2 border border-rule" />
              ))}
            </div>
          ) : filteredData.length === 0 ? (
            <div className="border border-rule px-4 py-8 text-center">
              <p className="text-lg font-semibold text-charcoal">ไม่พบบันทึกตามที่เลือก</p>
              <p className="text-base text-subtle mt-1">
                ถ้าส่งฟอร์มแล้วแต่ไม่ขึ้น ให้เช็กว่ากดส่งจนเห็นหน้ายืนยันของ Google Form
              </p>
              {selectedDayFilter && (
                <button
                  type="button"
                  onClick={() => setSelectedDayFilter(null)}
                  className="mt-4 min-h-12 px-4 border border-plum text-plum text-base hover:bg-paper-2 transition-colors duration-150"
                >
                  ดูบันทึกทั้งเดือน
                </button>
              )}
            </div>
          ) : (
            <ul className="flex flex-col gap-4">
              {filteredData.map((item) => {
                const isExpanded = !!expandedTasksMap[item.id];
                const displayedTasks = isExpanded ? item.tasks : item.tasks.slice(0, 4);
                const isOpening = item.type === "Opening";
                return (
                  <li
                    key={item.id}
                    className={`border bg-cream ${item.hasDiscrepancies ? "border-plum" : "border-rule"}`}
                  >
                    {/* Row 1: type, when, who, cash */}
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] border-b border-rule">
                      <div className="px-4 py-3 min-w-0">
                        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span
                            className={`px-2 text-sm font-semibold ${
                              isOpening ? "border border-charcoal text-charcoal" : "bg-charcoal text-cream"
                            }`}
                          >
                            {isOpening ? "เปิดร้าน" : "ปิดร้าน"}
                          </span>
                          <span className="text-sm text-neutral">
                            {format(item.timestamp, "d MMMM yyyy", { locale: th })}{" "}
                            <span className="font-num">{format(item.timestamp, "HH:mm")}</span> น.
                          </span>
                        </p>
                        <h3 className="text-xl font-semibold text-charcoal mt-2 break-words">{item.staffName}</h3>
                      </div>
                      {item.cashStr && (
                        <div className="px-4 py-3 border-l border-rule text-right">
                          <p className="text-sm text-neutral">{isOpening ? "เงินทอนเปิดร้าน" : "เงินสดปิดร้าน"}</p>
                          <p className="font-num text-2xl text-charcoal tabular-nums">
                            {item.cash !== null ? item.cash.toLocaleString() : item.cashStr}
                            <span className="text-sm text-neutral"> บาท</span>
                          </p>
                        </div>
                      )}
                    </div>

                    {item.warnings.length > 0 && (
                      <div className="px-4 py-3 bg-paper-2 border-b border-rule">
                        <p className="text-base font-semibold text-plum">
                          จุดต้องตรวจ <span className="font-num">{item.warnings.length}</span> รายการ
                        </p>
                        <ul className="mt-1 list-disc pl-5 text-base text-charcoal marker:text-plum">
                          {item.warnings.map((w, idx) => (
                            <li key={idx}>{w.message}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <div className="px-4 py-3">
                        <p className="text-sm text-neutral">
                          งานที่ติ๊กแล้ว <span className="font-num">{item.tasks.length}</span> รายการ
                        </p>
                        {item.tasks.length > 0 ? (
                          <ul className="mt-2 flex flex-col gap-1.5 list-disc pl-5 marker:text-plum">
                            {displayedTasks.map((t, idx) => (
                              <li key={idx} className="text-base text-charcoal break-words">
                                {t}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 text-base text-subtle">ไม่มีรายการงาน</p>
                        )}
                        {item.tasks.length > 4 && (
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            onClick={() => toggleTaskExpand(item.id)}
                            className="mt-2 min-h-12 text-base font-semibold text-plum underline-offset-4 hover:underline"
                          >
                            {isExpanded ? "ย่อรายการ" : `ดูทั้งหมด ${item.tasks.length} รายการ`}
                          </button>
                        )}
                      </div>

                      <div className="px-4 py-3 border-t md:border-t-0 md:border-l border-rule flex flex-col gap-3">
                        <div>
                          <p className="text-sm text-neutral">หมายเหตุ</p>
                          <p className={`text-base ${item.note ? "text-charcoal" : "text-subtle"} break-words`}>
                            {item.note || "ไม่มี"}
                          </p>
                        </div>
                        {item.coffeeCleaner && (
                          <div>
                            <p className="text-sm text-neutral">เวรล้างถังน้ำกาแฟ</p>
                            <p className="text-base text-charcoal">{item.coffeeCleaner}</p>
                          </div>
                        )}
                        {item.nightDefects && (
                          <div>
                            <p className="text-sm text-neutral">จุดไม่เรียบร้อยจากกะก่อนหน้า</p>
                            <p className="text-base text-charcoal break-words">{item.nightDefects}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {item.photos.length > 0 && (
                      <div className="px-4 py-3 border-t border-rule">
                        <p className="text-sm text-neutral mb-2">
                          รูปหลักฐาน <span className="font-num">{item.photos.length}</span> รูป
                        </p>
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2">
                          {item.photos.map((photo, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setSelectedImage(photo.full)}
                              aria-label={`เปิดรูปหลักฐานที่ ${i + 1}`}
                              className="aspect-square bg-paper-3 border border-rule hover:border-plum transition-colors duration-150 overflow-clip"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={photo.thumbnail}
                                alt=""
                                loading="lazy"
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.target.style.display = "none";
                                }}
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      {/* Espresso calibration (NFC tag ESPRESSO or header button) */}
      <AnimatePresence>
        {showEspressoModal && (
          <motion.div
            key="espresso"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="brand-v2 !bg-charcoal/50 fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="espresso-h"
          >
            <div className="w-full max-w-md bg-cream border border-charcoal max-h-[92vh] overflow-y-auto">
              <div className="flex items-stretch bg-plum text-cream">
                <h3 id="espresso-h" className="flex-1 px-4 py-3 text-lg font-semibold">บันทึกช็อตกาแฟประจำวัน</h3>
                <button
                  type="button"
                  onClick={() => setShowEspressoModal(false)}
                  className="min-w-14 border-l border-plum-3 text-base text-on-plum-2 hover:text-cream focus-visible:!outline-cream transition-colors duration-150"
                >
                  ปิด
                </button>
              </div>
              <form onSubmit={handleEspressoSubmit} className="p-4 flex flex-col gap-4">
                <label>
                  <span className="block text-sm text-neutral mb-1">ชื่อบาริสต้า</span>
                  <input
                    type="text"
                    required
                    placeholder="ชื่อเล่น"
                    value={espressoForm.staffName}
                    onChange={(e) => setEspressoForm({ ...espressoForm, staffName: e.target.value })}
                    className={fieldCls}
                  />
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { k: "dose", label: "Dose (กรัม)", step: "0.1" },
                    { k: "yieldWeight", label: "Yield (กรัม)", step: "0.1" },
                    { k: "shotTime", label: "เวลา (วินาที)", step: "1" }
                  ].map((f) => (
                    <label key={f.k}>
                      <span className="block text-sm text-neutral mb-1">{f.label}</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step={f.step}
                        required
                        value={espressoForm[f.k]}
                        onChange={(e) => setEspressoForm({ ...espressoForm, [f.k]: e.target.value })}
                        className={`${fieldCls} font-num text-center`}
                      />
                    </label>
                  ))}
                </div>
                <label>
                  <span className="block text-sm text-neutral mb-1">รสชาติและครีม่า</span>
                  <input
                    type="text"
                    value={espressoForm.tasteNotes}
                    onChange={(e) => setEspressoForm({ ...espressoForm, tasteNotes: e.target.value })}
                    className={fieldCls}
                  />
                </label>
                <label>
                  <span className="block text-sm text-neutral mb-1">การปรับเบอร์บด</span>
                  <input
                    type="text"
                    value={espressoForm.grinderAdjust}
                    onChange={(e) => setEspressoForm({ ...espressoForm, grinderAdjust: e.target.value })}
                    className={fieldCls}
                  />
                </label>
                <button
                  type="submit"
                  disabled={espressoSubmitting}
                  className="w-full min-h-14 bg-charcoal hover:bg-charcoal-2 text-cream text-lg font-semibold transition-colors duration-150 disabled:opacity-60"
                >
                  {espressoSubmitting ? "กำลังบันทึก…" : "บันทึกผลช็อต"}
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Photo viewer (Google Drive preview or image) */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            key="photo"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            onClick={() => setSelectedImage(null)}
            className="brand-v2 !bg-charcoal/80 fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="photo-h"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-4xl h-[85vh] bg-cream border border-charcoal flex flex-col"
            >
              <div className="flex items-stretch border-b border-rule">
                <h3 id="photo-h" className="flex-1 px-4 py-3 text-base font-semibold text-charcoal">รูปหลักฐาน</h3>
                <button
                  type="button"
                  onClick={() => setSelectedImage(null)}
                  className="min-w-14 px-4 border-l border-rule text-base text-charcoal hover:bg-paper-2 transition-colors duration-150"
                >
                  ปิด
                </button>
              </div>
              <div className="flex-1 min-h-0 bg-paper-2 p-2 flex items-center justify-center">
                {selectedImage.includes("drive.google.com") ? (
                  <iframe src={selectedImage} title="รูปหลักฐาน" className="w-full h-full border-0" allow="autoplay" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selectedImage} alt="รูปหลักฐาน" className="max-w-full max-h-full object-contain" />
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <NavigationDock />
    </div>
    </MotionConfig>
  );
}
