// Stock Flex messages for Yuzu, in brand v2 (owner request 2026-11-26).
//
// Colours mirror .agents/AGENTS.md §2 of haustable (Flex only takes hex):
// plum header with cream text, charcoal ink on cream, one charcoal primary
// button, plum secondary. No green/orange; red only for errors. Thai first.
//
// Quantities read the way staff count them ("1 ลัง 11 ขวด", "5 แกลอน 967 มล."),
// ported from haustable src/utils/stockCount.js formatPackQty / shortUnit,
// instead of raw pack decimals ("1.9167 CRATE").

export const BRAND = {
  plum: "#41032A",
  plum2: "#571C3E",
  onPlum2: "#D0B5C1",
  charcoal: "#1A1A1A",
  cream: "#F6F2EA",
  paper2: "#ECE4E7",
  rule: "#D4CBCF",
  neutral: "#635B5F",
  muted: "#524A4E",
  errorRed: "#B42318",
};

const SHORT_UNITS = {
  g: "ก.", kg: "กก.", ml: "มล.", l: "ล.", unit: "ชิ้น", bottle: "ขวด", pack: "แพ็ค", bag: "ถุง",
  box: "กล่อง", crate: "ลัง", gallon: "แกลอน", pcs: "ชิ้น", piece: "ชิ้น", can: "กระป๋อง",
  cup: "แก้ว", glass: "แก้ว", tray: "ถาด", bucket: "ถัง", tank: "ถัง", portion: "สูตร", potion: "สูตร",
};

export function shortUnit(u) {
  if (!u) return "";
  return SHORT_UNITS[u] || SHORT_UNITS[String(u).trim().toLowerCase()] || u;
}

const fmt = (n, digits = 2) => Number(Number(n).toFixed(digits)).toLocaleString("th-TH", { maximumFractionDigits: digits });

/** Whole packs plus the loose remainder in the usage unit; null when there is no conversion. */
export function formatPackQty(qty, { factor, packUnit, usageUnit } = {}) {
  if (qty === null || qty === undefined) return null;
  const n = Number(qty);
  const f = Number(factor);
  if (!Number.isFinite(n) || !(f > 1)) return null;
  if (n === 0) return `0 ${shortUnit(packUnit)}`.trim();
  const sign = n < 0 ? "-" : "";
  const step = usageUnit === "g" || usageUnit === "ml" ? 1 : 0.01;
  const totalUsage = Math.round((Math.abs(n) * f) / step) * step;
  let packs = Math.floor((totalUsage + 1e-9) / f);
  let rest = Math.round((totalUsage - packs * f) / step) * step;
  if (rest >= f - 1e-9) { packs += 1; rest = 0; }
  if (packs === 0 && rest === 0) return `${sign}<1 ${shortUnit(usageUnit)}`;
  const parts = [];
  if (packs > 0) parts.push(`${packs.toLocaleString("th-TH")} ${shortUnit(packUnit)}`.trim());
  if (rest > 0) parts.push(`${fmt(rest)} ${shortUnit(usageUnit)}`.trim());
  return sign + parts.join(" ");
}

/** A stock item's quantity (in its stock unit) as staff would say it. */
export function itemQty(item, qty = item?.current_quantity) {
  if (qty === null || qty === undefined || !Number.isFinite(Number(qty))) return "—";
  const packUnit = item?.unit || item?.pack_unit || "";
  const packed = formatPackQty(qty, { factor: item?.conversion_factor, packUnit, usageUnit: item?.usage_unit });
  if (packed) return packed;
  return `${fmt(qty)} ${shortUnit(packUnit)}`.trim();
}

export const isLowStock = (item) => Number(item?.current_quantity) <= Number(item?.reorder_point || 0);

// ---------- layout helpers ----------

const text = (t, o = {}) => ({ type: "text", text: String(t ?? ""), wrap: true, color: BRAND.charcoal, size: "sm", ...o });
const sep = (margin = "md") => ({ type: "separator", margin, color: BRAND.rule });

function header(title, subtitle) {
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: BRAND.plum,
    paddingAll: "16px",
    contents: [
      text(title, { color: BRAND.cream, weight: "bold", size: "md" }),
      ...(subtitle ? [text(subtitle, { color: BRAND.onPlum2, size: "xs", margin: "xs" })] : []),
    ],
  };
}

function bubble({ title, subtitle, body, footer }) {
  return {
    type: "bubble",
    size: "mega",
    styles: { body: { backgroundColor: BRAND.cream }, footer: { backgroundColor: BRAND.cream, separator: true, separatorColor: BRAND.rule } },
    header: header(title, subtitle),
    body: { type: "box", layout: "vertical", paddingAll: "16px", spacing: "sm", contents: body },
    ...(footer ? { footer: { type: "box", layout: "vertical", paddingAll: "12px", spacing: "sm", contents: footer } } : {}),
  };
}

const flex = (altText, contents) => ({ type: "flex", altText: String(altText).slice(0, 400), contents });

const primaryButton = (label, action) => ({ type: "button", style: "primary", color: BRAND.charcoal, height: "sm", action: { ...action, label: String(label).slice(0, 40) } });
const secondaryButton = (label, action) => ({ type: "button", style: "primary", color: BRAND.plum2, height: "sm", action: { ...action, label: String(label).slice(0, 40) } });
const outlineButton = (label, action) => ({ type: "button", style: "link", color: BRAND.plum, height: "sm", action: { ...action, label: String(label).slice(0, 40) } });

/** Name on the left, amount on the right; low items get a plum "ต้องสั่ง" tag, never red/green. */
function itemRow(item, { showMin = false } = {}) {
  const low = isLowStock(item);
  return {
    type: "box",
    layout: "horizontal",
    margin: "md",
    spacing: "md",
    contents: [
      {
        type: "box",
        layout: "vertical",
        flex: 5,
        contents: [
          text(item.name, { weight: "bold" }),
          ...(item.category ? [text(item.category, { size: "xs", color: BRAND.neutral })] : []),
        ],
      },
      {
        type: "box",
        layout: "vertical",
        flex: 4,
        contents: [
          text(itemQty(item), { align: "end", weight: "bold", color: low ? BRAND.plum : BRAND.charcoal }),
          ...(low ? [text(showMin ? `ต้องสั่ง · ขั้นต่ำ ${itemQty(item, item.reorder_point || 0)}` : "ต้องสั่ง", { align: "end", size: "xs", color: BRAND.plum })] : []),
        ],
      },
    ],
  };
}

function moreRow(shown, total, noun = "รายการ") {
  return total > shown ? [sep(), text(`และอีก ${total - shown} ${noun}`, { size: "xs", color: BRAND.neutral, align: "center", margin: "md" })] : [];
}

// ---------- messages ----------

export function lowStockFlex(items) {
  const shown = items.slice(0, 15);
  return flex(
    `ของใกล้หมด ${items.length} รายการ`,
    bubble({
      title: "ของใกล้หมด",
      subtitle: `ต่ำกว่าจุดสั่งซื้อ ${items.length} รายการ`,
      body: [...shown.map((i) => itemRow(i, { showMin: true })), ...moreRow(shown.length, items.length)],
    }),
  );
}

export function allStockFlex(items) {
  const shown = items.slice(0, 15);
  return flex(
    `สต็อกทั้งหมด ${items.length} รายการ`,
    bubble({
      title: "สต็อกทั้งหมด",
      subtitle: `${items.length} รายการ`,
      body: [...shown.map((i) => itemRow(i)), ...moreRow(shown.length, items.length)],
    }),
  );
}

export function searchResultFlex(query, items) {
  const shown = items.slice(0, 15);
  return flex(
    `ผลค้นหา "${query}" ${items.length} รายการ`,
    bubble({
      title: "ผลค้นหาสต็อก",
      subtitle: `"${query}" · ${items.length} รายการ`,
      body: [...shown.map((i) => itemRow(i)), ...moreRow(shown.length, items.length)],
    }),
  );
}

export function singleItemFlex(item) {
  const low = isLowStock(item);
  const qty = itemQty(item);
  const factor = Number(item.conversion_factor);
  const perPack = factor > 1 && item.usage_unit
    ? `1 ${shortUnit(item.unit || item.pack_unit)} = ${fmt(factor)} ${shortUnit(item.usage_unit)}`
    : null;
  return flex(
    `สต็อก ${item.name}: ${qty}`,
    bubble({
      title: item.name,
      subtitle: item.category || "สต็อกคงเหลือ",
      body: [
        text("คงเหลือ", { size: "xs", color: BRAND.neutral }),
        text(qty, { size: "xxl", weight: "bold", color: low ? BRAND.plum : BRAND.charcoal }),
        text(low ? "ต่ำกว่าจุดสั่งซื้อ ควรสั่งเพิ่ม" : "ปกติ", { size: "sm", weight: "bold", color: low ? BRAND.plum : BRAND.muted, margin: "xs" }),
        sep(),
        {
          type: "box", layout: "horizontal", margin: "md", contents: [
            text("จุดสั่งซื้อ", { size: "sm", color: BRAND.neutral, flex: 1 }),
            text(itemQty(item, item.reorder_point || 0), { size: "sm", align: "end", flex: 1 }),
          ],
        },
        ...(perPack ? [{
          type: "box", layout: "horizontal", margin: "sm", contents: [
            text("หน่วยบรรจุ", { size: "sm", color: BRAND.neutral, flex: 1 }),
            text(perPack, { size: "sm", align: "end", flex: 1 }),
          ],
        }] : []),
      ],
    }),
  );
}

export function selectionFlex(query, items) {
  return flex(
    "เลือกสินค้าที่ต้องการเช็คสต็อก",
    bubble({
      title: "เลือกสินค้า",
      subtitle: `พบหลายรายการสำหรับ "${query}"`,
      body: [text("แตะชื่อสินค้าที่ต้องการดูยอดคงเหลือ", { size: "sm", color: BRAND.muted })],
      footer: items.slice(0, 5).map((item, idx) => (idx === 0 ? primaryButton : secondaryButton)(item.name, {
        type: "postback",
        data: `action=check_exact_stock&itemName=${encodeURIComponent(item.name)}`,
      })),
    }),
  );
}

export function historyFlex(history, title) {
  const sorted = [...history].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const shown = sorted.slice(0, 7);
  const bangkok = (d) => new Date(new Date(d).getTime() + 7 * 3600 * 1000).toISOString().slice(5, 16).replace("T", " ").replace("-", "/");
  const rows = shown.map((h) => {
    const isIn = h.transaction_type === "in";
    const qty = Math.abs(Number(h.quantity_change) || 0);
    return {
      type: "box",
      layout: "vertical",
      margin: "md",
      contents: [
        {
          type: "box", layout: "horizontal", contents: [
            text(h.stock_items?.name || "สินค้า", { weight: "bold", flex: 3 }),
            text(bangkok(h.created_at), { size: "xs", color: BRAND.neutral, align: "end", flex: 2 }),
          ],
        },
        {
          type: "box", layout: "horizontal", contents: [
            text(`${isIn ? "รับเข้า +" : "เบิกออก −"}${fmt(qty)}`, { size: "sm", weight: "bold", color: isIn ? BRAND.charcoal : BRAND.plum, flex: 3 }),
            text(h.performed_by || "", { size: "xs", color: BRAND.neutral, align: "end", flex: 2 }),
          ],
        },
        ...(h.note ? [text(h.note, { size: "xs", color: BRAND.neutral })] : []),
      ],
    };
  });
  return flex(
    `ประวัติสต็อก: ${title}`,
    bubble({
      title: "ประวัติสต็อก",
      subtitle: title,
      body: [...rows, ...moreRow(shown.length, sorted.length, "รายการเคลื่อนไหว")],
    }),
  );
}

export function confirmFlex(message, payloadData) {
  return flex(
    "ยืนยันการปรับสต็อก",
    bubble({
      title: "ยืนยันการปรับสต็อก",
      subtitle: "ยังไม่บันทึก จนกว่าจะกดยืนยัน",
      body: [text(message, { weight: "bold" }), text("ตรวจชื่อสินค้าและจำนวนก่อนกดยืนยัน", { size: "xs", color: BRAND.neutral, margin: "md" })],
      footer: [
        primaryButton("ยืนยัน", { type: "postback", data: `action=confirm_stock&payload=${Buffer.from(JSON.stringify(payloadData)).toString("base64")}` }),
        outlineButton("ยกเลิก", { type: "postback", data: "action=cancel_stock" }),
      ],
    }),
  );
}

export function auditFormFlex(liffUrl) {
  return flex(
    "ฟอร์มตรวจนับสต็อก",
    bubble({
      title: "ตรวจนับสต็อก",
      subtitle: "กรอกยอดนับจริงจากหน้างาน",
      body: [text("เปิดฟอร์มแล้วนับของตามรายการ ระบบจะบันทึกยอดนับให้ทันที", { size: "sm", color: BRAND.muted })],
      footer: [primaryButton("เปิดฟอร์มตรวจนับ", { type: "uri", uri: liffUrl })],
    }),
  );
}
