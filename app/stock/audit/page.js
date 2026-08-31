/* Hallmark · route: custom (bespoke) · structure: utilitarian stock audit console
 * paper: oklch(96% 0.006 80) · accent: oklch(62% 0.16 45) · display: Geist Mono · body: Geist Sans
 * axes: light / geometric-sans / warm · gates: all-pass
 */
"use client";
import React, { useState, useEffect } from "react";
import { Package, RefreshCw, Search, Check } from "lucide-react";
import liff from "@line/liff";
import NavigationDock from "../../_components/NavigationDock";

export default function StockAuditPage() {
  const [profile, setProfile] = useState(null);
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID;

  const fetchItems = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/stock/items");
      const json = await res.json();
      if (json.success) {
        const list = json.data || json.items || [];
        setItems(list);
      } else {
        setErrorMsg(json.error || "Failed to load inventory items.");
      }
    } catch {
      setErrorMsg("Failed to connect to stock inventory service.");
    }
    setLoading(false);
  };

  useEffect(() => {
    const initLiff = async () => {
      try {
        if (typeof liff !== "undefined" && LIFF_ID) {
          await liff.init({ liffId: LIFF_ID });
          if (liff.isLoggedIn()) {
            const prof = await liff.getProfile();
            setProfile(prof);
          } else {
            setProfile({ displayName: "พนักงาน In The Haus" });
          }
        }
      } catch (err) {
        console.error("LIFF Init error", err);
        setProfile({ displayName: "พนักงาน In The Haus" });
      }
      fetchItems();
    };
    initLiff();
  }, [LIFF_ID]);

  const handleInputChange = (id, value) => {
    setCounts((prev) => ({ ...prev, [id]: value }));
  };

  const filteredItems = items.filter((i) => {
    if (i.is_active === false) return false;
    if (!searchQuery.trim()) return true;
    return (
      i.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.category?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const diffCount = Object.keys(counts).filter((id) => {
    const item = items.find((i) => String(i.id) === String(id));
    if (!item) return false;
    const val = counts[id];
    return val !== "" && val !== undefined && Number(val) !== Number(item.current_quantity);
  }).length;

  const handleSubmit = async () => {
    setSubmitting(true);
    setErrorMsg("");

    const payloadCounts = items.map((item) => ({
      id: item.id,
      name: item.name,
      expected: item.current_quantity,
      actual:
        counts[item.id] !== undefined && counts[item.id] !== ""
          ? Number(counts[item.id])
          : item.current_quantity
    }));

    try {
      const res = await fetch("/api/stock/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeName: profile?.displayName || "พนักงาน In The Haus",
          counts: payloadCounts
        })
      });

      const json = await res.json();
      if (json.success) {
        setSuccess(true);
        if (typeof liff !== "undefined" && liff.isInClient && liff.isInClient()) {
          setTimeout(() => liff.closeWindow(), 3000);
        }
      } else {
        setErrorMsg(json.error || "Failed to submit audit.");
      }
    } catch {
      setErrorMsg("Network error submitting audit. Please check your connection.");
    }
    setSubmitting(false);
  };

  if (success) {
    return (
      <div className="min-h-screen bg-rams-bg text-rams-ink flex flex-col items-center justify-center p-6 font-mono safe-bottom-dock">
        <div className="bg-rams-panel border border-rams-rule p-8 rounded-sm text-center max-w-sm w-full space-y-4 shadow-none">
          <div className="w-12 h-12 bg-rams-green/10 border border-rams-green text-rams-green rounded-full flex items-center justify-center mx-auto text-xl font-bold">
            ✓
          </div>
          <h1 className="text-base font-bold text-rams-ink uppercase tracking-wider">
            STOCK AUDIT COMPLETE
          </h1>
          <p className="text-xs font-sans text-rams-ink-muted leading-relaxed">
            ขอบคุณทีมงานที่ดำเนินการนับและตรวจสอบสต็อก<br />
            รายงานสรุปผลต่างถูกส่งเข้ากลุ่ม LINE เรียบร้อยแล้วครับ
          </p>
          <button
            onClick={() => {
              if (typeof liff !== "undefined" && liff.isInClient && liff.isInClient()) {
                liff.closeWindow();
              } else {
                setSuccess(false);
                fetchItems();
              }
            }}
            className="w-full bg-rams-orange hover:bg-rams-orange-active text-rams-panel border border-rams-rule py-2.5 rounded-sm font-bold text-xs uppercase tracking-wider transition-all tactile-btn cursor-pointer"
          >
            {typeof liff !== "undefined" && liff.isInClient && liff.isInClient()
              ? "CLOSE WINDOW (ปิดหน้าต่าง)"
              : "NEW AUDIT (นับสต็อกรอบใหม่)"}
          </button>
        </div>
        <NavigationDock />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-rams-bg text-rams-ink font-mono safe-bottom-dock">
      {/* Header */}
      <header className="border-b border-rams-rule-light bg-rams-panel px-5 py-5 sticky top-0 z-30">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rams-orange"></span>
              <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-rams-ink-muted">
                IN THE HAUS · INVENTORY CONTROL
              </span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-rams-ink mt-1">
              นับสต็อกวัตถุดิบ (STOCK AUDIT)
            </h1>
            <p className="text-[11px] text-rams-ink-muted mt-0.5">
              {profile?.displayName ? `ผู้ตรวจ: ${profile.displayName}` : "ตรวจสอบยอดสต็อกคงเหลือจริง"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {diffCount > 0 && (
              <span className="text-[9px] font-bold bg-rams-orange text-rams-panel px-2 py-0.5 rounded-sm border border-rams-orange uppercase tracking-wider">
                EDITED ({diffCount})
              </span>
            )}
            <button
              onClick={fetchItems}
              disabled={loading}
              className="p-2 bg-rams-bg border border-rams-rule-light hover:border-rams-rule rounded-sm text-rams-ink transition cursor-pointer"
              title="Refresh Items"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-rams-orange" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      <main className="p-4 sm:p-6 max-w-2xl mx-auto space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-rams-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="ค้นหาชื่อวัตถุดิบ / สินค้า..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-rams-panel border border-rams-rule-light focus:border-rams-orange rounded-sm pl-9 pr-4 py-2.5 text-xs font-mono text-rams-ink outline-none transition"
          />
        </div>

        {errorMsg && (
          <div className="p-3 rounded-sm bg-rams-red/10 border border-rams-red text-rams-red text-xs font-bold">
            {errorMsg}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <RefreshCw className="w-7 h-7 animate-spin text-rams-orange" />
            <p className="text-rams-ink-muted text-xs font-bold uppercase tracking-wider">
              LOADING INVENTORY ITEMS...
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex justify-between items-center px-1">
              <span className="text-[10px] font-bold text-rams-ink-muted uppercase tracking-wider">
                ITEMS LIST ({filteredItems.length}) · กรอกเฉพาะยอดที่ต่างจากระบบ
              </span>
            </div>

            {filteredItems.map((item) => {
              const currentCount = counts[item.id];
              const hasChanged =
                currentCount !== undefined &&
                currentCount !== "" &&
                Number(currentCount) !== Number(item.current_quantity);

              return (
                <div
                  key={item.id}
                  className={`bg-rams-panel border rounded-sm p-3.5 flex items-center justify-between gap-3 transition-colors ${
                    hasChanged
                      ? "border-rams-orange ring-1 ring-rams-orange/30 bg-rams-orange/5"
                      : "border-rams-rule-light hover:border-rams-rule"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-xs text-rams-ink truncate font-sans">
                      {item.name}
                    </h3>
                    <div className="flex items-center gap-2 text-[10px] text-rams-ink-muted mt-1 font-mono">
                      <span className="bg-rams-bg px-1.5 py-0.5 rounded-sm border border-rams-rule-light text-rams-ink font-bold">
                        ระบบ: {item.current_quantity}
                      </span>
                      <span>หน่วย: {item.unit || "หน่วย"}</span>
                    </div>
                  </div>

                  <div className="w-24 shrink-0">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder={item.current_quantity.toString()}
                      value={counts[item.id] !== undefined ? counts[item.id] : ""}
                      onChange={(e) => handleInputChange(item.id, e.target.value)}
                      className={`w-full bg-rams-bg border rounded-sm px-2.5 py-1.5 text-center font-mono font-bold text-xs text-rams-ink outline-none transition ${
                        hasChanged
                          ? "border-rams-orange text-rams-orange ring-1 ring-rams-orange"
                          : "border-rams-rule-light focus:border-rams-orange"
                      }`}
                    />
                  </div>
                </div>
              );
            })}

            {filteredItems.length === 0 && !loading && (
              <div className="text-center py-16 bg-rams-panel rounded-sm border border-rams-rule-light">
                <Package className="w-8 h-8 text-rams-ink-muted mx-auto mb-2" />
                <p className="text-xs text-rams-ink-muted uppercase">ไม่พบรายการสินค้าที่ค้นหา</p>
              </div>
            )}

            {/* Submit Bar inside container */}
            <div className="pt-4">
              <button
                onClick={handleSubmit}
                disabled={loading || submitting || items.length === 0}
                className="w-full bg-rams-orange hover:bg-rams-orange-active text-rams-panel border border-rams-rule font-bold text-xs uppercase tracking-wider py-3.5 rounded-sm transition-all tactile-btn disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {submitting
                  ? "SAVING AUDIT..."
                  : diffCount > 0
                  ? `CONFIRM AUDIT · ปรับปรุง ${diffCount} รายการ →`
                  : "CONFIRM AUDIT · ยอดตรง 100% →"}
              </button>
            </div>
          </div>
        )}
      </main>

      <NavigationDock />
    </div>
  );
}
