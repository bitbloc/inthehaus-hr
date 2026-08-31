"use client";

import { useState, useEffect, Suspense } from "react";
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
    const [customPresets, setCustomPresets] = useState([]);

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
        { id: 'sky', bg: 'bg-rams-bg', text: 'text-rams-ink', border: 'border-rams-rule-light' },
        { id: 'amber', bg: 'bg-rams-amber/10', text: 'text-rams-amber', border: 'border-rams-amber/30' },
        { id: 'indigo', bg: 'bg-rams-ink text-rams-panel', text: 'text-rams-panel font-bold', border: 'border-rams-ink' },
        { id: 'rose', bg: 'bg-rams-red/10', text: 'text-rams-red', border: 'border-rams-red/30' },
        { id: 'emerald', bg: 'bg-rams-green/10', text: 'text-rams-green', border: 'border-rams-green/30' },
        { id: 'violet', bg: 'bg-rams-orange/10', text: 'text-rams-orange', border: 'border-rams-orange/30' },
        { id: 'slate', bg: 'bg-rams-panel', text: 'text-rams-ink-muted', border: 'border-rams-rule-light' },
        { id: 'teal', bg: 'bg-rams-green/20', text: 'text-rams-green', border: 'border-rams-green/50' },
    ];
    const getPresetColor = (colorId) => PRESET_COLORS.find(c => c.id === colorId) || PRESET_COLORS[0];

    useEffect(() => {
        try {
            const saved = localStorage.getItem('roster_custom_presets');
            if (saved) {
                setCustomPresets(JSON.parse(saved));
            }
        } catch (e) {
            console.error(e);
        }
    }, []);

    const allPresets = React.useMemo(() => {
        const combined = [...SYSTEM_STANDARD_PRESETS];
        (customPresets || []).forEach(cp => {
            const sClean = (cp.start || '').slice(0, 5);
            const eClean = (cp.end || '').slice(0, 5);
            const existingIdx = combined.findIndex(p => p.start === sClean && p.end === eClean);
            if (existingIdx >= 0) {
                combined[existingIdx] = { ...combined[existingIdx], ...cp };
            } else {
                combined.push(cp);
            }
        });
        return combined;
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

    const dailyOnDutyStats = React.useMemo(() => {
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
        if (s.is_off) return 'bg-rams-red/10 border-rams-red/30 text-rams-red font-bold';

        const name = (shiftObj?.name || '').toLowerCase();
        const startClean = (s.custom_start_time || shiftObj?.start_time || '').slice(0, 5);
        const endClean = (s.custom_end_time || shiftObj?.end_time || '').slice(0, 5);

        if (name.includes('ควบ') || name.includes('double') || (startClean === '10:00' && endClean === '00:30')) {
            return 'bg-rams-orange/10 border-rams-orange/30 text-rams-orange font-bold';
        }
        if (name.includes('ค่ำ') || name.includes('ดึก') || name.includes('night') || (startClean === '16:30' && endClean === '00:30')) {
            return 'bg-rams-ink text-rams-panel border-rams-ink font-bold';
        }
        if (name.includes('inthehaus') || (startClean === '18:00' && endClean === '22:30')) {
            return 'bg-rams-ink text-rams-panel border-rams-ink font-bold';
        }
        if (name.includes('chef') || (startClean === '10:00' && endClean === '20:30')) {
            return 'bg-rams-green/10 border-rams-green/30 text-rams-green font-bold';
        }
        if (name.includes('ครัว') || (startClean === '12:30' && endClean === '23:30')) {
            return 'bg-rams-orange/10 border-rams-orange/30 text-rams-orange font-bold';
        }
        if (name.includes('เช้า') || name.includes('morning') || (startClean === '10:00' && endClean === '18:00')) {
            return 'bg-rams-amber/10 border-rams-amber/30 text-rams-amber font-bold';
        }
        
        return 'bg-rams-panel border-rams-rule-light text-rams-ink';
    };

    if (loading) return <div className="p-20 text-center font-bold tracking-widest font-mono text-rams-ink-muted">GENERATING ROSTER REPORT...</div>;

    const printDateRangeStr = `${format(weekStart, 'dd/MM/yyyy')} - ${format(weekEnd, 'dd/MM/yyyy')}`;

    return (
        <div className="min-h-screen bg-rams-bg text-rams-ink p-6 md:p-10 font-mono selection:bg-rams-ink/10">
            {/* Header with Logo */}
            <div className="flex justify-between items-center border-b-2 border-rams-rule pb-6 mb-6">
                <div className="flex items-center gap-4">
                    <img src="/logo.png" className="h-10 w-auto object-contain" alt="In The Haus Logo" onError={(e) => e.target.style.display = 'none'} />
                    <div>
                        <h1 className="text-lg font-bold tracking-widest leading-none mb-1 text-rams-ink uppercase">IN THE HAUS</h1>
                        <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-rams-ink-muted">Weekly Work Schedule / ตารางงานรายสัปดาห์</p>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-lg font-bold tracking-tight text-rams-ink">{printDateRangeStr}</div>
                    <div className="text-[8px] font-bold tracking-widest uppercase text-rams-ink-muted mt-0.5">Generated: {format(new Date(), 'dd/MM/yyyy HH:mm')}</div>
                </div>
            </div>

            {/* Roster Grid Table */}
            <div className="overflow-x-auto border border-rams-rule bg-rams-panel rounded-sm shadow-none">
                <table className="w-full text-xs text-left border-collapse">
                    <thead>
                        <tr className="bg-rams-bg/60 text-rams-ink border-b border-rams-rule">
                            <th className="px-4 py-3 font-bold border-r border-rams-rule w-[180px]">พนักงาน / ตำแหน่ง</th>
                            {dates.map((date, i) => (
                                <th key={i} className="px-3 py-3 font-bold text-center border-r border-rams-rule-light min-w-[120px]">
                                    <div className="text-[9px] text-rams-ink-muted uppercase tracking-widest">{daysTitle[i]}</div>
                                    <div className="text-xs font-bold mt-0.5 text-rams-ink">{format(date, 'dd/MM')}</div>
                                    <div className="text-[8px] font-bold text-rams-ink-muted uppercase mt-0.5">
                                        ON DUTY: {dailyOnDutyStats[i]?.count || 0}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-rams-rule-light">
                        {employees.map((emp, empIdx) => (
                            <tr key={emp.id} className={`hover:bg-rams-bg/30 transition-colors ${empIdx % 2 === 1 ? 'bg-rams-bg/20' : 'bg-rams-panel'}`}>
                                <td className="px-4 py-3 font-bold text-rams-ink border-r border-rams-rule align-middle">
                                    <div className="text-xs font-bold">{emp.nickname || emp.name}</div>
                                    <div className="text-[9px] text-rams-ink-muted font-semibold tracking-wider uppercase mt-0.5">{emp.position}</div>
                                </td>
                                {dates.map((date, dateIdx) => {
                                    const slots = getCellSlots(emp.id, date);
                                    return (
                                        <td key={dateIdx} className="px-2 py-2 border-r border-rams-rule-light align-top h-full min-h-[75px]">
                                            <div className="space-y-1.5 flex flex-col h-full justify-start">
                                                {slots.length === 0 ? (
                                                    <span className="text-rams-ink-muted/40 text-xs italic m-auto block text-center font-normal">-</span>
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
                                                                className={`p-1.5 rounded-sm border ${colorClass} text-center shadow-none relative flex flex-col justify-center items-center ${
                                                                    s.status === 'DRAFT' ? 'border-dashed border-2 opacity-80' : ''
                                                                }`}
                                                            >
                                                                <div className="font-bold text-[9px] uppercase tracking-wide">
                                                                    {cellLabel}
                                                                </div>
                                                                {!s.is_off && timeStr && (
                                                                    <div className="text-[9px] font-bold text-rams-ink mt-0.5">
                                                                        {timeStr}
                                                                    </div>
                                                                )}
                                                                {s.slot_type !== 'MAIN' && (
                                                                    <div className="text-[8px] font-bold uppercase tracking-wider opacity-60 mt-0.5">
                                                                        {s.slot_type}
                                                                    </div>
                                                                )}
                                                                {s.status === 'DRAFT' && (
                                                                    <span className="text-[8px] font-semibold text-rams-ink-muted uppercase tracking-widest border border-rams-rule-light px-1 rounded-sm bg-rams-panel mt-1">
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
                        <tr className="border-t-2 border-rams-rule bg-rams-bg/60 font-mono">
                            <td className="px-4 py-3 font-bold uppercase tracking-wider text-rams-ink border-r border-rams-rule text-xs">
                                TOTAL ON DUTY (รวม)
                            </td>
                            {dates.map((date, i) => (
                                <td key={`rep-total-${i}`} className="px-3 py-2.5 text-center text-xs font-bold text-rams-ink border-r border-rams-rule-light">
                                    {dailyOnDutyStats[i]?.count || 0} คน
                                </td>
                            ))}
                        </tr>
                    </tfoot>
                </table>
            </div>

            {/* Verification & Notes Footer */}
            <div className="mt-16 pt-8 border-t border-neutral-200">
                <div className="flex justify-between items-end flex-wrap gap-4">
                    <div className="max-w-sm">
                        <p className="text-[9px] font-bold tracking-[0.2em] uppercase mb-2 text-neutral-400">Verification & Archives</p>
                        <p className="text-[9px] leading-relaxed text-neutral-400">
                            This document is an official work schedule generated by In The Haus. 
                            Any modifications must be approved by the management.
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-bold italic tracking-widest uppercase text-neutral-700">YUZU x IN THE HAUS</p>
                        <p className="text-[9px] font-bold text-neutral-400 mt-1">ONHAUS SYSTEM © {new Date().getFullYear()} All Rights Reserved</p>
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
                className="fixed bottom-8 right-8 no-print bg-rams-ink border border-rams-ink text-rams-panel px-6 py-3.5 rounded-sm font-bold font-mono text-xs tracking-widest uppercase hover:bg-rams-panel hover:text-rams-ink transition-all cursor-pointer shadow-lg z-50 active:translate-y-[1px]"
            >
                Print to PDF / พิมพ์ตาราง
            </button>
        </div>
    );
}

export default function RosterPDFReport() {
    return (
        <Suspense fallback={<div className="p-20 text-center font-bold tracking-widest text-slate-400 uppercase font-mono">Loading Roster Engine...</div>}>
            <RosterPDFReportContent />
        </Suspense>
    );
}

