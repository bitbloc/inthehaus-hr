"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import { format, addHours, startOfDay, endOfDay } from "date-fns";
import { th } from "date-fns/locale";

function SlipPDFReportContent() {
    const searchParams = useSearchParams();
    const dateParam = searchParams.get('date');
    const [slips, setSlips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [employees, setEmployees] = useState([]);

    const reportDate = dateParam || format(addHours(new Date(), 7), 'yyyy-MM-dd');

    useEffect(() => {
        const fetchData = async () => {
            // Fetch employees for mapping
            const { data: empData } = await supabase.from('employees').select('id, name, nickname');
            if (empData) setEmployees(empData);

            // Fetch slips for specific date
            const { data, error } = await supabase
                .from('slip_transactions')
                .select('id, amount, timestamp, sender_name, user_id, transaction_ref, bank_name')
                .eq('is_deleted', false)
                .eq('date', reportDate)
                .order('timestamp', { ascending: true });

            if (!error && data) setSlips(data);
            setLoading(false);
        };
        fetchData();
    }, [reportDate]);

    const totalAmount = slips.reduce((sum, slip) => sum + Number(slip.amount), 0);

    const getSenderDisplay = (slip) => {
        const emp = employees.find(e => 
            String(e.id) === String(slip.user_id) || 
            (slip.user_id && e.line_bot_id && e.line_bot_id.toLowerCase() === String(slip.user_id).toLowerCase()) ||
            (slip.user_id && e.line_user_id && e.line_user_id.toLowerCase() === String(slip.user_id).toLowerCase())
        );
        const staffName = emp ? (emp.nickname || emp.name) : (slip.user_id ? `Staff ID: ${slip.user_id}` : "ไม่ระบุพนักงาน");
        const sender = slip.sender_name || "ไม่ทราบชื่อผู้โอน";
        return { staffName, sender };
    };

    if (loading) return <div className="p-20 text-center font-bold tracking-widest text-slate-300">GENERATING REPORT...</div>;

    return (
        <div className="min-h-screen bg-white text-black p-8 md:p-16 font-sans selection:bg-black selection:text-white">
            {/* Header */}
            <div className="flex justify-between items-start border-b-4 border-black pb-8 mb-12">
                <div>
                    <h1 className="text-6xl font-black tracking-tighter leading-none mb-2">IN THE HAUS</h1>
                    <p className="text-xs font-bold tracking-[0.3em] uppercase opacity-50">Transfer Slips Summary Report</p>
                </div>
                <div className="text-right">
                    <div className="text-4xl font-black tracking-tighter">{format(new Date(reportDate), 'dd MMM yyyy', { locale: th })}</div>
                    <div className="text-[10px] font-bold tracking-widest uppercase opacity-40">Report Generated: {format(addHours(new Date(), 7), 'HH:mm:ss')}</div>
                </div>
            </div>

            {/* Hero Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
                <div className="border-l-8 border-black pl-6 py-2">
                    <p className="text-[10px] font-bold tracking-[0.4em] uppercase opacity-40 mb-2">Total Net Transfer</p>
                    <p className="text-7xl font-black tracking-tighter">฿{totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="border-l-8 border-black pl-6 py-2">
                    <p className="text-[10px] font-bold tracking-[0.4em] uppercase opacity-40 mb-2">Total Transactions</p>
                    <p className="text-7xl font-black tracking-tighter">{slips.length}</p>
                </div>
            </div>

            {/* Transaction List */}
            <div className="space-y-1">
                 <div className="grid grid-cols-12 gap-4 pb-4 border-b-2 border-black text-[10px] font-black tracking-widest uppercase opacity-40">
                    <div className="col-span-1">Time</div>
                    <div className="col-span-3">Sender (Customer)</div>
                    <div className="col-span-2">Staff (Uploader)</div>
                    <div className="col-span-2">Bank</div>
                    <div className="col-span-2">Ref</div>
                    <div className="col-span-2 text-right">Amount</div>
                </div>

                {slips.map((slip, i) => {
                    const { staffName, sender } = getSenderDisplay(slip);
                    return (
                        <div key={slip.id} className="grid grid-cols-12 gap-4 py-6 border-b border-slate-100 hover:bg-slate-50 transition-colors items-center">
                            <div className="col-span-1 font-mono text-xs font-bold text-slate-400">
                                {format(new Date(slip.timestamp), 'HH:mm')}
                            </div>
                            <div className="col-span-3">
                                <p className="text-sm font-black tracking-tight">{sender}</p>
                            </div>
                            <div className="col-span-2">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{staffName}</p>
                            </div>
                            <div className="col-span-2">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{slip.bank_name || "-"}</p>
                            </div>
                            <div className="col-span-2 font-mono text-[10px] text-slate-300 break-all">
                                {slip.transaction_ref || "-"}
                            </div>
                            <div className="col-span-2 text-right text-lg font-black tracking-tighter">
                                {Number(slip.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Footer */}
            <div className="mt-20 pt-8 border-t border-slate-200">
                <div className="flex justify-between items-end">
                    <div className="max-w-sm">
                        <p className="text-[10px] font-bold tracking-[0.2em] uppercase mb-4 opacity-40">Verification</p>
                        <p className="text-[10px] leading-relaxed text-slate-400">
                            This document is an automated summary of digital transfer slips processed by Yuzu AI for In The Haus. 
                            Values are extracted directly from bank-generated images.
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs font-black italic tracking-widest">YUZU x IN THE HAUS</p>
                        <p className="text-[10px] font-bold text-slate-300">© {new Date().getFullYear()} All Rights Reserved</p>
                    </div>
                </div>
            </div>

            <style jsx global>{`
                @media print {
                    .no-print { display: none; }
                    body { padding: 0; }
                }
            `}</style>

            <button 
                onClick={() => window.print()}
                className="fixed bottom-8 right-8 no-print bg-black text-white px-8 py-4 rounded-full font-bold text-xs tracking-widest uppercase shadow-2xl hover:scale-105 active:scale-95 transition-all"
            >
                Print to PDF
            </button>
        </div>
    );
}

export default function SlipPDFReport() {
    return (
        <Suspense fallback={<div className="p-20 text-center font-bold tracking-widest text-slate-300 uppercase">Loading Report Engine...</div>}>
            <SlipPDFReportContent />
        </Suspense>
    );
}
