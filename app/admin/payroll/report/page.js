"use client";
/* Brand v2 · payroll documents: shop summary + payslips, A4 print and PNG / copy-image (AGENTS.md §10).
 * Paper-first: charcoal ink on light paper, plum only for headings/flags, no solid ink blocks.
 * Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5 */

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import { calculatePayroll } from "../../../../utils/payroll";
import { baht, money, hrs, awayFmt, WAGE_TH, ADJ_TH, adjReason, shiftText, statusInfo, isException, flagsOf, thaiMonth } from "../../../../utils/payrollLabels";
import { downloadNodePng, copyNodePng } from "../../../../utils/exportImage";
import { format, startOfMonth, endOfMonth, addDays } from "date-fns";
import { th } from "date-fns/locale";

const toneText = {
    ok: 'text-subtle',
    warn: 'text-plum font-semibold',
    info: 'text-plum',
    mute: 'text-neutral',
};

function DocHeader({ title, month, right }) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-6 border-b-2 border-charcoal pb-4 mb-5">
            <div className="flex items-end gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-inbaan-wordmark-charcoal-96.png" alt="ในบ้าน" width={73} height={40} className="h-10 w-auto" />
                <div>
                    <h1 className="font-head text-2xl text-charcoal whitespace-nowrap">{title}</h1>
                    <p className="text-sm text-neutral">ร้านในบ้าน · In The Haus</p>
                </div>
            </div>
            <div className="sm:text-right">
                <p className="text-lg font-semibold text-charcoal">{month}</p>
                {right}
            </div>
        </div>
    );
}

function PayrollPDFReportContent() {
    const searchParams = useSearchParams();
    const monthParam = searchParams.get('month') || format(new Date(), 'yyyy-MM');
    const initialType = searchParams.get('type') || 'master'; // 'master' | 'individual'
    const empIdParam = searchParams.get('emp_id') || searchParams.get('employee_id') || 'ALL';

    const [reportType, setReportType] = useState(initialType);
    const [selectedEmpId, setSelectedEmpId] = useState(empIdParam);
    const [payrollData, setPayrollData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const [toast, setToast] = useState(null);
    const slipRefs = useRef({});
    const generatedAt = useRef(format(new Date(), 'd MMM', { locale: th }) + ` ${new Date().getFullYear() + 543} ` + format(new Date(), 'HH:mm'));

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            const [year, month] = monthParam.split('-');
            const startDate = startOfMonth(new Date(year, month - 1));
            const endDate = endOfMonth(startDate);
            const startStr = format(startDate, 'yyyy-MM-dd');
            const endStr = format(endDate, 'yyyy-MM-dd');

            const [empRes, shiftRes, transRes, logRes, schedRes, deductRes, configRes] = await Promise.all([
                supabase.from('employees').select('*').order('id'),
                supabase.from('shifts').select('*').order('start_time'),
                supabase.from('roster_transactions').select('*').gte('date', startStr).lte('date', endStr),
                // From the day before: a night shift on the last day of the previous month ends after midnight
                supabase.from('attendance_logs').select('*').gte('timestamp', addDays(startDate, -1).toISOString()).lte('timestamp', addDays(endDate, 2).toISOString()).order('timestamp'),
                supabase.from('employee_schedules').select('*'),
                supabase.from('payroll_deductions').select('*').eq('month', monthParam),
                supabase.from('payroll_config').select('*')
            ]);

            // Same rates as the payroll page
            const payrollConfig = { hourly_rate: 50, ot_rate: 50 };
            configRes.data?.forEach(c => { payrollConfig[c.key] = Number(c.value); });

            if (empRes.data && transRes.data && logRes.data) {
                setPayrollData(calculatePayroll(empRes.data, logRes.data, transRes.data, shiftRes.data || [], payrollConfig, deductRes.data || [], monthParam, schedRes.data || []));
            }
            setLoading(false);
        };
        fetchData();
    }, [monthParam]);

    const monthLabel = thaiMonth(monthParam);

    if (loading) {
        return (
            <div className="brand-v2 min-h-screen flex items-center justify-center p-8">
                <p className="text-base text-neutral">กำลังคำนวณเอกสารเงินเดือน {monthLabel}…</p>
            </div>
        );
    }

    // Everyone with pay due (monthly staff without punches included), same as the payroll page total
    const people = payrollData.filter(d => d.netSalary > 0 || d.workDays > 0 || (d.dailyDetails && d.dailyDetails.some(day => day.in !== '-' || day.out !== '-')));
    const slips = selectedEmpId === 'ALL' ? people : people.filter(d => String(d.emp.id) === String(selectedEmpId));
    const sum = (f) => people.reduce((s, i) => s + (f(i) || 0), 0);
    const totals = {
        salary: sum(i => i.totalSalary), ot: sum(i => i.totalOTPay), add: sum(i => i.totalAllowances),
        deduct: sum(i => i.totalDeduct), net: sum(i => i.netSalary), days: sum(i => i.workDays),
        reg: sum(i => i.totalRegularHours), otH: sum(i => i.totalOTHours),
        missed: sum(i => i.incompleteCount), absent: sum(i => i.absentCount), late: sum(i => i.lateCount), offDay: sum(i => i.offDayWorkCount),
    };
    const fileBase = (item) => `payslip_${monthParam}_${(item.emp.nickname || item.emp.name || item.emp.id).toString().replace(/\s+/g, '-')}`;

    const savePng = async (item) => {
        const node = slipRefs.current[item.emp.id];
        if (!node) return;
        setBusyId(`png-${item.emp.id}`);
        try {
            await downloadNodePng(node, `${fileBase(item)}.png`);
            showToast('บันทึกรูปสลิปแล้ว');
        } catch (e) {
            console.error(e);
            showToast('บันทึกรูปไม่สำเร็จ: ' + (e.message || e), 'error');
        } finally { setBusyId(null); }
    };
    const copyPng = async (item) => {
        const node = slipRefs.current[item.emp.id];
        if (!node) return;
        setBusyId(`copy-${item.emp.id}`);
        try {
            const ok = await copyNodePng(node);
            showToast(ok ? 'คัดลอกรูปแล้ว วางในแชท LINE ได้เลย' : 'เบราว์เซอร์นี้คัดลอกรูปไม่ได้ ใช้ "บันทึกรูป" แทน', ok ? 'success' : 'error');
        } catch (e) {
            console.error(e);
            showToast('คัดลอกรูปไม่สำเร็จ: ' + (e.message || e), 'error');
        } finally { setBusyId(null); }
    };

    const renderMaster = () => (
        <article className="doc bg-cream border border-rule mx-auto p-8 sm:p-10">
            <DocHeader title="สรุปเงินเดือน" month={monthLabel} right={<p className="text-sm text-neutral">พิมพ์เมื่อ {generatedAt.current}</p>} />

            <section className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-rule border border-rule mb-4 [&>div]:bg-cream avoid-break">
                {[['ค่าแรง', totals.salary], ['OT', totals.ot], ['หักรวม', totals.deduct]].map(([k, v]) => (
                    <div key={k} className="px-4 py-3"><p className="text-sm text-neutral">{k}</p><p className="font-num text-lg text-charcoal">{baht(v)}</p></div>
                ))}
                <div className="px-4 py-3"><p className="text-sm font-semibold text-charcoal">ยอดโอนรวม</p><p className="font-num text-2xl text-charcoal">{baht(totals.net)}</p></div>
            </section>

            <p className="text-sm text-subtle mb-4 avoid-break">
                พนักงาน <span className="font-num">{people.length}</span> คน · ลืมลงเวลา <span className="font-num">{totals.missed}</span> · ขาด <span className="font-num">{totals.absent}</span> · สาย <span className="font-num">{totals.late}</span> · ทำวันหยุด <span className="font-num">{totals.offDay}</span>
            </p>

            <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left border-collapse text-sm">
                <thead className="border-y-2 border-charcoal">
                    <tr className="text-charcoal">
                        <th className="py-2 pr-2 font-semibold">พนักงาน</th>
                        <th className="py-2 px-2 font-semibold text-right">วัน</th>
                        <th className="py-2 px-2 font-semibold text-right">ชม. / OT</th>
                        <th className="py-2 px-2 font-semibold text-right">ค่าแรง</th>
                        <th className="py-2 px-2 font-semibold text-right">OT</th>
                        <th className="py-2 px-2 font-semibold text-right">เพิ่ม</th>
                        <th className="py-2 px-2 font-semibold text-right">หัก</th>
                        <th className="py-2 pl-2 font-semibold text-right">สุทธิ</th>
                    </tr>
                </thead>
                <tbody>
                    {people.map(item => {
                        const flags = flagsOf(item);
                        return (
                            <tr key={item.emp.id} className="border-b border-rule align-top">
                                <td className="py-2 pr-2">
                                    <span className="block font-semibold text-charcoal">{item.emp.nickname || item.emp.name}</span>
                                    <span className="block text-xs text-neutral">{item.emp.position || '-'} · {WAGE_TH[item.wageType] || item.wageType}</span>
                                    {flags.length > 0 && <span className="block text-xs text-plum">{flags.join(' · ')}</span>}
                                </td>
                                <td className="py-2 px-2 font-num text-right">{item.workDays}</td>
                                <td className="py-2 px-2 font-num text-right whitespace-nowrap">{item.totalRegularHours.toFixed(1)} / {item.totalOTHours.toFixed(1)}</td>
                                <td className="py-2 px-2 font-num text-right">{money(item.totalSalary)}</td>
                                <td className="py-2 px-2 font-num text-right">{item.totalOTPay > 0 ? money(item.totalOTPay) : '-'}</td>
                                <td className="py-2 px-2 font-num text-right">{item.totalAllowances > 0 ? `+${money(item.totalAllowances)}` : '-'}</td>
                                <td className="py-2 px-2 font-num text-right">{item.totalDeduct > 0 ? `−${money(item.totalDeduct)}` : '-'}</td>
                                <td className="py-2 pl-2 font-num text-right font-semibold text-charcoal">{money(item.netSalary)}</td>
                            </tr>
                        );
                    })}
                </tbody>
                <tfoot className="border-t-2 border-charcoal">
                    <tr className="font-semibold text-charcoal">
                        <td className="py-2 pr-2">รวม</td>
                        <td className="py-2 px-2 font-num text-right">{totals.days}</td>
                        <td className="py-2 px-2 font-num text-right whitespace-nowrap">{totals.reg.toFixed(1)} / {totals.otH.toFixed(1)}</td>
                        <td className="py-2 px-2 font-num text-right">{money(totals.salary)}</td>
                        <td className="py-2 px-2 font-num text-right">{money(totals.ot)}</td>
                        <td className="py-2 px-2 font-num text-right">{money(totals.add)}</td>
                        <td className="py-2 px-2 font-num text-right">{money(totals.deduct)}</td>
                        <td className="py-2 pl-2 font-num text-right">{money(totals.net)}</td>
                    </tr>
                </tfoot>
            </table></div>
            <p className="text-xs text-neutral mt-2">จำนวนเงินเป็นบาท · ชม. คือชั่วโมงปกติ / OT</p>

            <section className="grid grid-cols-2 gap-10 mt-14 avoid-break text-center">
                {['ผู้จัดทำ', 'ผู้อนุมัติจ่าย'].map(r => (
                    <div key={r}>
                        <div className="border-b border-charcoal h-12" />
                        <p className="text-sm text-charcoal mt-2">{r}</p>
                        <p className="text-sm text-neutral">วันที่ ...... / ...... / ............</p>
                    </div>
                ))}
            </section>
            <p className="text-xs text-neutral mt-10 text-center">คำนวณจากตารางงานและเวลาเข้า-ออกจริง · ระบบ ONHAUS</p>
        </article>
    );

    const renderSlip = (item) => {
        const days = item.dailyDetails || [];
        const shown = days.filter(d => (d.wage + d.ot) > 0 || d.in !== '-' || d.out !== '-' || isException(d));
        const hidden = days.length - shown.length;
        const earn = [
            ['ค่าแรง', item.totalSalary],
            item.totalOTPay > 0 && [`OT ${item.totalOTHours.toFixed(1)} ชม.`, item.totalOTPay],
            item.monthlyAllowance > 0 && ['ค่าตำแหน่ง / เบี้ยเลี้ยง', item.monthlyAllowance],
            item.isDiligenceEarned && item.diligenceAllowance > 0 && ['เบี้ยขยัน', item.diligenceAllowance],
            ...(item.adjustments || []).filter(a => a.type === 'bonus').map(a => [`โบนัส${adjReason(a) ? ` · ${adjReason(a)}` : ''}`, a.amount]),
        ].filter(Boolean);
        const ded = [
            ...(item.adjustments || []).filter(a => a.type !== 'bonus').map(a => [`${ADJ_TH[a.type] || 'หักเงิน'}${adjReason(a) ? ` · ${adjReason(a)}` : ''}${a.is_percentage ? ` (${a.raw}%)` : ''}`, a.amount]),
            item.awayDeduct > 0 && [`ออกระหว่างวัน ${awayFmt(item.totalAwayMins)}`, item.awayDeduct],
            item.taxDeduct > 0 && ['ภาษีหัก ณ ที่จ่าย', item.taxDeduct],
            item.ssoDeduct > 0 && ['ประกันสังคม', item.ssoDeduct],
        ].filter(Boolean);
        const earnTotal = earn.reduce((s, [, v]) => s + v, 0);

        return (
            <article key={item.emp.id} ref={el => { slipRefs.current[item.emp.id] = el; }} className="doc print-page bg-cream border border-rule mx-auto p-8 sm:p-10 mb-8">
                <DocHeader title="สลิปเงินเดือน" month={monthLabel} right={<p className="text-sm text-neutral">รหัส <span className="font-num">{String(item.emp.id).padStart(4, '0')}</span></p>} />

                <section className="grid sm:grid-cols-2 gap-px bg-rule border border-rule mb-5 [&>div]:bg-cream avoid-break">
                    <div className="px-4 py-3">
                        <p className="text-sm text-neutral">พนักงาน</p>
                        <p className="text-lg font-semibold text-charcoal">{item.emp.name}{item.emp.nickname ? ` (${item.emp.nickname})` : ''}</p>
                        <p className="text-sm text-subtle">{item.emp.position || '-'} · {WAGE_TH[item.wageType] || item.wageType}</p>
                    </div>
                    <div className="px-4 py-3">
                        <p className="text-sm text-neutral">สรุปการทำงาน</p>
                        <p className="text-base text-charcoal"><span className="font-num">{item.workDays}</span> วัน · <span className="font-num">{item.totalRegularHours.toFixed(1)}</span> ชม.{item.totalOTHours > 0 && <> · OT <span className="font-num">{item.totalOTHours.toFixed(1)}</span> ชม.</>}</p>
                        {flagsOf(item).length > 0 && <p className="text-sm text-plum">{flagsOf(item).join(' · ')}</p>}
                    </div>
                </section>

                <section className="grid sm:grid-cols-2 gap-5 mb-5 avoid-break">
                    <div>
                        <h2 className="text-sm font-semibold text-charcoal border-b-2 border-charcoal pb-1">รายรับ</h2>
                        {earn.map(([k, v]) => (
                            <div key={k} className="flex justify-between gap-3 py-1.5 border-b border-rule text-sm"><span className="text-subtle">{k}</span><span className="font-num text-charcoal">{money(v)}</span></div>
                        ))}
                        <div className="flex justify-between gap-3 py-1.5 text-sm font-semibold"><span>รวมรายรับ</span><span className="font-num">{money(earnTotal)}</span></div>
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold text-charcoal border-b-2 border-charcoal pb-1">รายการหัก</h2>
                        {ded.length === 0 && <p className="py-1.5 text-sm text-neutral border-b border-rule">ไม่มี</p>}
                        {ded.map(([k, v]) => (
                            <div key={k} className="flex justify-between gap-3 py-1.5 border-b border-rule text-sm"><span className="text-subtle">{k}</span><span className="font-num text-charcoal">{money(v)}</span></div>
                        ))}
                        <div className="flex justify-between gap-3 py-1.5 text-sm font-semibold"><span>รวมหัก</span><span className="font-num">{money(item.totalDeduct)}</span></div>
                    </div>
                </section>

                <section className="border-2 border-charcoal px-4 py-3 mb-6 flex flex-wrap items-end justify-between gap-3 avoid-break">
                    <div>
                        <p className="text-sm font-semibold text-charcoal">ยอดรับสุทธิ</p>
                        <p className="text-sm text-subtle">{item.emp.bank_account ? <>โอนเข้า {item.emp.bank_name || 'บัญชี'} <span className="font-num">{item.emp.bank_account}</span></> : 'ยังไม่มีเลขบัญชีในระบบ'}</p>
                    </div>
                    <p className="font-num text-3xl text-charcoal">{baht(item.netSalary)}</p>
                </section>

                <section className="grid grid-cols-2 gap-10 mt-10 avoid-break text-center">
                    <div><div className="border-b border-charcoal h-10" /><p className="text-sm text-charcoal mt-2">ผู้รับเงิน</p><p className="text-sm text-neutral">({item.emp.name})</p></div>
                    <div><div className="border-b border-charcoal h-10" /><p className="text-sm text-charcoal mt-2">ผู้อนุมัติ</p><p className="text-sm text-neutral">ร้านในบ้าน</p></div>
                </section>
                <p className="text-xs text-neutral mt-6 text-center">พิมพ์เมื่อ {generatedAt.current} · ระบบ ONHAUS</p>
                {/* Page 2 when printed: daily detail attached to the payslip */}
                <section className="print-break-before mt-8 pt-6 border-t border-rule">
                <h2 className="text-sm font-semibold text-charcoal mb-1">รายละเอียดรายวัน · {item.emp.nickname || item.emp.name} · {monthLabel}</h2>
                {shown.length === 0 && <p className="text-sm text-neutral border-y border-rule py-2">ไม่มีการลงเวลาในเดือนนี้</p>}
                {shown.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left border-collapse text-xs">
                    <thead className="border-y border-charcoal text-charcoal">
                        <tr>
                            <th className="py-1.5 pr-2 font-semibold">วันที่</th>
                            <th className="py-1.5 px-2 font-semibold">กะ</th>
                            <th className="py-1.5 px-2 font-semibold">เข้า–ออก</th>
                            <th className="py-1.5 px-2 font-semibold">สถานะ</th>
                            <th className="py-1.5 px-2 font-semibold text-right">ชม.</th>
                            <th className="py-1.5 px-2 font-semibold text-right">OT</th>
                            <th className="py-1.5 pl-2 font-semibold text-right">รวม</th>
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map((d, i) => {
                            const st = statusInfo(d.status);
                            const total = (d.wage || 0) + (d.ot || 0);
                            return (
                                <tr key={i} className="border-b border-rule align-top">
                                    <td className="py-1.5 pr-2 whitespace-nowrap">{format(new Date(`${d.date}T12:00:00`), 'EEE d', { locale: th })}</td>
                                    <td className="py-1.5 px-2 text-subtle">{shiftText(d.shift)}</td>
                                    <td className="py-1.5 px-2 font-num whitespace-nowrap">
                                        {d.in === '-' && d.out === '-' ? '-' : `${d.in === '-' ? '?' : d.in}–${d.out === '-' ? '?' : d.out}`}
                                        {d.away_mins > 0 && <span className="block font-thai text-plum">ออก {awayFmt(d.away_mins)}</span>}
                                    </td>
                                    {/* Colour only, no box: html2canvas draws bordered inline text off its baseline */}
                                    <td className={`py-1.5 px-2 ${toneText[st.tone]}`}>{st.label}</td>
                                    <td className="py-1.5 px-2 font-num text-right">{hrs(d.regular_hours)}</td>
                                    <td className="py-1.5 px-2 font-num text-right">{hrs(d.ot_hours)}</td>
                                    <td className="py-1.5 pl-2 font-num text-right">{total > 0 ? money(total) : '-'}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table></div>}
                {hidden > 0 && shown.length > 0 && <p className="text-xs text-neutral mt-1">ไม่แสดงวันหยุด/วันที่ยังไม่ถึงที่ไม่มีการลงเวลา <span className="font-num">{hidden}</span> วัน</p>}

                </section>

                <div data-export-hide className="no-print mt-6 pt-4 border-t border-rule grid grid-cols-2 gap-3">
                    <button type="button" onClick={() => savePng(item)} disabled={!!busyId} className="min-h-12 border border-charcoal bg-cream hover:bg-paper-2 text-base text-charcoal transition-colors duration-150 disabled:opacity-50">
                        {busyId === `png-${item.emp.id}` ? 'กำลังสร้างรูป…' : 'บันทึกรูป (PNG)'}
                    </button>
                    <button type="button" onClick={() => copyPng(item)} disabled={!!busyId} className="min-h-12 bg-plum hover:bg-plum-2 text-cream text-base font-semibold transition-colors duration-150 disabled:opacity-50">
                        {busyId === `copy-${item.emp.id}` ? 'กำลังคัดลอก…' : 'คัดลอกรูปส่ง LINE'}
                    </button>
                </div>
            </article>
        );
    };

    return (
        <div className="brand-v2 min-h-screen print-root">
            <style jsx global>{`
                @page { size: A4 portrait; margin: 12mm; }
                .doc { max-width: 210mm; }
                @media print {
                    .overflow-x-auto { overflow: visible !important; }
                    table { min-width: 0 !important; }
                    .no-print { display: none !important; }
                    html, body, .print-root { background: #fff !important; }
                    .doc { max-width: none; border: none !important; padding: 0 !important; margin: 0 !important; background: #fff !important; }
                    .doc .bg-cream, .doc [class*="bg-cream"] { background: #fff !important; }
                    .print-page { break-after: page; page-break-after: always; }
                    .print-page:last-child { break-after: auto; page-break-after: auto; }
                    .avoid-break, tr { break-inside: avoid; page-break-inside: avoid; }
                    .print-break-before { break-before: page; page-break-before: always; border-top: none !important; margin-top: 0 !important; }
                    thead { display: table-header-group; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
            `}</style>

            {toast && (
                <div role="status" className={`no-print fixed top-4 right-4 z-[60] max-w-sm flex items-start gap-3 px-4 py-3 border text-base ${toast.type === 'error' ? 'bg-error text-cream border-error' : 'bg-charcoal text-cream border-charcoal'}`}>
                    <span className="flex-1">{toast.message}</span>
                    <button type="button" onClick={() => setToast(null)} className="text-sm font-semibold underline underline-offset-4 shrink-0">ปิด</button>
                </div>
            )}

            <header className="no-print sticky top-0 z-40 bg-plum text-cream border-b border-plum-3">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col lg:flex-row lg:items-stretch">
                    <div className="flex items-stretch flex-1 min-w-0">
                        <a href={`/admin/payroll`} className="min-h-14 pr-4 flex items-center text-base text-on-plum-2 hover:text-cream transition-colors duration-150 border-r border-plum-3">← เงินเดือน</a>
                        <div className="flex-1 px-4 py-3 min-w-0">
                            <h2 className="font-head text-2xl">เอกสารเงินเดือน</h2>
                            <p className="text-sm text-on-plum-2">{monthLabel} · {reportType === 'master' ? 'สรุปทั้งร้าน' : `สลิป ${slips.length} คน`}</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pb-3 lg:pb-0 lg:pl-4 lg:border-l border-plum-3">
                        <div className="grid grid-cols-2 gap-px bg-plum-3 border border-plum-3" role="tablist">
                            {[['master', 'สรุปทั้งร้าน'], ['individual', 'สลิปรายคน']].map(([id, label]) => (
                                <button key={id} type="button" role="tab" aria-selected={reportType === id} onClick={() => setReportType(id)}
                                    className={`min-h-12 px-4 text-base transition-colors duration-150 ${reportType === id ? 'bg-cream text-plum font-semibold' : 'bg-plum text-cream hover:bg-plum-2'}`}>{label}</button>
                            ))}
                        </div>
                        {reportType === 'individual' && (
                            <select value={selectedEmpId} onChange={(e) => setSelectedEmpId(e.target.value)} aria-label="เลือกพนักงาน"
                                className="min-h-12 px-3 bg-plum-2 border border-plum-3 text-base text-cream">
                                <option value="ALL">ทุกคน ({people.length})</option>
                                {people.map(e => <option key={e.emp.id} value={e.emp.id}>{e.emp.nickname || e.emp.name}</option>)}
                            </select>
                        )}
                        <button type="button" onClick={() => window.print()} className="min-h-12 px-5 bg-charcoal hover:bg-charcoal-2 text-cream text-base font-semibold transition-colors duration-150">
                            พิมพ์ / บันทึก PDF
                        </button>
                    </div>
                </div>
            </header>

            <main className="px-4 sm:px-6 py-6">
                {reportType === 'individual'
                    ? (slips.length === 0
                        ? <p className="doc mx-auto border border-rule bg-cream p-12 text-center text-base text-neutral">ไม่มีข้อมูลเงินเดือนของพนักงานที่เลือกในเดือนนี้</p>
                        : slips.map(renderSlip))
                    : renderMaster()}
            </main>
        </div>
    );
}

export default function PayrollPDFReport() {
    return (
        <Suspense fallback={<div className="brand-v2 min-h-screen p-20 text-center text-base text-neutral">กำลังโหลดเอกสาร…</div>}>
            <PayrollPDFReportContent />
        </Suspense>
    );
}
