import clsx from "clsx";
import { motion } from "framer-motion";

export function TabButton({ active, onClick, label }) {
    return (
        <button
            onClick={onClick}
            className={clsx(
                "relative flex items-center gap-2 min-h-11 px-3.5 text-sm font-semibold whitespace-nowrap transition-colors duration-150 z-10 flex-shrink-0 select-none cursor-pointer border border-transparent",
                active
                    ? "text-cream"
                    : "text-neutral hover:text-charcoal hover:bg-cream"
            )}
        >
            {active && (
                <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-charcoal border border-charcoal"
                    transition={{ type: "tween", duration: 0.18 }}
                    style={{ zIndex: -1 }}
                />
            )}
            <span className="relative z-10">{label}</span>
        </button>
    );
}

