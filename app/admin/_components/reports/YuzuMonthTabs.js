"use client";
/* Monthly views inside the Yuzu page: "สลิปโอน" and "บันทึกเอสเปรสโซ".
 * Same data and numbers as the A4 reports; each has a link to print. */

import { useState } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import { thisMonth, monthLabel, baht, bkk, dayLabel } from "./monthTools";
import { useSlipMonth, SlipMonthBody, tierOf } from "./SlipMonth";
import { useEspressoMonth, EspressoMonthBody } from "./EspressoMonth";

function MonthBar({ month, setMonth, title, sub, printHref }) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-charcoal pb-3">
            <div>
                <h3 className="text-xl font-semibold text-charcoal">{title} · {monthLabel(month)}</h3>
                {sub && <p className="text-sm text-neutral">{sub}</p>}
            </div>
            <div className="flex items-end gap-2">
                <label className="text-sm text-neutral">
                    เดือน
                    <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="block mt-1 min-h-11 px-3 bg-cream border border-charcoal font-num text-base text-charcoal" />
                </label>
                <a href={printHref} target="_blank" rel="noopener noreferrer" className="min-h-11 px-4 flex items-center bg-charcoal hover:bg-charcoal-2 text-cream text-base font-semibold whitespace-nowrap transition-colors duration-150">
                    พิมพ์ / PDF
                </a>
            </div>
        </div>
    );
}

export function YuzuSlipMonth() {
    const [month, setMonth] = useState(thisMonth);
    const data = useSlipMonth(month);
    const [showAll, setShowAll] = useState(false);
    const list = [...data.slips].reverse();
    const shown = showAll ? list : list.slice(0, 30);

    const remove = async (id) => {
        if (!confirm("ยืนยันการลบรายการสลิปนี้?")) return;
        const { error } = await supabase.from("slip_transactions").update({ is_deleted: true }).eq("id", id);
        if (error) alert("ลบไม่สำเร็จ: " + error.message);
        else data.reload();
    };

    return (
        <div className="space-y-6">
            <MonthBar month={month} setMonth={setMonth} title="สลิปโอน" sub={`${data.summary.n} ใบ · ฿${baht(data.summary.total)}`} printHref={`/admin/report/slips?month=${month}`} />
            <SlipMonthBody data={data} showList={false} />

            {!data.loading && list.length > 0 && (
                <section>
                    <h2 className="text-lg font-semibold text-charcoal border-b border-charcoal pb-2">สลิปล่าสุดในเดือน</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-base border-collapse">
                            <thead>
                                <tr className="border-b border-charcoal text-sm text-neutral text-left">
                                    <th className="py-2 pr-2 font-semibold">วันที่</th>
                                    <th className="py-2 px-2 font-semibold">ผู้โอน</th>
                                    <th className="py-2 px-2 font-semibold">พนักงาน</th>
                                    <th className="py-2 px-2 font-semibold">วิธีตรวจ</th>
                                    <th className="py-2 px-2 font-semibold text-right">ยอด (บาท)</th>
                                    <th className="py-2 pl-2 font-semibold text-right">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {shown.map((s) => (
                                    <tr key={s.id} className="border-b border-rule align-top">
                                        <td className="py-2 pr-2 whitespace-nowrap text-charcoal">{dayLabel(s.date)}<span className="block text-sm text-neutral font-num">{bkk(s.timestamp).time}</span></td>
                                        <td className="py-2 px-2 text-charcoal">{s.sender_name || "-"}<span className="block text-sm text-neutral">{s.bank_name || ""}</span></td>
                                        <td className="py-2 px-2 text-charcoal">{data.nameOf(s.user_id)}</td>
                                        <td className="py-2 px-2 text-neutral">{tierOf(s).label}</td>
                                        <td className="py-2 px-2 text-right font-num text-charcoal">{baht(s.amount)}</td>
                                        <td className="py-2 pl-2">
                                            <div className="flex justify-end gap-1 whitespace-nowrap">
                                                {s.slip_url && (
                                                    <a href={s.slip_url} target="_blank" rel="noreferrer" className="min-h-11 px-3 flex items-center border border-charcoal text-sm font-semibold text-charcoal hover:bg-paper-2">ดูสลิป</a>
                                                )}
                                                <button type="button" onClick={() => remove(s.id)} className="min-h-11 px-3 text-sm font-semibold text-error hover:underline underline-offset-4">ลบ</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {list.length > 30 && (
                        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 min-h-11 px-4 border border-charcoal text-base font-semibold text-charcoal hover:bg-paper-2">
                            {showAll ? "แสดง 30 ใบล่าสุด" : `แสดงทั้งหมด ${list.length} ใบ`}
                        </button>
                    )}
                </section>
            )}
        </div>
    );
}

export function YuzuEspressoMonth() {
    const [month, setMonth] = useState(thisMonth);
    const data = useEspressoMonth(month);
    return (
        <div className="space-y-6">
            <MonthBar month={month} setMonth={setMonth} title="บันทึกเอสเปรสโซ" sub={`${data.summary.n} ช็อต`} printHref={`/admin/report/espresso?month=${month}`} />
            <EspressoMonthBody data={data} />
        </div>
    );
}
