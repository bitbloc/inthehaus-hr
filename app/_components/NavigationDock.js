// Reusable Navigation Dock Component
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const Icons = {
    Calendar: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></svg>,
    Home: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
    Leave: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /><path d="M12 22v-6" /><path d="M15 19l-3 3-3-3" /><rect x="3" y="4" width="18" height="18" rx="2" /></svg>,
    Swap: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" /></svg>
};

export default function NavigationDock() {
    const pathname = usePathname();

    const NAV_ITEMS = [
        { href: "/leave", label: "LEAVE", icon: Icons.Leave },
        { href: "/checkin", label: "HOME", icon: Icons.Home, isCenter: true },
        { href: "/shifts", label: "SWAP", icon: Icons.Swap },
    ];

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-sm px-6">
            <div className="bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.1)] rounded-[2rem] p-2 flex justify-between items-center">

                {NAV_ITEMS.map((item, index) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;

                    if (item.isCenter) {
                        return (
                            <div key={item.href} className="relative flex-1 flex justify-center">
                                <div className="flex-1 flex flex-col items-center py-2 gap-1 text-neutral-900 font-bold relative">
                                    {isActive && <div className="absolute -top-1 w-1 h-1 bg-neutral-900 rounded-full"></div>}
                                    <Link href={item.href} className={`bg-white p-2 rounded-2xl -mt-2 shadow-sm border border-neutral-100 ${isActive ? '' : 'text-neutral-400 hover:text-neutral-900'}`}>
                                        <Icon />
                                    </Link>
                                </div>
                            </div>
                        )
                    }

                    return (
                        <div key={item.href} className="flex-1 flex justify-center">
                            <Link href={item.href} className={`flex flex-col items-center py-2 gap-1 transition-colors group ${isActive ? 'text-neutral-900' : 'text-neutral-400 hover:text-neutral-900'}`}>
                                <div className="group-hover:scale-110 transition-transform"><Icon /></div>
                                <span className="text-[9px] font-bold tracking-wide">{item.label}</span>
                            </Link>
                        </div>
                    )
                })}

            </div>
        </div>
    );
}
