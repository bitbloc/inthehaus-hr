// Read-only tools Yuzu can call while answering a chat (Claude tool use).
// They read live data instead of relying on context typed into the prompt.
// None of them change anything: no stock deduction, no roster edits.

import { format, addHours } from "date-fns";
import { supabase } from "../lib/supabaseClient.js";
import { fetchStockItems, fetchLowStock } from "./stock_api.js";
import { getEffectiveRoster } from "./roster.js";

const MAX_ITEMS = 15;

/** ISO timestamp -> Bangkok "HH:mm" (null when missing or invalid). */
export function bangkokHHmm(value) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

function bangkokToday() {
    return format(addHours(new Date(), 7), "yyyy-MM-dd");
}

function cleanDate(date) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) ? date : bangkokToday();
}

function stockRow(item) {
    return {
        name: item.name,
        quantity: item.current_quantity ?? item.quantity ?? null,
        unit: item.usage_unit || item.unit || item.pack_unit || "",
        reorder_point: item.reorder_point ?? null,
    };
}

export const YUZU_TOOLS = [
    {
        name: "search_stock",
        description: "ค้นหาวัตถุดิบ/สินค้าในสต็อกของร้านตามชื่อ (ภาษาไทยหรืออังกฤษ) แล้วได้จำนวนคงเหลือปัจจุบัน หน่วย และจุดสั่งซื้อ ใช้เมื่อมีคนถามว่าของเหลือเท่าไหร่ หรือมีของไหม",
        input_schema: {
            type: "object",
            properties: { query: { type: "string", description: "ชื่อสินค้า เช่น นมสด, เมล็ดกาแฟ" } },
            required: ["query"],
            additionalProperties: false,
        },
        strict: true,
    },
    {
        name: "list_low_stock",
        description: "รายการสินค้าที่เหลือต่ำกว่าหรือเท่ากับจุดสั่งซื้อ ใช้เมื่อถามว่าอะไรใกล้หมด หรือต้องสั่งอะไรบ้าง",
        input_schema: { type: "object", properties: {}, additionalProperties: false },
        strict: true,
    },
    {
        name: "get_roster",
        description: "ตารางกะที่ประกาศแล้วของวันที่ระบุ: ใครเข้ากะไหน เวลาเท่าไหร่ ใครหยุด และเวลาเข้า-ออกงานที่ลงจริง ใช้เมื่อถามว่าใครเข้ากะ ใครมาแล้ว ใครหยุด",
        input_schema: {
            type: "object",
            properties: { date: { type: "string", description: "YYYY-MM-DD ตามเวลาไทย; ถ้าเป็นวันนี้ให้ส่งวันที่ของวันนี้" } },
            required: ["date"],
            additionalProperties: false,
        },
        strict: true,
    },
    {
        name: "get_leave",
        description: "รายชื่อพนักงานที่ลาซึ่งได้รับอนุมัติแล้วในวันที่ระบุ และประเภทการลา (ไม่รวมเหตุผล)",
        input_schema: {
            type: "object",
            properties: { date: { type: "string", description: "YYYY-MM-DD ตามเวลาไทย" } },
            required: ["date"],
            additionalProperties: false,
        },
        strict: true,
    },
];

export const YUZU_TOOL_HANDLERS = {
    async search_stock({ query }) {
        const items = await fetchStockItems(String(query || "").trim());
        const list = (Array.isArray(items) ? items : items?.data || []).slice(0, MAX_ITEMS).map(stockRow);
        return { count: list.length, items: list };
    },
    async list_low_stock() {
        const items = await fetchLowStock();
        const list = (Array.isArray(items) ? items : items?.data || []).slice(0, MAX_ITEMS * 2).map(stockRow);
        return { count: list.length, items: list };
    },
    async get_roster({ date }) {
        const day = cleanDate(date);
        const roster = await getEffectiveRoster(day);
        return {
            date: day,
            staff: (roster || []).map((r) => ({
                name: r.nickname || r.name,
                position: r.position || "",
                off: Boolean(r.is_off),
                shift: r.shift?.name || "",
                start: r.shift?.start_time || "",
                end: r.shift?.end_time || "",
                checked_in: bangkokHHmm(r.attendance?.check_in),
                checked_out: bangkokHHmm(r.attendance?.check_out),
            })),
        };
    },
    async get_leave({ date }) {
        const day = cleanDate(date);
        const { data, error } = await supabase
            .from("leave_requests")
            .select("leave_type, employees!employee_id(name, nickname)")
            .eq("leave_date", day)
            .eq("status", "approved");
        if (error) throw new Error(error.message);
        return {
            date: day,
            on_leave: (data || []).map((r) => ({ name: r.employees?.nickname || r.employees?.name, type: r.leave_type })),
        };
    },
};
