import clsx from "clsx";
import { motion } from "framer-motion";

export function TabButton({ active, onClick, label, icon: Icon, id }) {
    return (
        <button
            onClick={onClick}
            className={clsx(
                "relative flex items-center gap-2 px-3.5 py-2 rounded-sm text-xs font-mono font-bold uppercase tracking-wider transition-all z-10 flex-shrink-0 select-none cursor-pointer border border-transparent",
                active
                    ? "text-rams-panel"
                    : "text-rams-ink-muted hover:text-rams-ink hover:bg-rams-panel/50"
            )}
        >
            {active && (
                <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-rams-ink rounded-sm border border-rams-rule"
                    transition={{ type: "tween", duration: 0.18 }}
                    style={{ zIndex: -1 }}
                />
            )}
            {Icon && <Icon size={14} strokeWidth={2.5} />}
            <span className="relative z-10">{label}</span>
        </button>
    );
}

