import clsx from "clsx";
import { motion } from "framer-motion";

export function TabButton({ active, onClick, label, icon: Icon, id }) {
    return (
        <button
            onClick={onClick}
            className={clsx(
                "relative flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold transition-all duration-300 ease-out z-10",
                active
                    ? "text-white scale-105"
                    : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
            )}
        >
            {active && (
                <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-slate-800 rounded-2xl shadow-lg shadow-slate-200"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    style={{ zIndex: -1 }}
                />
            )}
            {Icon && <Icon size={16} strokeWidth={2.5} />}
            <span className="relative z-10">{label}</span>
        </button>
    );
}
