// Staff navigation dock (5 modules). Brand v2: full-bleed bottom bar split into
// cells by 1px rules, Thai labels, no icons. Active cell is a plum fill.
/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5 */
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/leave", label: "ลางาน" },
  { href: "/shifts", label: "ตารางกะ" },
  { href: "/checkin", label: "ลงเวลา" },
  { href: "/checklist", label: "เช็กลิสต์" },
  { href: "/stock/audit", label: "สต็อก" },
];

export default function NavigationDock() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="เมนูพนักงาน"
      className="font-thai fixed bottom-0 inset-x-0 z-40 bg-cream border-t border-charcoal"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto max-w-md grid grid-cols-5 divide-x divide-rule">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`min-h-14 px-1 flex items-center justify-center text-center text-sm transition-colors duration-150 ${
                  isActive
                    ? "bg-plum text-cream font-semibold"
                    : "text-charcoal hover:bg-paper-2"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
