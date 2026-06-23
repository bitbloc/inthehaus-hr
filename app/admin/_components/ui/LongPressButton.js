import { useState, useRef, useEffect } from "react";
import clsx from "clsx";

export function LongPressButton({ onLongPress, className, label = "Delete", duration = 1500 }) {
    const [pressing, setPressing] = useState(false);
    const [progress, setProgress] = useState(0);
    const timerRef = useRef(null);
    const reqRef = useRef(null);
    const startTimeRef = useRef(0);

    const start = () => {
        setPressing(true);
        startTimeRef.current = Date.now();
        timerRef.current = setTimeout(() => {
            onLongPress();
            stop();
        }, duration);

        const animate = () => {
            const elapsed = Date.now() - startTimeRef.current;
            const p = Math.min((elapsed / duration) * 100, 100);
            setProgress(p);
            if (p < 100) reqRef.current = requestAnimationFrame(animate);
        };
        reqRef.current = requestAnimationFrame(animate);
    };

    const stop = () => {
        clearTimeout(timerRef.current);
        cancelAnimationFrame(reqRef.current);
        setPressing(false);
        setProgress(0);
    };

    return (
        <button
            onMouseDown={start}
            onMouseUp={stop}
            onMouseLeave={stop}
            onTouchStart={start}
            onTouchEnd={stop}
            className={clsx("relative overflow-hidden bg-rams-red/10 text-rams-red border border-rams-red/20 px-3 py-1 rounded-sm font-mono font-bold text-[10px] uppercase tracking-wider select-none hover:bg-rams-red/20 active:translate-y-[1px] transition-all cursor-pointer", className)}
        >
            <span className="relative z-10">{pressing ? "HOLD..." : label}</span>
            <div
                style={{ width: `${progress}%` }}
                className="absolute left-0 top-0 bottom-0 bg-rams-red/35 z-0 transition-all duration-75 ease-linear"
            />
        </button>
    );
}

