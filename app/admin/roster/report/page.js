"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import { format, startOfWeek, addDays, parseISO } from "date-fns";
import { th } from "date-fns/locale";

function RosterPDFReportContent() {
    const searchParams = useSearchParams();
    const startParam = searchParams.get('start') || format(new Date(), 'yyyy-MM-dd');
    
    const [employees, setEmployees] = useState([]);
    const [shifts, setShifts] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [customPresets, setCustomPresets] = useState(() => {
        if (typeof window === 'undefined') return [];
        try {
            const saved = localStorage.getItem('roster_custom_presets');
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });

    const SYSTEM_STANDARD_PRESETS = [
        { start: '18:00', end: '22:30', name: 'INTHEHAUS', color: 'indigo', icon: '' },
        { start: '10:00', end: '00:30', name: 'ควบกะ 🔥', color: 'rose', icon: '🔥' },
        { start: '16:30', end: '00:30', name: 'กะค่ำ 🌙', color: 'sky', icon: '🌙' },
        { start: '10:00', end: '18:00', name: 'กะเช้า ☀️', color: 'amber', icon: '☀️' },
        { start: '10:00', end: '20:30', name: 'CHEF', color: 'emerald', icon: '' },
        { start: '12:30', end: '23:30', name: 'ผู้ช่วยครัว', color: 'violet', icon: '' },
        { start: '12:00', end: '20:00', name: 'กลางกะ', color: 'sky', icon: '' },
        { start: '12:30', end: '21:30', name: 'PART-TIME', color: 'rose', icon: '' },
    ];

    const PRESET_COLORS = [
        { id: 'sky', bg: 'bg-cream', text: 'text-charcoal', border: 'border-rule' },
        { id: 'amber', bg: 'bg-plum/10', text: 'text-plum', border: 'border-plum/30' },
        { id: 'indigo', bg: 'bg-charcoal text-cream', text: 'text-cream font-semibold', border: 'border-charcoal' },
        { id: 'rose', bg: 'bg-error/10', text: 'text-error', border: 'border-error/30' },
        { id: 'emerald', bg: 'bg-charcoal/10', text: 'text-charcoal', border: 'border-charcoal/30' },
        { id: 'violet', bg: 'bg-plum/10', text: 'text-plum', border: 'border-plum/30' },
        { id: 'slate', bg: 'bg-cream', text: 'text-neutral', border: 'border-rule' },
        { id: 'teal', bg: 'bg-charcoal/20', text: 'text-charcoal', border: 'border-charcoal/50' },
    ];
    const getPresetColor = (colorId) => PRESET_COLORS.find(c => c.id === colorId) || PRESET_COLORS[0];


    const allPresets = useMemo(() => {
        const presetsMap = new Map();
        SYSTEM_STANDARD_PRESETS.forEach((p, idx) => {
            presetsMap.set(p.name, { ...p, id: `sys_${idx}` });
        });

        (customPresets || []).forEach(cp => {
            const key = cp.name || cp.id;
            if (presetsMap.has(key)) {
                presetsMap.set(key, { ...presetsMap.get(key), ...cp });
            } else {
                presetsMap.set(key, { ...cp });
            }
        });

        return Array.from(presetsMap.values());
    }, [customPresets]);

    const weekStart = startOfWeek(parseISO(startParam), { weekStartsOn: 1 });
    const weekEnd = addDays(weekStart, 6);
    const dates = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
    const daysTitle = ["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์", "อาทิตย์"];

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            const startStr = format(weekStart, 'yyyy-MM-dd');
            const endStr = format(weekEnd, 'yyyy-MM-dd');

            const [empRes, shiftRes, transRes] = await Promise.all([
                supabase.from('employees').select('*').order('id'),
                supabase.from('shifts').select('*').order('start_time'),
                supabase.from('roster_transactions')
                    .select('*')
                    .gte('date', startStr)
                    .lte('date', endStr)
            ]);

            if (empRes.data) {
                const getPositionOrder = (position) => {
                    const pos = (position || '').toLowerCase().trim();
                    if (pos.includes('owner')) return 1;
                    if (pos.includes('cook') || pos.includes('kitchen')) return 2;
                    if (pos.includes('bar') || pos.includes('floor')) return 3;
                    return 4;
                };
                const sorted = [...empRes.data].sort((a, b) => {
                    const orderA = getPositionOrder(a.position);
                    const orderB = getPositionOrder(b.position);
                    if (orderA !== orderB) return orderA - orderB;
                    return (a.nickname || a.name || '').localeCompare(b.nickname || b.name || '', 'th');
                });
                setEmployees(sorted);
            }
            if (shiftRes.data) setShifts(shiftRes.data);
            if (transRes.data) setTransactions(transRes.data);
            setLoading(false);
        };

        fetchData();
    }, [startParam]);

    const getCellSlots = (empId, date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        return transactions.filter(t => t.employee_id === empId && t.date === dateStr);
    };

    const dailyOnDutyStats = useMemo(() => {
        return dates.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const workingTxs = (transactions || []).filter(t => t.date === dateStr && !t.is_off && t.status !== 'CANCELLED');
            const workingEmpIds = new Set(workingTxs.map(t => String(t.employee_id)));
            return {
                dateStr,
                count: workingEmpIds.size
            };
        });
    }, [transactions, dates]);

    const getShiftColorClass = (s, shiftObj) => {
        if (s.is_off) return 'bg-error/10 border-error/30 text-error font-semibold';

        const name = (shiftObj?.name || '').toLowerCase();
        const startClean = (s.custom_start_time || shiftObj?.start_time || '').slice(0, 5);
        const endClean = (s.custom_end_time || shiftObj?.end_time || '').slice(0, 5);

        if (name.includes('ควบ') || name.includes('double') || (startClean === '10:00' && endClean === '00:30')) {
            return 'bg-plum/10 border-plum/30 text-plum font-semibold';
        }
        if (name.includes('ค่ำ') || name.includes('ดึก') || name.includes('night') || (startClean === '16:30' && endClean === '00:30')) {
            return 'bg-charcoal text-cream border-charcoal font-semibold';
        }
        if (name.includes('inthehaus') || (startClean === '18:00' && endClean === '22:30')) {
            return 'bg-charcoal text-cream border-charcoal font-semibold';
        }
        if (name.includes('chef') || (startClean === '10:00' && endClean === '20:30')) {
            return 'bg-charcoal/10 border-charcoal/30 text-charcoal font-semibold';
        }
        if (name.includes('ครัว') || (startClean === '12:30' && endClean === '23:30')) {
            return 'bg-plum/10 border-plum/30 text-plum font-semibold';
        }
        if (name.includes('เช้า') || name.includes('morning') || (startClean === '10:00' && endClean === '18:00')) {
            return 'bg-plum/10 border-plum/30 text-plum font-semibold';
        }
        
        return 'bg-cream border-rule text-charcoal';
    };

    if (loading) return <div className="p-20 text-center font-semibold font-num text-neutral">GENERATING ROSTER REPORT...</div>;

    const printDateRangeStr = `${format(weekStart, 'dd/MM/yyyy')} - ${format(weekEnd, 'dd/MM/yyyy')}`;

    return (
        <div className="min-h-screen bg-cream text-charcoal p-6 md:p-10 font-num">
            {/* Header with Logo */}
            <div className="flex justify-between items-center border-b-2 border-charcoal pb-6 mb-6">
                <div className="flex items-center gap-4">
                    <img src="/logo.png" className="h-10 w-auto object-contain" alt="In The Haus Logo" onError={(e) => e.target.style.display = 'none'} />
                    <div>
                        <h1 className="text-lg font-semibold leading-none mb-1 text-charcoal">IN THE HAUS</h1>
                        <p className="text-xs font-semibold text-neutral">Weekly Work Schedule / ตารางงานรายสัปดาห์</p>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-lg font-semibold tracking-tight text-charcoal">{printDateRangeStr}</div>
                    <div className="text-xs font-semibold text-neutral mt-0.5">Generated: {format(new Date(), 'dd/MM/yyyy HH:mm')}</div>
                </div>
            </div>

            {/* Roster Grid Table */}
            <div className="overflow-x-auto border border-charcoal bg-cream">
                <table className="w-full text-xs text-left border-collapse">
                    <thead>
                        <tr className="bg-paper-2 text-charcoal border-b border-charcoal">
                            <th className="px-4 py-3 font-semibold border-r border-charcoal w-[180px]">พนักงาน / ตำแหน่ง</th>
                            {dates.map((date, i) => (
                                <th key={i} className="px-3 py-3 font-semibold text-center border-r border-rule min-w-[120px]">
                                    <div className="text-xs text-neutral">{daysTitle[i]}</div>
                                    <div className="text-xs font-semibold mt-0.5 text-charcoal">{format(date, 'dd/MM')}</div>
                                    <div className="text-xs font-semibold text-neutral mt-0.5">
                                        ON DUTY: {dailyOnDutyStats[i]?.count || 0}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-rule">
                        {employees.map((emp, empIdx) => (
                            <tr key={emp.id} className={`hover:bg-paper-2 transition-colors ${empIdx % 2 === 1 ? 'bg-paper-2' : 'bg-cream'}`}>
                                <td className="px-4 py-3 font-semibold text-charcoal border-r border-charcoal align-middle">
                                    <div className="text-xs font-semibold">{emp.nickname || emp.name}</div>
                                    <div className="text-xs text-neutral font-semibold mt-0.5">{emp.position}</div>
                                </td>
                                {dates.map((date, dateIdx) => {
                                    const slots = getCellSlots(emp.id, date);
                                    return (
                                        <td key={dateIdx} className="px-2 py-2 border-r border-rule align-top h-full min-h-[75px]">
                                            <div className="space-y-1.5 flex flex-col h-full justify-start">
                                                {slots.length === 0 ? (
                                                    <span className="text-neutral/40 text-xs m-auto block text-center font-normal">-</span>
                                                ) : (
                                                    slots.map((s, idx) => {
                                                        const shiftObj = shifts.find(sh => sh.id === s.shift_id);
                                                        const startClean = (s.custom_start_time || shiftObj?.start_time || '').slice(0, 5);
                                                        const endClean = (s.custom_end_time || shiftObj?.end_time || '').slice(0, 5);
                                                        const timeStr = startClean && endClean ? `${startClean}-${endClean}` : (shiftObj ? `${shiftObj.start_time.slice(0,5)}-${shiftObj.end_time.slice(0,5)}` : '');

                                                        const matchedPreset = (!s.is_off && startClean && endClean)
                                                            ? allPresets.find(p => (p.start || '').slice(0, 5) === startClean && (p.end || '').slice(0, 5) === endClean)
                                                            : null;
                                                        
                                                        const matchedDbShift = (!shiftObj && !s.is_off && startClean && endClean)
                                                            ? shifts.find(sh => (sh.start_time || '').slice(0, 5) === startClean && (sh.end_time || '').slice(0, 5) === endClean)
                                                            : null;

                                                        const colorClass = matchedPreset
                                                            ? `${getPresetColor(matchedPreset.color).bg} ${getPresetColor(matchedPreset.color).border} ${getPresetColor(matchedPreset.color).text}`
                                                            : getShiftColorClass(s, shiftObj || matchedDbShift);
                                                        
                                                        const cellLabel = s.is_off ? 'OFF' : (matchedPreset ? matchedPreset.name : (shiftObj?.name || matchedDbShift?.name || (timeStr ? `กะ ${timeStr}` : 'CUSTOM')));

                                                        return (
                                                            <div 
                                                                key={idx} 
                                                                className={`p-1.5 border ${colorClass} text-center relative flex flex-col justify-center items-center ${
 s.status === 'DRAFT' ? 'border-dashed border-2 opacity-80' : ''
 }`}
                                                            >
                                                                <div className="font-semibold text-xs">
                                                                    {cellLabel}
                                                                </div>
                                                                {!s.is_off && timeStr && (
                                                                    <div className="text-xs font-semibold text-charcoal mt-0.5">
                                                                        {timeStr}
                                                                    </div>
                                                                )}
                                                                {s.slot_type !== 'MAIN' && (
                                                                    <div className="text-xs font-semibold opacity-60 mt-0.5">
                                                                        {s.slot_type}
                                                                    </div>
                                                                )}
                                                                {s.status === 'DRAFT' && (
                                                                    <span className="text-xs font-semibold text-neutral border border-rule px-1 bg-cream mt-1">
                                                                        Draft
                                                                    </span>
                                                                )}
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="border-t-2 border-charcoal bg-paper-2 font-num">
                            <td className="px-4 py-3 font-semibold text-charcoal border-r border-charcoal text-xs">
                                TOTAL ON DUTY (รวม)
                            </td>
                            {dates.map((date, i) => (
                                <td key={`rep-total-${i}`} className="px-3 py-2.5 text-center text-xs font-semibold text-charcoal border-r border-rule">
                                    {dailyOnDutyStats[i]?.count || 0} คน
                                </td>
                            ))}
                        </tr>
                    </tfoot>
                </table>
            </div>

            {/* Verification & Notes Footer */}
            <div className="mt-16 pt-8 border-t border-rule">
                <div className="flex justify-between items-end flex-wrap gap-4">
                    <div className="max-w-sm">
                        <p className="text-xs font-semibold mb-2 text-neutral">Verification & Archives</p>
                        <p className="text-xs leading-relaxed text-neutral">
                            This document is an official work schedule generated by In The Haus. 
                            Any modifications must be approved by the management.
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs font-semibold text-charcoal">YUZU x IN THE HAUS</p>
                        <p className="text-xs font-semibold text-neutral mt-1">ONHAUS SYSTEM © {new Date().getFullYear()} All Rights Reserved</p>
                    </div>
                </div>
            </div>

            <style jsx global>{`
                @media print {
                    .no-print { display: none !important; }
                    body { 
                        padding: 0 !important; 
                        margin: 0 !important; 
                        background: white !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .min-h-screen { min-height: auto !important; padding: 0 !important; }
                }
            `}</style>

            <button 
                onClick={() => window.print()}
                className="fixed bottom-8 right-8 no-print bg-charcoal border border-charcoal text-cream px-6 py-3.5 font-semibold font-num text-xs hover:bg-cream hover:text-charcoal transition-colors duration-150 cursor-pointer z-50"
            >
                Print to PDF / พิมพ์ตาราง
            </button>
        </div>
    );
}

export default function RosterPDFReport() {
    return (
        <Suspense fallback={<div className="p-20 text-center font-semibold text-neutral font-num">Loading Roster Engine...</div>}>
            <RosterPDFReportContent />
        </Suspense>
    );
}

