/* Hallmark · route: custom (bespoke) · structure: operations portal hub
 * paper: oklch(96% 0.006 80) · accent: oklch(62% 0.16 45) · display: Geist Mono · body: Geist Sans
 * axes: light / geometric-sans / warm · gates: all-pass
 */
"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import NavigationDock from "./_components/NavigationDock";
import { format } from "date-fns";
import { th } from "date-fns/locale";

export default function OperationsHub() {
  const [time, setTime] = useState<Date | null>(null);

  useEffect(() => {
    setTime(new Date());
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const CORE_MODULES = [
    {
      href: "/checkin",
      code: "MOD-01",
      title: "ลงเวลาเข้า-ออกงาน",
      subtitle: "GPS & QR Attendance with Live Shift Context",
      badge: "LIVE PUNCH",
      badgeColor: "bg-rams-green text-rams-panel",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
      highlight: true
    },
    {
      href: "/shifts",
      code: "MOD-02",
      title: "ตารางงาน & ตลาดแลกกะ",
      subtitle: "Weekly Roster, Shift Swap Pool & Team Matrix",
      badge: "ROSTER",
      badgeColor: "bg-rams-bg text-rams-ink border border-rams-rule-light",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="4" width="18" height="18" rx="1" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      )
    },
    {
      href: "/leave",
      code: "MOD-03",
      title: "ยื่นขอลาหยุด",
      subtitle: "Sick, Business, Vacation & Replacement Assign",
      badge: "LEAVE",
      badgeColor: "bg-rams-bg text-rams-ink border border-rams-rule-light",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M16 2v4" />
          <path d="M8 2v4" />
          <path d="M3 10h18" />
          <path d="M12 22v-6" />
          <path d="M15 19l-3 3-3-3" />
          <rect x="3" y="4" width="18" height="18" rx="1" />
        </svg>
      )
    },
    {
      href: "/checklist",
      code: "MOD-04",
      title: "เช็กลิสต์เปิด-ปิดร้าน",
      subtitle: "Opening & Closing SOP with Photo & POS Proof",
      badge: "OPERATIONS",
      badgeColor: "bg-rams-bg text-rams-ink border border-rams-rule-light",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
        </svg>
      )
    },
    {
      href: "/stock/audit",
      code: "MOD-05",
      title: "นับสต็อกวัตถุดิบ",
      subtitle: "Daily & Weekly Bar/Kitchen Inventory Audit",
      badge: "STOCK",
      badgeColor: "bg-rams-bg text-rams-ink border border-rams-rule-light",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      )
    },
    {
      href: "/admin",
      code: "MOD-06",
      title: "ระบบจัดการหลังบ้าน & เงินเดือน",
      subtitle: "Master Roster, Payroll Calculation & Staff Control",
      badge: "MANAGEMENT",
      badgeColor: "bg-rams-ink text-rams-panel",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
      )
    }
  ];

  return (
    <div className="min-h-screen bg-rams-bg text-rams-ink safe-bottom-dock">
      {/* Top Header */}
      <header className="border-b border-rams-rule-light bg-rams-panel px-6 py-5">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rams-orange animate-pulse"></span>
              <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-rams-ink-muted">
                IN THE HAUS · HR & OPS SUITE
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-mono font-bold tracking-tight text-rams-ink mt-1">
              OPERATIONS PORTAL
            </h1>
          </div>

          {/* Clock & Status */}
          <div className="flex items-center gap-4 bg-rams-bg border border-rams-rule-light px-4 py-2 rounded-sm self-start sm:self-auto">
            <div className="text-left sm:text-right">
              <div className="text-[9px] font-mono uppercase text-rams-ink-muted tracking-widest">
                {time ? format(time, "EEEE, d MMM yyyy", { locale: th }) : "SYSTEM READY"}
              </div>
              <div className="text-sm font-mono font-bold text-rams-ink tracking-wider">
                {time ? format(time, "HH:mm:ss") : "--:--:--"}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="max-w-4xl mx-auto px-6 pt-8 pb-12">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-rams-ink-muted">
            AVAILABLE SERVICES ({CORE_MODULES.length})
          </span>
          <span className="text-[10px] font-mono text-rams-ink-muted">
            VER 2.6 · DIETER RAMS SYSTEM
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CORE_MODULES.map((mod) => (
            <Link
              key={mod.href}
              href={mod.href}
              className={`group bg-rams-panel border ${
                mod.highlight
                  ? "border-rams-orange ring-1 ring-rams-orange/30 shadow-[0_2px_0_0_var(--color-rams-orange)]"
                  : "border-rams-rule-light hover:border-rams-rule shadow-[0_2px_0_0_var(--color-rams-rule-light)]"
              } p-5 rounded-sm transition-all duration-150 active:translate-y-[1px] active:shadow-none flex flex-col justify-between`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-rams-ink-muted">
                    {mod.code}
                  </span>
                  <span
                    className={`text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm ${mod.badgeColor}`}
                  >
                    {mod.badge}
                  </span>
                </div>

                <div className="flex items-start gap-3">
                  <div
                    className={`p-2.5 rounded-sm border ${
                      mod.highlight
                        ? "bg-rams-orange text-rams-panel border-rams-orange"
                        : "bg-rams-bg text-rams-ink border-rams-rule-light group-hover:border-rams-rule"
                    } transition-colors flex-shrink-0`}
                  >
                    {mod.icon}
                  </div>
                  <div>
                    <h2 className="font-mono font-bold text-sm sm:text-base text-rams-ink group-hover:text-rams-orange transition-colors">
                      {mod.title}
                    </h2>
                    <p className="text-[11px] text-rams-ink-muted font-sans mt-0.5 line-clamp-2 leading-relaxed">
                      {mod.subtitle}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-rams-rule-light/60 flex items-center justify-between text-[10px] font-mono font-bold text-rams-ink-muted group-hover:text-rams-ink">
                <span>ENTER SERVICE</span>
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </div>
            </Link>
          ))}
        </div>
      </main>

      {/* Global Dock Navigation */}
      <NavigationDock />
    </div>
  );
}
