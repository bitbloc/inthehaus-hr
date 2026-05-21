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

    const PRESET_COLORS = [
        { id: 'sky', bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-200' },
        { id: 'amber', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
        { id: 'indigo', bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-200' },
        { id: 'rose', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200' },
        { id: 'emerald', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
        { id: 'violet', bg: 'bg-violet-50', text: 'text-violet-800', border: 'border-violet-200' },
        { id: 'slate', bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-300' },
        { id: 'teal', bg: 'bg-teal-50', text: 'text-teal-800', border: 'border-teal-200' },
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

            if (empRes.data) setEmployees(empRes.data);
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

    const getShiftColorClass = (s, shiftObj) => {
        if (s.is_off) return 'bg-red-50 border-red-200 text-red-700';
        if (!s.shift_id || s.custom_start_time || !shiftObj) {
            return 'bg-sky-50 border-sky-200 text-sky-950';
        }

        const name = (shiftObj.name || '').toLowerCase();
        
        if (name.includes('ควบ') || name.toLowerCase().includes('double')) {
            return 'bg-rose-50 border-rose-200 text-rose-950';
        }
        
        if (name.includes('ค่ำ') || name.includes('ดึก') || name.toLowerCase().includes('night') || name.toLowerCase().includes('evening')) {
            return 'bg-indigo-50 border-indigo-200 text-indigo-950';
        }
        
        if (name.includes('เช้า') || name.toLowerCase().includes('morning')) {
            return 'bg-amber-50 border-amber-200 text-amber-950';
        }
        
        return 'bg-yellow-50 border-yellow-200 text-yellow-950';
    };

    if (loading) return <div className="p-20 text-center font-bold tracking-widest text-slate-300">GENERATING ROSTER REPORT...</div>;

    const printDateRangeStr = `${format(weekStart, 'dd/MM/yyyy')} - ${format(weekEnd, 'dd/MM/yyyy')}`;

    return (
        <div className="min-h-screen bg-white text-black p-6 md:p-12 font-sans selection:bg-black selection:text-white">
            {/* Header with Logo */}
            <div className="flex justify-between items-center border-b-4 border-black pb-6 mb-8">
                <div className="flex items-center gap-4">
                    <img src="/logo.png" className="h-14 w-auto object-contain" alt="In The Haus Logo" />
                    <div>
                        <h1 className="text-3xl font-black tracking-tighter leading-none mb-1">IN THE HAUS</h1>
                        <p className="text-[10px] font-bold tracking-[0.3em] uppercase opacity-50">Weekly Work Schedule / ตารางงานรายสัปดาห์</p>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-2xl font-black tracking-tighter">{printDateRangeStr}</div>
                    <div className="text-[9px] font-bold tracking-widest uppercase opacity-40">Report Generated: {format(new Date(), 'dd/MM/yyyy HH:mm')}</div>
                </div>
            </div>

            {/* Roster Grid Table */}
            <div className="overflow-x-auto border border-gray-300 rounded-lg">
                <table className="w-full text-xs text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-100 text-gray-700 border-b border-gray-300">
                            <th className="px-4 py-3 font-bold border-r border-gray-300 w-[180px]">พนักงาน / ตำแหน่ง</th>
                            {dates.map((date, i) => (
                                <th key={i} className="px-3 py-3 font-bold text-center border-r border-gray-300 min-w-[120px]">
                                    <div className="text-[10px] text-gray-500 uppercase">{daysTitle[i]}</div>
                                    <div className="text-sm font-black mt-0.5">{format(date, 'dd/MM')}</div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {employees.map((emp, empIdx) => (
                            <tr key={emp.id} className={`border-b border-gray-200 hover:bg-gray-50 ${empIdx % 2 === 1 ? 'bg-gray-50/30' : ''}`}>
                                <td className="px-4 py-3 font-bold text-gray-900 border-r border-gray-300 align-middle">
                                    <div className="text-sm">{emp.nickname || emp.name}</div>
                                    <div className="text-[9px] text-gray-500 font-semibold tracking-wider uppercase mt-0.5">{emp.position}</div>
                                </td>
                                {dates.map((date, dateIdx) => {
                                    const slots = getCellSlots(emp.id, date);
                                    return (
                                        <td key={dateIdx} className="px-2 py-2 border-r border-gray-300 align-top h-full min-h-[80px]">
                                            <div className="space-y-1.5 flex flex-col h-full justify-start">
                                                {slots.length === 0 ? (
                                                    <span className="text-gray-300 text-xs italic m-auto block text-center font-normal">-</span>
                                                ) : (
                                                    slots.map((s, idx) => {
                                                        const shiftObj = shifts.find(sh => sh.id === s.shift_id);
                                                        const matchedPreset = (!s.shift_id && s.custom_start_time && s.custom_end_time)
                                                            ? customPresets.find(p => (p.start || '').slice(0, 5) === s.custom_start_time.slice(0, 5) && (p.end || '').slice(0, 5) === s.custom_end_time.slice(0, 5))
                                                            : null;
                                                        const colorClass = matchedPreset
                                                            ? `${getPresetColor(matchedPreset.color).bg} ${getPresetColor(matchedPreset.color).border} ${getPresetColor(matchedPreset.color).text}`
                                                            : getShiftColorClass(s, shiftObj);
                                                        const timeStr = s.custom_start_time 
                                                            ? `${s.custom_start_time.slice(0,5)}-${s.custom_end_time?.slice(0,5)}` 
                                                            : (shiftObj ? `${shiftObj.start_time.slice(0,5)}-${shiftObj.end_time.slice(0,5)}` : '');
                                                        const cellLabel = s.is_off ? 'OFF (หยุด)' : (matchedPreset ? `${matchedPreset.icon || '⏰'} ${matchedPreset.name}` : (shiftObj?.name || 'Custom'));

                                                        return (
                                                            <div 
                                                                key={idx} 
                                                                className={`p-2 rounded border ${colorClass} text-center shadow-sm relative flex flex-col justify-center items-center ${
                                                                    s.status === 'DRAFT' ? 'border-dashed border-2 opacity-80' : ''
                                                                }`}
                                                            >
                                                                <div className="font-bold text-[10px] uppercase tracking-wide">
                                                                    {cellLabel}
                                                                </div>
                                                                {!s.is_off && timeStr && (
                                                                    <div className="text-[10px] font-black text-slate-800 mt-0.5">
                                                                        {timeStr}
                                                                    </div>
                                                                )}
                                                                {s.slot_type !== 'MAIN' && (
                                                                    <div className="text-[8px] font-bold uppercase tracking-wider opacity-60 mt-0.5">
                                                                        {s.slot_type}
                                                                    </div>
                                                                )}
                                                                {s.status === 'DRAFT' && (
                                                                    <span className="text-[8px] font-semibold text-gray-500 uppercase tracking-widest border border-gray-300 px-1 rounded bg-white mt-1">
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
                </table>
            </div>

            {/* Verification & Notes Footer */}
            <div className="mt-16 pt-8 border-t border-slate-200">
                <div className="flex justify-between items-end">
                    <div className="max-w-sm">
                        <p className="text-[9px] font-bold tracking-[0.2em] uppercase mb-3 opacity-40">Verification</p>
                        <p className="text-[10px] leading-relaxed text-slate-400">
                            This document is an official work schedule generated by In The Haus. 
                            Any modifications must be approved by the management.
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs font-black italic tracking-widest">YUZU x IN THE HAUS</p>
                        <p className="text-[9px] font-bold text-slate-300">© {new Date().getFullYear()} All Rights Reserved</p>
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
                className="fixed bottom-8 right-8 no-print bg-black text-white px-8 py-4 rounded-full font-bold text-xs tracking-widest uppercase shadow-2xl hover:scale-105 active:scale-95 transition-all z-50"
            >
                Print to PDF
            </button>
        </div>
    );
}

export default function RosterPDFReport() {
    return (
        <Suspense fallback={<div className="p-20 text-center font-bold tracking-widest text-slate-300 uppercase">Loading Report Engine...</div>}>
            <RosterPDFReportContent />
        </Suspense>
    );
}
