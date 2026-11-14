"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Card } from "./ui/Card";
import { Icons } from "./ui/HausIcon";

const THAI_MONTH_NAMES = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
];

function formatMonthLabel(monthStr) {
    if (!monthStr || !monthStr.includes("-")) return monthStr;
    const [yearStr, mStr] = monthStr.split("-");
    const mIndex = parseInt(mStr, 10) - 1;
    const mName = THAI_MONTH_NAMES[mIndex] || monthStr;
    return `${mName} ${yearStr}`;
}

function getTagBadgeStyle(tag) {
    const t = tag.toLowerCase();
    if (t.includes('staffinsight')) {
        return "bg-amber-500/15 text-amber-800 border-amber-300/80 dark:text-amber-300";
    }
    if (t.includes('hardwareissue') || t.includes('foodsafetyrisk') || t.includes('supplyshortage')) {
        return "bg-rose-500/15 text-rose-800 border-rose-300/80 dark:text-rose-300";
    }
    if (t.includes('sopfail')) {
        return "bg-purple-500/15 text-purple-800 border-purple-300/80 dark:text-purple-300";
    }
    if (t.includes('hygienealert') || t.includes('storagerisk') || t.includes('coldchainbreak')) {
        return "bg-orange-500/15 text-orange-800 border-orange-300/80 dark:text-orange-300";
    }
    if (t.includes('storagesuccess')) {
        return "bg-emerald-500/15 text-emerald-800 border-emerald-300/80 dark:text-emerald-300";
    }
    if (t.includes('servicestandard') || t.includes('salespitch') || t.includes('marketingidea')) {
        return "bg-sky-500/15 text-sky-800 border-sky-300/80 dark:text-sky-300";
    }
    return "bg-rams-bg text-rams-ink border-rams-rule-light";
}

export default function HashtagIncidentManager() {
    const [selectedMonth, setSelectedMonth] = useState("");
    const [availableMonths, setAvailableMonths] = useState([]);
    const [selectedTag, setSelectedTag] = useState("ALL");
    const [hashtags, setHashtags] = useState([]);
    const [records, setRecords] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(false);

    // AI Summary State
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [aiSummary, setAiSummary] = useState(null);
    const [summaryError, setSummaryError] = useState(null);
    const [copied, setCopied] = useState(false);

    const fetchHashtagsData = useCallback(async (monthToFetch = null, tagToFetch = null) => {
        setLoading(true);
        try {
            const m = monthToFetch || selectedMonth;
            const t = tagToFetch !== null ? tagToFetch : selectedTag;
            const queryParams = new URLSearchParams();
            if (m) queryParams.set("month", m);
            if (t && t !== "ALL") queryParams.set("tag", t);
            if (searchQuery.trim()) queryParams.set("search", searchQuery.trim());

            const res = await fetch(`/api/yuzu/hashtags?${queryParams.toString()}`);
            const data = await res.json();

            if (data.success) {
                if (!selectedMonth && data.selectedMonth) {
                    setSelectedMonth(data.selectedMonth);
                }
                setAvailableMonths(data.availableMonths || []);
                setHashtags(data.hashtags || []);
                setRecords(data.records || []);
            }
        } catch (err) {
            console.error("Fetch hashtags failed:", err);
        } finally {
            setLoading(false);
        }
    }, [selectedMonth, selectedTag, searchQuery]);

    useEffect(() => {
        fetchHashtagsData();
    }, [selectedMonth, selectedTag, fetchHashtagsData]);

    const handleMonthChange = (newMonth) => {
        setSelectedMonth(newMonth);
        setAiSummary(null); // Reset summary when month changes
    };

    const handleTagClick = (tag) => {
        setSelectedTag(tag);
        setAiSummary(null); // Reset summary when tag changes
    };

    const handleGenerateAiSummary = async () => {
        if (!records || records.length === 0) return;
        setSummaryLoading(true);
        setSummaryError(null);

        try {
            const res = await fetch("/api/yuzu/hashtags", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    month: selectedMonth,
                    tag: selectedTag === "ALL" ? "สรุปทุกแฮชแท็ก" : selectedTag,
                    records: records
                })
            });

            const data = await res.json();
            if (data.success && data.summary) {
                setAiSummary(data.summary);
            } else {
                setSummaryError(data.error || "ไม่สามารถสร้างบทสรุป AI ได้ในขณะนี้");
            }
        } catch (err) {
            setSummaryError("เกิดข้อผิดพลาดในการเชื่อมต่อ AI: " + err.message);
        } finally {
            setSummaryLoading(false);
        }
    };

    const handleCopySummary = () => {
        if (!aiSummary) return;
        const text = `=== สรุปประเด็น ${selectedTag} เดือน ${formatMonthLabel(selectedMonth)} ===\n\n` +
            `ภาพรวม:\n${aiSummary.executiveSummary}\n\n` +
            `เหตุการณ์สำคัญ:\n${(aiSummary.keyIncidents || []).map((inc, i) => `${i + 1}. ${inc}`).join('\n')}\n\n` +
            `ประเด็นเกิดซ้ำ/ผู้เกี่ยวข้อง:\n${aiSummary.recurringPatterns || '-'}\n\n` +
            `ข้อเสนอแนะ:\n${(aiSummary.recommendations || []).map((rec, i) => `${i + 1}. ${rec}`).join('\n')}`;

        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const filteredRecords = useMemo(() => {
        if (!searchQuery.trim()) return records;
        const q = searchQuery.toLowerCase();
        return records.filter(r =>
            r.content.toLowerCase().includes(q) ||
            (r.senderName && r.senderName.toLowerCase().includes(q))
        );
    }, [records, searchQuery]);

    return (
        <div className="space-y-6">
            {/* 1. Header Banner & Filter Bar */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-rams-ink p-6 rounded-sm text-rams-panel border border-rams-rule gap-4">
                <div className="space-y-1">
                    <h3 className="text-base font-mono font-bold uppercase tracking-widest text-rams-panel flex items-center gap-2">
                        <Icons.Audit size={20} className="text-rams-orange" />
                        Hashtag & Incident Analytics // บันทึกเหตุการณ์ร้าน
                    </h3>
                    <p className="text-rams-panel/60 text-xs font-mono uppercase mt-1">
                        สืบค้น ติดตามปัญหา และสรุปสถิติแฮชแท็กของน้องยูซุรายเดือน
                    </p>
                </div>

                {/* Month Picker & Refresh */}
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <div className="flex items-center gap-2 bg-rams-panel text-rams-ink px-3 py-1.5 rounded-sm border border-rams-rule flex-1 md:flex-initial">
                        <Icons.Calendar size={14} className="text-rams-ink-muted shrink-0" />
                        <select
                            value={selectedMonth}
                            onChange={(e) => handleMonthChange(e.target.value)}
                            className="bg-transparent text-xs font-mono font-bold uppercase outline-none cursor-pointer pr-2 w-full"
                        >
                            {availableMonths.map((m) => (
                                <option key={m} value={m} className="bg-rams-panel text-rams-ink">
                                    {formatMonthLabel(m)} ({m})
                                </option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={() => fetchHashtagsData()}
                        disabled={loading}
                        className="p-2 bg-rams-panel hover:bg-rams-bg text-rams-ink border border-rams-rule rounded-sm transition-all active:scale-95 disabled:opacity-50"
                        title="รีเฟรชข้อมูล"
                    >
                        <Icons.Refresh size={14} className={loading ? "animate-spin" : ""} />
                    </button>
                </div>
            </div>

            {/* 2. Hashtag Filter Pills */}
            <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-extrabold text-rams-ink-muted uppercase tracking-widest">
                        Hashtag Categories // หมวดหมู่เรื่องราวในเดือนนี้ ({hashtags.length} แท็ก)
                    </span>
                    {selectedTag !== "ALL" && (
                        <button
                            onClick={() => handleTagClick("ALL")}
                            className="text-[10px] font-mono font-bold text-rams-orange hover:underline cursor-pointer"
                        >
                            แสดงทุกแฮชแท็ก
                        </button>
                    )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                    {/* ALL button */}
                    <button
                        onClick={() => handleTagClick("ALL")}
                        className={`px-3 py-1.5 rounded-sm text-xs font-mono font-bold border transition-all cursor-pointer ${
                            selectedTag === "ALL"
                                ? "bg-rams-ink text-rams-panel border-rams-rule shadow-sm"
                                : "bg-rams-bg hover:bg-rams-panel border-rams-rule-light text-rams-ink"
                        }`}
                    >
                        # ทั้งหมด ({records.length})
                    </button>

                    {hashtags.map((h) => {
                        const isSelected = selectedTag === h.tag;
                        const badgeStyle = getTagBadgeStyle(h.tag);

                        return (
                            <button
                                key={h.tag}
                                onClick={() => handleTagClick(h.tag)}
                                className={`px-2.5 py-1.5 rounded-sm text-xs font-mono font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                                    isSelected
                                        ? "bg-rams-orange text-rams-panel border-rams-rule shadow-sm"
                                        : `${badgeStyle} hover:opacity-90`
                                }`}
                            >
                                <span>{h.tag}</span>
                                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? "bg-white/30 text-white" : "bg-rams-ink/10 text-rams-ink"}`}>
                                    {h.count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </Card>

            {/* 3. Search & AI Summary Trigger Bar */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                {/* Search Bar */}
                <div className="flex items-center gap-2 bg-rams-panel border border-rams-rule-light rounded-sm px-3 py-2 flex-1 max-w-md">
                    <Icons.Search size={14} className="text-rams-ink-muted shrink-0" />
                    <input
                        type="text"
                        placeholder="ค้นหาข้อความ หรือชื่อพนักงาน..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-transparent border-none outline-none text-xs font-mono text-rams-ink w-full placeholder:text-rams-ink-muted"
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery("")} className="text-xs text-rams-ink-muted hover:text-rams-ink">✕</button>
                    )}
                </div>

                {/* AI Summary Trigger Button */}
                <button
                    onClick={handleGenerateAiSummary}
                    disabled={summaryLoading || filteredRecords.length === 0}
                    className="py-2.5 px-4 bg-rams-panel hover:bg-rams-bg border-2 border-rams-rule rounded-sm font-mono font-bold text-xs text-rams-ink transition-all active:translate-y-[1px] tactile-btn flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-sm"
                >
                    {summaryLoading ? (
                        <>
                            <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-rams-orange border-t-transparent" />
                            <span>AI กำลังวิเคราะห์...</span>
                        </>
                    ) : (
                        <>
                            <Icons.Yuzu size={15} className="text-rams-orange" />
                            <span>🤖 วิเคราะห์ & สรุปประเด็นด้วย AI</span>
                        </>
                    )}
                </button>
            </div>

            {/* 4. AI Executive Summary Presentation Card */}
            {summaryError && (
                <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-mono rounded-sm">
                    ⚠️ {summaryError}
                </div>
            )}

            {aiSummary && (
                <Card className="border-2 border-rams-orange bg-rams-panel p-5 relative overflow-hidden space-y-4 shadow-md">
                    <div className="h-1 w-full bg-rams-orange absolute top-0 inset-x-0" />

                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-rams-rule-light pb-3">
                        <div className="flex items-center gap-2">
                            <span className="text-lg">🤖</span>
                            <div>
                                <h4 className="text-sm font-mono font-extrabold text-rams-ink">
                                    AI Executive Briefing // บทสรุป {selectedTag === 'ALL' ? 'ภาพรวม' : selectedTag}
                                </h4>
                                <span className="text-[10px] font-mono text-rams-ink-muted">
                                    ประจำเดือน {formatMonthLabel(selectedMonth)} · จากข้อมูลจริง {filteredRecords.length} รายการ
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto">
                            {aiSummary.severityLevel && (
                                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-sm border ${
                                    aiSummary.severityLevel === 'HIGH' ? 'bg-red-500/15 text-red-700 border-red-300' :
                                    aiSummary.severityLevel === 'MEDIUM' ? 'bg-amber-500/15 text-amber-700 border-amber-300' :
                                    'bg-green-500/15 text-green-700 border-green-300'
                                }`}>
                                    SEVERITY: {aiSummary.severityLevel}
                                </span>
                            )}
                            <button
                                onClick={handleCopySummary}
                                className="px-2.5 py-1 bg-rams-bg hover:bg-rams-panel border border-rams-rule-light rounded-sm text-[10px] font-mono font-bold text-rams-ink transition-colors flex items-center gap-1 tactile-btn-sm"
                            >
                                {copied ? "✓ คัดลอกแล้ว" : "คัดลอกสรุป"}
                            </button>
                        </div>
                    </div>

                    {/* Executive Summary Paragraph */}
                    <div className="p-3.5 bg-rams-bg border border-rams-rule-light rounded-sm">
                        <p className="text-xs font-sans text-rams-ink leading-relaxed">
                            {aiSummary.executiveSummary}
                        </p>
                    </div>

                    {/* 2-Column Insight Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Key Incidents */}
                        {aiSummary.keyIncidents && aiSummary.keyIncidents.length > 0 && (
                            <div className="space-y-2">
                                <span className="text-[10px] font-mono font-extrabold text-rams-ink-muted uppercase tracking-wider block">
                                    🔍 เหตุการณ์สำคัญที่ตรวจพบ
                                </span>
                                <ul className="space-y-1.5">
                                    {aiSummary.keyIncidents.map((inc, i) => (
                                        <li key={i} className="text-xs font-sans text-rams-ink flex items-start gap-2 bg-rams-bg/50 p-2 rounded-sm border border-rams-rule-light">
                                            <span className="font-mono font-bold text-rams-orange">{i + 1}.</span>
                                            <span>{inc}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Actionable Recommendations */}
                        {aiSummary.recommendations && aiSummary.recommendations.length > 0 && (
                            <div className="space-y-2">
                                <span className="text-[10px] font-mono font-extrabold text-rams-ink-muted uppercase tracking-wider block">
                                    📌 ข้อเสนอแนะสำหรับฝ่ายบริหาร
                                </span>
                                <ul className="space-y-1.5">
                                    {aiSummary.recommendations.map((rec, i) => (
                                        <li key={i} className="text-xs font-sans text-rams-ink flex items-start gap-2 bg-rams-bg/50 p-2 rounded-sm border border-rams-rule-light">
                                            <span className="font-mono font-bold text-rams-green">✓</span>
                                            <span>{rec}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>

                    {/* Recurring Patterns & Root Cause */}
                    {(aiSummary.recurringPatterns || aiSummary.rootCauseAnalysis) && (
                        <div className="pt-2 border-t border-rams-rule-light grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-sans">
                            {aiSummary.recurringPatterns && (
                                <div>
                                    <span className="text-[10px] font-mono font-bold text-rams-ink-muted uppercase block mb-0.5">
                                        บุคคลหรือปัจจัยที่พบซ้ำ:
                                    </span>
                                    <p className="text-rams-ink leading-relaxed">{aiSummary.recurringPatterns}</p>
                                </div>
                            )}
                            {aiSummary.rootCauseAnalysis && (
                                <div>
                                    <span className="text-[10px] font-mono font-bold text-rams-ink-muted uppercase block mb-0.5">
                                        สาเหตุต้นตอ (Root Cause):
                                    </span>
                                    <p className="text-rams-ink leading-relaxed">{aiSummary.rootCauseAnalysis}</p>
                                </div>
                            )}
                        </div>
                    )}
                </Card>
            )}

            {/* 5. Incident & Chat Log Feed */}
            <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-mono font-extrabold text-rams-ink-muted uppercase tracking-widest">
                        Incident Records // รายการบันทึก ({filteredRecords.length} รายการ)
                    </span>
                    <span className="text-[10px] font-mono text-rams-ink-muted">
                        เดือน {formatMonthLabel(selectedMonth)}
                    </span>
                </div>

                {loading ? (
                    <div className="py-16 text-center text-rams-ink-muted font-mono text-xs">
                        <span className="animate-spin inline-block rounded-full h-5 w-5 border-2 border-rams-rule border-t-transparent mb-2" />
                        <p>กำลังค้นหาข้อมูลแฮชแท็ก...</p>
                    </div>
                ) : filteredRecords.length === 0 ? (
                    <Card className="py-16 text-center text-rams-ink-muted font-mono space-y-2">
                        <span className="text-2xl">📋</span>
                        <p className="text-xs font-bold text-rams-ink">ไม่พบรายการบันทึกในเดือนนี้</p>
                        <p className="text-[11px] text-rams-ink-muted">ลองเลือกเดือนอื่น หรือเปลี่ยนแฮชแท็กที่ต้องการค้นหา</p>
                    </Card>
                ) : (
                    <div className="space-y-2.5">
                        {filteredRecords.map((item) => {
                            const dateObj = new Date(item.created_at);
                            const formattedDate = dateObj.toLocaleDateString('th-TH', {
                                timeZone: 'Asia/Bangkok',
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric'
                            });
                            const formattedTime = dateObj.toLocaleTimeString('th-TH', {
                                timeZone: 'Asia/Bangkok',
                                hour: '2-digit',
                                minute: '2-digit'
                            });

                            return (
                                <Card key={item.id} className="p-4 hover:border-rams-rule transition-colors space-y-2.5">
                                    {/* Top row: Date, Sender & Badges */}
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rams-rule-light pb-2">
                                        <div className="flex items-center gap-2">
                                            {item.senderPhoto ? (
                                                <img
                                                    src={item.senderPhoto}
                                                    alt=""
                                                    className="w-6 h-6 rounded-full object-cover border border-rams-rule-light"
                                                />
                                            ) : (
                                                <div className="w-6 h-6 rounded-full bg-rams-bg flex items-center justify-center text-[10px] font-bold text-rams-ink border border-rams-rule-light">
                                                    {(item.senderName || "U").slice(0, 1)}
                                                </div>
                                            )}
                                            <div>
                                                <span className="text-xs font-bold text-rams-ink mr-2">
                                                    {item.senderName}
                                                </span>
                                                {item.senderPosition && (
                                                    <span className="text-[10px] font-mono text-rams-ink-muted bg-rams-bg px-1.5 py-0.5 rounded-sm border border-rams-rule-light">
                                                        {item.senderPosition}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[10px] font-mono text-rams-ink-muted">
                                                {formattedDate} {formattedTime} น.
                                            </span>
                                        </div>
                                    </div>

                                    {/* Message Content */}
                                    <p className="text-xs font-sans text-rams-ink leading-relaxed whitespace-pre-wrap">
                                        {item.content}
                                    </p>

                                    {/* Hashtag Badges row */}
                                    {item.tags && item.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1 pt-1">
                                            {item.tags.map((t) => (
                                                <span
                                                    key={t}
                                                    onClick={() => handleTagClick(t)}
                                                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-sm border cursor-pointer hover:underline ${getTagBadgeStyle(t)}`}
                                                >
                                                    {t}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

