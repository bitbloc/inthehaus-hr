import { useState, useRef, useEffect, useCallback } from "react";
import clsx from "clsx";

export function LongPressButton({ onLongPress, className, label = "กดค้างเพื่อลบ", duration = 1500 }) {
    const [pressing, setPressing] = useState(false);
    const [progress, setProgress] = useState(0);
    const timerRef = useRef(null);
    const reqRef = useRef(null);
    const startTimeRef = useRef(0);

    const stop = useCallback(() => {
        clearTimeout(timerRef.current);
        cancelAnimationFrame(reqRef.current);
        setPressing(false);
        setProgress(0);
    }, []);

    const start = useCallback(() => {
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
    }, [duration, onLongPress, stop]);

    useEffect(() => {
        return () => {
            clearTimeout(timerRef.current);
            cancelAnimationFrame(reqRef.current);
        };
    }, []);

    return (
        <button
            onMouseDown={start}
            onMouseUp={stop}
            onMouseLeave={stop}
            onTouchStart={start}
            onTouchEnd={stop}
            className={clsx("relative overflow-hidden bg-cream text-error border border-error min-h-11 px-3 font-semibold text-sm whitespace-nowrap select-none hover:bg-error/10 transition-colors duration-150 cursor-pointer", className)}
        >
            <span className="relative z-10">{pressing ? "ค้างไว้…" : label}</span>
            <div
                style={{ width: `${progress}%` }}
                className="absolute left-0 top-0 bottom-0 bg-error/25 z-0"
            />
        </button>
    );
}

