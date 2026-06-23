import clsx from "clsx";
import { twMerge } from "tailwind-merge";

export function Card({ children, className, ...props }) {
    return (
        <div
            className={twMerge(
                clsx(
                    "bg-rams-panel rounded-sm border border-rams-rule-light p-6 shadow-none transition-colors",
                    className
                )
            )}
            {...props}
        >
            {children}
        </div>
    );
}

