/* Brand v2 · staff home. Plum header with the ในบ้าน wordmark, one charcoal primary
 * (ลงเวลาเข้า-ออก), every other place as one bordered list. Thai first, no icons,
 * nothing that ticks: the clock updates once a minute and renders only in the browser.
 * Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5 */
"use client";
import React, { useSyncExternalStore } from "react";
import Link from "next/link";
import NavigationDock from "./_components/NavigationDock";
import { format } from "date-fns";
import { th } from "date-fns/locale";

type Place = { href: string; title: string; note: string; tag: string; external?: boolean };

const PLACES: Place[] = [
  { href: "/shifts", title: "ตารางกะ และแลกกะ", note: "ดูกะของตัวเองและทีม ประกาศขอแลกกะ", tag: "SHIFTS" },
  { href: "/leave", title: "ลางาน", note: "ลาป่วย ลากิจ พักร้อน และหาคนแทน", tag: "LEAVE" },
  { href: "/checklist", title: "เช็กลิสต์เปิด-ปิดร้าน", note: "ทำตามขั้นตอนพร้อมถ่ายรูปยืนยัน", tag: "CHECKLIST" },
  { href: "https://haustable.vercel.app/staff/stock", title: "นับสต็อก", note: "นับวัตถุดิบบาร์และครัว · เปิดในระบบร้าน", tag: "STOCK", external: true },
  { href: "/meetings", title: "บันทึกการประชุม", note: "อ่านสรุปการประชุมของทีม", tag: "PDF" },
];

// Current minute as a number: React re-renders only when the minute changes (no per-second tick).
// The server snapshot is null, so server and browser HTML match (no hydration error).
const subscribeMinute = (onChange: () => void) => {
  const id = setInterval(onChange, 10_000);
  return () => clearInterval(id);
};
const getMinute = () => Math.floor(Date.now() / 60_000);
const getServerMinute = () => null;

export default function OperationsHub() {
  const minute = useSyncExternalStore(subscribeMinute, getMinute, getServerMinute);
  const now = minute === null ? null : new Date(minute * 60_000);

  const dateLabel = now ? `${format(now, "EEEEที่ d MMMM", { locale: th })} ${now.getFullYear() + 543}` : " ";

  return (
    <div className="brand-v2 min-h-screen safe-bottom-dock">
      <header className="bg-plum text-cream border-b border-plum-3">
        <div className="max-w-2xl mx-auto px-4 flex items-stretch">
          <div className="flex-1 py-4 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-inbaan-wordmark-cream-96.png" alt="ในบ้าน" width={87} height={48} className="h-12 w-auto" />
            <p className="text-sm text-on-plum-2 mt-1">ศูนย์งานพนักงาน</p>
          </div>
          <div className="pl-4 border-l border-plum-3 py-4 flex flex-col justify-end items-end text-right">
            <p className="font-num text-3xl">{now ? format(now, "HH:mm") : "--:--"}</p>
            <p className="text-sm text-on-plum-2">{dateLabel}</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">
        {/* One primary: clock in / out */}
        <Link
          href="/checkin"
          className="min-h-[88px] px-5 py-4 bg-charcoal hover:bg-charcoal-2 text-cream flex items-center justify-between gap-4 transition-colors duration-150"
        >
          <span>
            <span className="block text-2xl font-semibold">ลงเวลาเข้า-ออก</span>
            <span className="block text-base opacity-80">ถ่ายรูปยืนยัน · GPS, NFC หรือ QR ของร้าน</span>
          </span>
          <span className="font-num text-xs tracking-[0.14em] opacity-70 shrink-0">CHECK IN</span>
        </Link>

        <nav aria-label="เมนูพนักงาน" className="border border-charcoal bg-cream divide-y divide-rule">
          {PLACES.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              {...(p.external ? { target: "_blank", rel: "noopener" } : {})}
              className="min-h-16 px-4 py-3 flex items-center justify-between gap-4 hover:bg-paper-2 transition-colors duration-150"
            >
              <span className="min-w-0">
                <span className="block text-lg font-semibold text-charcoal">{p.title}</span>
                <span className="block text-sm text-subtle">{p.note}</span>
              </span>
              <span className="font-num text-xs tracking-[0.1em] text-neutral shrink-0">{p.tag}{p.external ? " ↗" : ""}</span>
            </Link>
          ))}
        </nav>

        <Link
          href="/admin"
          className="min-h-16 px-4 py-3 border border-rule bg-cream hover:bg-paper-2 flex items-center justify-between gap-4 transition-colors duration-150"
        >
          <span className="min-w-0">
            <span className="block text-lg font-semibold text-charcoal">หลังบ้าน และเงินเดือน</span>
            <span className="block text-sm text-subtle">ตารางงาน เงินเดือน และพนักงาน · <span className="whitespace-nowrap">สำหรับผู้จัดการ</span></span>
          </span>
          <span className="font-num text-xs tracking-[0.1em] text-neutral shrink-0">ADMIN</span>
        </Link>

        <p className="text-center font-num text-xs tracking-[0.16em] text-neutral pt-2">ONHAUS SYSTEM</p>
      </main>

      <NavigationDock />
    </div>
  );
}
