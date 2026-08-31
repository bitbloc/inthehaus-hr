// Reusable Tactile Navigation Dock Component (5-Module Operations)
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const Icons = {
  Home: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  Shifts: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  Leave: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
      <path d="M12 22v-6" />
      <path d="M15 19l-3 3-3-3" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
    </svg>
  ),
  Checklist: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  ),
  Stock: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  )
};

export default function NavigationDock() {
  const pathname = usePathname();

  const NAV_ITEMS = [
    { href: "/leave", label: "LEAVE", icon: Icons.Leave },
    { href: "/shifts", label: "SHIFTS", icon: Icons.Shifts },
    { href: "/checkin", label: "CHECKIN", icon: Icons.Home, isCenter: true },
    { href: "/checklist", label: "CHECKLIST", icon: Icons.Checklist },
    { href: "/stock/audit", label: "STOCK", icon: Icons.Stock }
  ];

  return (
    <nav
      aria-label="Staff Navigation"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-md px-4 pointer-events-none"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      <div className="pointer-events-auto bg-rams-panel border border-rams-rule p-1.5 flex justify-between items-center rounded-sm shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;

          if (item.isCenter) {
            return (
              <div key={item.href} className="relative flex-1 flex justify-center">
                <div className="flex flex-col items-center py-1 font-mono font-bold relative">
                  {isActive && (
                    <div className="absolute -top-3 w-2 h-2 bg-rams-orange border border-rams-rule rounded-full animate-pulse"></div>
                  )}
                  <Link
                    href={item.href}
                    title="ลงเวลาเข้างาน"
                    className={`p-2.5 rounded-sm -mt-4 border active:translate-y-[2px] transition-all flex items-center justify-center ${
                      isActive
                        ? "bg-rams-orange text-rams-panel border-rams-rule shadow-[0_2px_0_0_var(--color-rams-rule)]"
                        : "bg-rams-bg text-rams-ink border-rams-rule hover:border-rams-orange"
                    }`}
                  >
                    <Icon />
                  </Link>
                  <span
                    className={`text-[8px] font-mono font-bold tracking-wider mt-1 ${
                      isActive ? "text-rams-orange" : "text-rams-ink-muted"
                    }`}
                  >
                    {item.label}
                  </span>
                </div>
              </div>
            );
          }

          return (
            <div key={item.href} className="flex-1 flex justify-center">
              <Link
                href={item.href}
                className={`flex flex-col items-center py-1.5 px-1 rounded-sm transition-colors group active:translate-y-[1px] relative w-full ${
                  isActive ? "text-rams-orange" : "text-rams-ink-muted hover:text-rams-ink"
                }`}
              >
                {isActive && (
                  <div className="w-1 h-1 bg-rams-orange rounded-full mb-1"></div>
                )}
                <div className="transition-transform duration-150 group-hover:scale-105">
                  <Icon />
                </div>
                <span className="text-[8px] font-mono font-bold tracking-wider mt-1 truncate max-w-[55px] text-center">
                  {item.label}
                </span>
              </Link>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
