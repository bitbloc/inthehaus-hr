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
        return "bg-paper-2 text-plum border-plum dark:text-plum";
    }
    if (t.includes('hardwareissue') || t.includes('foodsafetyrisk') || t.includes('supplyshortage')) {
        return "bg-paper-2 text-error border-error dark:text-error";
    }
    if (t.includes('sopfail')) {
        return "bg-purple-500/15 text-purple-800 border-purple-300/80 dark:text-purple-300";
    }
    if (t.includes('hygienealert') || t.includes('storagerisk') || t.includes('coldchainbreak')) {
        return "bg-paper-2 text-plum border-plum dark:text-plum";
    }
    if (t.includes('storagesuccess')) {
        return "bg-paper-2 text-plum border-plum dark:text-plum";
    }
    if (t.includes('servicestandard') || t.includes('salespitch') || t.includes('marketingidea')) {
        return "bg-paper-2 text-plum border-plum dark:text-plum";
    }
    return "bg-cream text-charcoal border-rule";
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
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-charcoal p-6 text-cream border border-charcoal gap-4">
                <div className="space-y-1">
                    <h3 className="text-base font-semibold text-cream flex items-center gap-2">
                                                บันทึกเหตุการณ์ร้าน
                    </h3>
                    <p className="text-cream/60 text-xs mt-1">
                        สืบค้น ติดตามปัญหา และสรุปสถิติแฮชแท็กของน้องยูซุรายเดือน
                    </p>
                </div>

                {/* Month Picker & Refresh */}
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <div className="flex items-center gap-2 bg-cream text-charcoal px-3 py-1.5 border border-charcoal flex-1 md:flex-initial">
                                                <select
                            value={selectedMonth}
                            onChange={(e) => handleMonthChange(e.target.value)}
                            className="bg-transparent text-xs font-num font-semibold outline-none cursor-pointer pr-2 w-full"
                        >
                            {availableMonths.map((m) => (
                                <option key={m} value={m} className="bg-cream text-charcoal">
                                    {formatMonthLabel(m)} ({m})
                                </option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={() => fetchHashtagsData()}
                        disabled={loading}
                        className="bg-cream hover:bg-cream text-charcoal border border-charcoal transition-colors duration-150  disabled:opacity-50 min-h-11 px-3 text-sm font-semibold underline-offset-4 hover:underline"
                        title="รีเฟรชข้อมูล"
                    >รีเฟรช</button>
                </div>
            </div>

            {/* 2. Hashtag Filter Pills */}
            <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-neutral">
                        หมวดเรื่องเดือนนี้ ({hashtags.length} แท็ก)
                    </span>
                    {selectedTag !== "ALL" && (
                        <button
                            onClick={() => handleTagClick("ALL")}
                            className="text-xs font-semibold text-plum hover:underline cursor-pointer"
                        >
                            แสดงทุกแฮชแท็ก
                        </button>
                    )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                    {/* ALL button */}
                    <button
                        onClick={() => handleTagClick("ALL")}
                        className={`px-3 py-1.5 text-xs font-num font-semibold border transition-colors duration-150 cursor-pointer ${
 selectedTag === "ALL"
 ? "bg-charcoal text-cream border-charcoal "
 : "bg-cream hover:bg-cream border-rule text-charcoal"
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
                                className={`px-2.5 py-1.5  text-xs font-num font-semibold border transition-colors duration-150 flex items-center gap-1.5 cursor-pointer ${
                                    isSelected
                                        ? "bg-plum text-cream border-charcoal "
                                        : `${badgeStyle} hover:opacity-90`
                                }`}
                            >
                                <span>{h.tag}</span>
                                <span className={`text-xs px-1.5 py-0.2 ${isSelected ? "bg-cream/30 text-cream" : "bg-charcoal/10 text-charcoal"}`}>
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
                <div className="flex items-center gap-2 bg-cream border border-rule px-3 py-2 flex-1 max-w-md">
                                        <input
                        type="text"
                        placeholder="ค้นหาข้อความ หรือชื่อพนักงาน..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-transparent border-none outline-none text-xs font-num text-charcoal w-full placeholder:text-neutral"
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery("")} className="text-xs text-neutral hover:text-charcoal min-h-11 px-3 text-sm font-semibold underline-offset-4 hover:underline">ล้าง</button>
                    )}
                </div>

                {/* AI Summary Trigger Button */}
                <button
                    onClick={handleGenerateAiSummary}
                    disabled={summaryLoading || filteredRecords.length === 0}
                    className="py-2.5 px-4 bg-cream hover:bg-cream border-2 border-charcoal font-num font-semibold text-xs text-charcoal transition-colors duration-150 tactile-btn flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                    {summaryLoading ? (
                        <>
                            <span>AI กำลังวิเคราะห์...</span>
                        </>
                    ) : (
                        <>
                                                        <span>วิเคราะห์ & สรุปประเด็นด้วย AI</span>
                        </>
                    )}
                </button>
            </div>

            {/* 4. AI Executive Summary Presentation Card */}
            {summaryError && (
                <div className="p-4 bg-paper-2 border border-error text-error text-xs font-num">
                    {summaryError}
                </div>
            )}

            {aiSummary && (
                <Card className="border-2 border-plum bg-cream p-5 relative overflow-hidden space-y-4">
                    <div className="h-1 w-full bg-plum absolute top-0 inset-x-0" />

                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-rule pb-3">
                        <div className="flex items-center gap-2">
                            <span className="text-lg"></span>
                            <div>
                                <h4 className="text-sm font-semibold text-charcoal">
                                    สรุปจาก AI · {selectedTag === 'ALL' ? 'ภาพรวม' : selectedTag}
                                </h4>
                                <span className="text-xs text-neutral">
                                    ประจำเดือน {formatMonthLabel(selectedMonth)} · จากข้อมูลจริง {filteredRecords.length} รายการ
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto">
                            {aiSummary.severityLevel && (
                                <span className={`text-xs font-num font-semibold px-2 py-0.5 border ${
 aiSummary.severityLevel === 'HIGH' ? 'bg-paper-2 text-error border-error' :
 aiSummary.severityLevel === 'MEDIUM' ? 'bg-paper-2 text-plum border-plum' :
 'bg-paper-2 text-plum border-plum'
 }`}>
                                    SEVERITY: {aiSummary.severityLevel}
                                </span>
                            )}
                            <button
                                onClick={handleCopySummary}
                                className="px-2.5 py-1 bg-cream hover:bg-cream border border-rule text-xs font-semibold text-charcoal transition-colors flex items-center gap-1 tactile-btn-sm"
                            >
                                {copied ? "คัดลอกแล้ว" : "คัดลอกสรุป"}
                            </button>
                        </div>
                    </div>

                    {/* Executive Summary Paragraph */}
                    <div className="p-3.5 bg-cream border border-rule">
                        <p className="text-xs text-charcoal leading-relaxed">
                            {aiSummary.executiveSummary}
                        </p>
                    </div>

                    {/* 2-Column Insight Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Key Incidents */}
                        {aiSummary.keyIncidents && aiSummary.keyIncidents.length > 0 && (
                            <div className="space-y-2">
                                <span className="text-xs font-semibold text-neutral block">
                                    เหตุการณ์สำคัญที่ตรวจพบ
                                </span>
                                <ul className="space-y-1.5">
                                    {aiSummary.keyIncidents.map((inc, i) => (
                                        <li key={i} className="text-xs text-charcoal flex items-start gap-2 bg-paper-2 p-2 border border-rule">
                                            <span className="font-num font-semibold text-plum">{i + 1}.</span>
                                            <span>{inc}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Actionable Recommendations */}
                        {aiSummary.recommendations && aiSummary.recommendations.length > 0 && (
                            <div className="space-y-2">
                                <span className="text-xs font-semibold text-neutral block">
                                    ข้อเสนอแนะสำหรับฝ่ายบริหาร
                                </span>
                                <ul className="space-y-1.5">
                                    {aiSummary.recommendations.map((rec, i) => (
                                        <li key={i} className="text-xs text-charcoal flex items-start gap-2 bg-paper-2 p-2 border border-rule">
                                            <span className="font-num font-semibold text-charcoal"></span>
                                            <span>{rec}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>

                    {/* Recurring Patterns & Root Cause */}
                    {(aiSummary.recurringPatterns || aiSummary.rootCauseAnalysis) && (
                        <div className="pt-2 border-t border-rule grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            {aiSummary.recurringPatterns && (
                                <div>
                                    <span className="text-xs font-semibold text-neutral block mb-0.5">
                                        บุคคลหรือปัจจัยที่พบซ้ำ:
                                    </span>
                                    <p className="text-charcoal leading-relaxed">{aiSummary.recurringPatterns}</p>
                                </div>
                            )}
                            {aiSummary.rootCauseAnalysis && (
                                <div>
                                    <span className="text-xs font-semibold text-neutral block mb-0.5">
                                        สาเหตุต้นตอ:
                                    </span>
                                    <p className="text-charcoal leading-relaxed">{aiSummary.rootCauseAnalysis}</p>
                                </div>
                            )}
                        </div>
                    )}
                </Card>
            )}

            {/* 5. Incident & Chat Log Feed */}
            <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-semibold text-neutral">
                        รายการบันทึก ({filteredRecords.length} รายการ)
                    </span>
                    <span className="text-xs text-neutral">
                        เดือน {formatMonthLabel(selectedMonth)}
                    </span>
                </div>

                {loading ? (
                    <div className="py-16 text-center text-neutral font-num text-xs">
                        <p>กำลังค้นหาข้อมูลแฮชแท็ก...</p>
                    </div>
                ) : filteredRecords.length === 0 ? (
                    <Card className="py-16 text-center text-neutral font-num space-y-2">
                        <span className="text-2xl"></span>
                        <p className="text-xs font-semibold text-charcoal">ไม่พบรายการบันทึกในเดือนนี้</p>
                        <p className="text-xs text-neutral">ลองเลือกเดือนอื่น หรือเปลี่ยนแฮชแท็กที่ต้องการค้นหา</p>
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
                                <Card key={item.id} className="p-4 hover:border-charcoal transition-colors space-y-2.5">
                                    {/* Top row: Date, Sender & Badges */}
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-2">
                                        <div className="flex items-center gap-2">
                                            {item.senderPhoto ? (
                                                <img
                                                    src={item.senderPhoto}
                                                    alt=""
                                                    className="w-6 h-6 object-cover border border-rule"
                                                />
                                            ) : (
                                                <div className="w-6 h-6 bg-cream flex items-center justify-center text-xs font-semibold text-charcoal border border-rule">
                                                    {(item.senderName || "U").slice(0, 1)}
                                                </div>
                                            )}
                                            <div>
                                                <span className="text-xs font-semibold text-charcoal mr-2">
                                                    {item.senderName}
                                                </span>
                                                {item.senderPosition && (
                                                    <span className="text-xs font-num text-neutral bg-cream px-1.5 py-0.5 border border-rule">
                                                        {item.senderPosition}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1.5">
                                            <span className="text-xs text-neutral">
                                                {formattedDate} {formattedTime} น.
                                            </span>
                                        </div>
                                    </div>

                                    {/* Message Content */}
                                    <p className="text-xs text-charcoal leading-relaxed whitespace-pre-wrap">
                                        {item.content}
                                    </p>

                                    {/* Hashtag Badges row */}
                                    {item.tags && item.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1 pt-1">
                                            {item.tags.map((t) => (
                                                <span
                                                    key={t}
                                                    onClick={() => handleTagClick(t)}
                                                    className={`text-xs font-num font-semibold px-2 py-0.5 border cursor-pointer hover:underline ${getTagBadgeStyle(t)}`}
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

