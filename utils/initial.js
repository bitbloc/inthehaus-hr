// First letter for an avatar. Thai leading vowels (เ แ โ ใ ไ) are skipped so แหม่ม shows ห, not แ.
export function initialOf(...names) {
    const name = names.find((n) => typeof n === "string" && n.trim()) || "";
    const chars = [...name.trim().replace(/^[เแโใไ]+/, "")];
    return (chars[0] || "?").toUpperCase();
}
