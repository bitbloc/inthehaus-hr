import clsx from "clsx";
import { twMerge } from "tailwind-merge";

export function Badge({ children, color = "slate", icon, className }) {
    const colors = {
        slate: "bg-cream text-neutral border-rule",
        emerald: "bg-cream text-charcoal border-charcoal",
        rose: "bg-plum text-cream border-plum", // red is for errors only (Brand v2)
        amber: "bg-plum/10 text-plum border-plum/30",
        blue: "bg-plum/10 text-plum border-plum/30",
        purple: "bg-cream text-charcoal border-rule",
        orange: "bg-plum/10 text-plum border-plum/30",
    };

    return (
        <span
            className={twMerge(
                clsx(
                    "inline-flex items-center gap-1.5 px-2 py-0.5 text-sm font-semibold border",
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

