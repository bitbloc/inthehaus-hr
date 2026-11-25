"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import { format } from "date-fns";
import { th } from "date-fns/locale";

function SlipPDFReportContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const dateParam = searchParams.get('date');
    const [slips, setSlips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [employees, setEmployees] = useState([]);

    const reportDate = dateParam || format(new Date(), 'yyyy-MM-dd');

    useEffect(() => {
        let isMounted = true;
        const fetchData = async () => {
            setLoading(true);
            try {
                // Phase 5 Performance: Concurrent Parallel Fetching
                const [empRes, slipRes] = await Promise.all([
                    supabase.from('employees').select('id, name, nickname, line_bot_id, line_user_id'),
                    supabase.from('slip_transactions')
                        .select('id, amount, timestamp, sender_name, user_id, transaction_ref, bank_name')
                        .eq('is_deleted', false)
                        .eq('date', reportDate)
                        .order('timestamp', { ascending: true })
                ]);

                if (isMounted) {
                    if (empRes.data) setEmployees(empRes.data);
                    if (slipRes.data) setSlips(slipRes.data);
                }
            } catch (err) {
                console.error("Error loading slips report:", err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchData();
        return () => { isMounted = false; };
    }, [reportDate]);

    // Phase 5 Performance: O(1) Dictionary Lookup for Employees
    const empMap = useMemo(() => {
        const map = new Map();
        for (const e of employees) {
            if (e.id) map.set(String(e.id).toLowerCase(), e);
            if (e.line_bot_id) map.set(String(e.line_bot_id).toLowerCase(), e);
            if (e.line_user_id) map.set(String(e.line_user_id).toLowerCase(), e);
        }
        return map;
    }, [employees]);

    const totalAmount = useMemo(() => {
        return slips.reduce((sum, slip) => sum + Number(slip.amount || 0), 0);
    }, [slips]);

    const getSenderDisplay = (slip) => {
        const uid = slip.user_id ? String(slip.user_id).toLowerCase() : null;
        const emp = uid ? empMap.get(uid) : null;
        
        // Truncate long IDs for cleaner PDF
        const formatId = (id) => id ? (id.length > 8 ? `${id.substring(0, 4)}...${id.substring(id.length - 4)}` : id) : "";
        
        const staffName = emp ? (emp.nickname || emp.name) : (slip.user_id ? `Staff: ${formatId(slip.user_id)}` : "ไม่ระบุพนักงาน");
        const sender = slip.sender_name || "ไม่ทราบชื่อผู้โอน";
        return { staffName, sender };
    };

    if (loading) return <div className="p-20 text-center font-semibold font-num text-neutral">GENERATING REPORT...</div>;

    return (
        <div className="min-h-screen bg-[#fafaf9] text-charcoal p-8 md:p-16 font-num">
            {/* Header */}
            <div className="flex justify-between items-center border-b-2 border-charcoal pb-8 mb-12 flex-wrap gap-4">
                <div className="flex items-center gap-4">
                    <img src="/logo.png" className="h-12 w-auto object-contain" alt="In The Haus Logo" onError={(e) => e.target.style.display = 'none'} />
                    <div>
                        <h1 className="text-xl font-semibold leading-none mb-1">IN THE HAUS</h1>
                        <p className="text-xs font-semibold text-neutral">Transfer Slips Summary Report</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    {/* Date Selector (Interactive on Screen, Hidden when Printing) */}
                    <input 
                        type="date"
                        value={reportDate}
                        onChange={(e) => {
                            if (e.target.value) {
                                router.push(`/admin/report/slips?date=${e.target.value}`);
                            }
                        }}
                        className="no-print bg-cream border border-rule px-3 py-1.5 text-xs font-semibold text-charcoal cursor-pointer hover:border-charcoal transition-colors"
                    />
                    <div className="text-right">
                        <div className="text-xl font-semibold tracking-tight text-charcoal">{format(new Date(reportDate), 'dd MMM yyyy', { locale: th })}</div>
                        <div className="text-xs font-semibold text-neutral mt-1">Generated: {format(new Date(), 'HH:mm:ss')}</div>
                    </div>
                </div>
            </div>

            {/* Hero Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                <div className="border border-rule bg-cream p-6 flex flex-col justify-between">
                    <p className="text-xs font-semibold text-neutral mb-2">Total Net Transfer</p>
                    <p className="text-3xl font-semibold tracking-tight text-charcoal">฿{totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="border border-rule bg-cream p-6 flex flex-col justify-between">
                    <p className="text-xs font-semibold text-neutral mb-2">Total Transactions</p>
                    <p className="text-3xl font-semibold tracking-tight text-charcoal">{slips.length} <span className="text-xs font-normal text-neutral">Slips</span></p>
                </div>
            </div>

            {/* Transaction List */}
            <div className="border border-rule bg-cream p-6 md:p-8 space-y-4">
                 <div className="grid grid-cols-12 gap-4 pb-3 border-b border-rule text-xs font-semibold text-neutral">
                    <div className="col-span-1">Time</div>
                    <div className="col-span-3">Sender (Customer)</div>
                    <div className="col-span-2">Staff (Uploader)</div>
                    <div className="col-span-1">Bank</div>
                    <div className="col-span-3">Ref Code</div>
                    <div className="col-span-2 text-right">Amount</div>
                </div>

                {slips.length === 0 ? (
                    <div className="py-12 text-center text-neutral text-xs">
                        <p className="font-semibold">ไม่มีรายการโอนเงินในวันที่ {format(new Date(reportDate), 'dd/MM/yyyy')}</p>
                        <p className="text-xs mt-1 text-neutral">No transfer slip records found for this date.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-neutral-100">
                        {slips.map((slip) => {
                            const { staffName, sender } = getSenderDisplay(slip);
                            return (
                                <div key={slip.id} className="grid grid-cols-12 gap-4 py-4 hover:bg-paper-2 transition-colors items-center text-charcoal text-xs">
                                    <div className="col-span-1 font-semibold text-charcoal">
                                        {format(new Date(slip.timestamp), 'HH:mm')}
                                    </div>
                                    <div className="col-span-3 font-semibold text-charcoal">
                                        {sender}
                                    </div>
                                     <div className="col-span-2 text-xs font-semibold tracking-tight text-neutral whitespace-nowrap overflow-hidden text-ellipsis">
                                        {staffName}
                                    </div>
                                    <div className="col-span-1 text-xs text-neutral font-medium">
                                        {slip.bank_name || "-"}
                                    </div>
                                    <div className="col-span-3 text-xs font-num break-all leading-tight text-neutral">
                                        {slip.transaction_ref || "-"}
                                    </div>
                                    <div className="col-span-2 text-right font-semibold text-charcoal">
                                        {Number(slip.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>


            {/* Footer */}
            <div className="mt-20 pt-8 border-t border-rule">
                <div className="flex justify-between items-end flex-wrap gap-4">
                    <div className="max-w-sm">
                        <p className="text-xs font-semibold mb-2 text-neutral">Verification & Archives</p>
                        <p className="text-xs leading-relaxed text-neutral">
                            This document is an automated summary of digital transfer slips processed by Yuzu AI for In The Haus. 
                            Values are extracted directly from bank-generated images.
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
                }
            `}</style>

            <button 
                onClick={() => window.print()}
                className="fixed bottom-8 right-8 no-print bg-charcoal border border-charcoal text-cream px-8 py-4 font-semibold text-xs hover:bg-cream hover:text-charcoal transition-colors duration-150 cursor-pointer z-50"
            >
                Print to PDF
            </button>
        </div>
    );
}

export default function SlipPDFReport() {
    return (
        <Suspense fallback={<div className="p-20 text-center font-semibold text-neutral font-num">Loading Report Engine...</div>}>
            <SlipPDFReportContent />
        </Suspense>
    );
}
