import clsx from "clsx";
import { twMerge } from "tailwind-merge";

export function Badge({ children, color = "slate", icon, className }) {
    const colors = {
        slate: "bg-slate-100 text-slate-600 border-slate-200",
        emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
        rose: "bg-rose-50 text-rose-600 border-rose-100",
        amber: "bg-amber-50 text-amber-600 border-amber-100",
        blue: "bg-blue-50 text-blue-600 border-blue-100",
        purple: "bg-purple-50 text-purple-600 border-purple-100",
        orange: "bg-orange-50 text-orange-600 border-orange-100",
    };

    return (
        <span
            className={twMerge(
                clsx(
                    "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide border",
                    colors[color] || colors.slate,
                    className
                )
            )}
        >
            {icon && <span className="opacity-70">{icon}</span>}
            {children}
        </span>
    );
}
