"use client";
/* Plum toolbar (back, title, month, print) + A4 cream document for monthly reports. */

import { PRINT_CSS, monthLabel } from "./monthTools";

export default function ReportShell({ backHref = "/admin", backLabel = "หลังบ้าน", toolTitle, toolSub, month, onMonth, docTitle, footNote = "ข้อมูลจากกลุ่ม LINE ของร้าน ตรวจและบันทึกโดยยูซุ", toolExtra = null, children }) {
    return (
        <div className="brand-v2 min-h-screen print-root">
            <style jsx global>{PRINT_CSS}</style>

            <header className="no-print sticky top-0 z-40 bg-plum text-cream border-b border-plum-3">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row sm:items-stretch">
                    <div className="flex items-stretch flex-1 min-w-0">
                        <a href={backHref} className="min-h-14 pr-4 flex items-center text-base text-on-plum-2 hover:text-cream transition-colors duration-150 border-r border-plum-3">← {backLabel}</a>
                        <div className="flex-1 px-4 py-3 min-w-0">
                            <h2 className="font-head text-2xl">{toolTitle}</h2>
                            <p className="text-sm text-on-plum-2">{toolSub}</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pb-3 sm:pb-0 sm:pl-4 sm:border-l border-plum-3">
                        {toolExtra}
                        <label className="flex items-center">
                            <span className="sr-only">เดือน</span>
                            <input type="month" value={month} onChange={(e) => e.target.value && onMonth(e.target.value)} className="min-h-12 px-3 bg-plum-2 border border-plum-3 font-num text-base text-cream [color-scheme:dark]" />
                        </label>
                        <button type="button" onClick={() => window.print()} className="min-h-12 px-5 bg-charcoal hover:bg-charcoal-2 text-cream text-base font-semibold whitespace-nowrap transition-colors duration-150">
                            พิมพ์ / บันทึก PDF
                        </button>
                    </div>
                </div>
            </header>

            <main className="px-4 sm:px-6 py-8">
                <article className="doc bg-cream border border-rule mx-auto p-6 sm:p-10">
                    <div className="flex items-start justify-between gap-6 border-b-2 border-charcoal pb-5 mb-6">
                        <div>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/logo-inbaan-wordmark-charcoal-96.png" alt="ในบ้าน" width={73} height={40} className="h-10 w-auto" />
                            <h1 className="font-head text-3xl leading-normal text-charcoal mt-3">{docTitle}</h1>
                            <p className="text-base text-neutral">ประจำเดือน {monthLabel(month)}</p>
                        </div>
                        <div className="text-right text-sm text-neutral shrink-0">
                            <p>พิมพ์เมื่อ</p>
                            <p className="font-num text-charcoal">{new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" })}</p>
                        </div>
                    </div>

                    {children}

                    <footer className="mt-10 pt-4 border-t border-rule flex justify-between gap-4 text-sm text-neutral">
                        <span>{footNote}</span>
                        <span className="shrink-0">ในบ้าน นครพนม</span>
                    </footer>
                </article>
            </main>
        </div>
    );
}
