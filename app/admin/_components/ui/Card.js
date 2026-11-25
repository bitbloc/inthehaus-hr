import clsx from "clsx";
import { twMerge } from "tailwind-merge";

export function Card({ children, className, ...props }) {
    return (
        <div
            className={twMerge(
                clsx(
                    "bg-cream  border border-rule p-6  transition-colors",
                    className
                )
            )}
            {...props}
        >
            {children}
        </div>
    );
}

