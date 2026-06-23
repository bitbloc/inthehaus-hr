import clsx from "clsx";
import { twMerge } from "tailwind-merge";

export function Badge({ children, color = "slate", icon, className }) {
    const colors = {
        slate: "bg-rams-bg text-rams-ink-muted border-rams-rule-light",
        emerald: "bg-rams-green/10 text-rams-green border-rams-green/30",
        rose: "bg-rams-red/10 text-rams-red border-rams-red/30",
        amber: "bg-rams-amber/10 text-rams-amber border-rams-amber/30",
        blue: "bg-rams-orange/10 text-rams-orange border-rams-orange/30",
        purple: "bg-rams-bg text-rams-ink border-rams-rule-light",
        orange: "bg-rams-orange/10 text-rams-orange border-rams-orange/30",
    };

    return (
        <span
            className={twMerge(
                clsx(
                    "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-sm text-[9px] font-mono font-bold uppercase tracking-widest border",
                    colors[color] || colors.slate,
                    className
                )
            )}
        >
            {icon && <span className="opacity-85">{icon}</span>}
            {children}
        </span>
    );
}

