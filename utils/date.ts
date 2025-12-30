import { format, startOfDay } from 'date-fns';

// Returns consistent YYYY-MM-DD for the current user's local time
export const getTodayDateString = (): string => {
    return format(new Date(), 'yyyy-MM-dd');
};

export const getDayOfWeek = (): number => {
    return parseInt(format(new Date(), 'i')) % 7; // date-fns 'i' is 1(Mon)-7(Sun). We want 0(Sun)-6(Sat) or consistent with our schema.
    // Wait, JS Day 0 is Sunday. date-fns 'i' is ISO day.
    // Let's stick to update to simple JS Date getDay() for 0-6 (Sun-Sat) matching standard arrays.
    return new Date().getDay();
};

export const formatDatePretty = (dateStr: string): string => {
    return format(new Date(dateStr), 'EEE, MMM d');
};
