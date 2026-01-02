import clsx from "clsx";
import { twMerge } from "tailwind-merge";

export function Card({ children, className, ...props }) {
    return (
        <div
            className={twMerge(
                clsx(
                    "bg-white rounded-[2rem] shadow-sm border border-slate-100/80 p-6 transition-all duration-300 hover:shadow-md",
                    className
                )
            )}
            {...props}
        >
            {children}
        </div>
    );
}
