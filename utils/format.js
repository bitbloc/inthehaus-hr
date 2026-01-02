import { format } from "date-fns";
import { th } from "date-fns/locale";

export const formatCurrency = (amount) => {
    return new Intl.NumberFormat('th-TH', {
        style: 'currency',
        currency: 'THB',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
};

export const formatDate = (dateString, formatStr = "dd MMM yyyy") => {
    if (!dateString) return "-";
    return format(new Date(dateString), formatStr, { locale: th });
};

export const formatTime = (dateString) => {
    if (!dateString) return "-";
    return format(new Date(dateString), "HH:mm");
};
