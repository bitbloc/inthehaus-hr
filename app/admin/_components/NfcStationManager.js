"use client";
import React, { useState, useEffect } from "react";
import { Wifi, Copy, Check, ExternalLink, Plus, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";

export default function NfcStationManager() {
  const [stations, setStations] = useState([]);
  const [keyVersion, setKeyVersion] = useState("V1");
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const [customStationCode, setCustomStationCode] = useState("");
  const [writingStationId, setWritingStationId] = useState(null);
  const [writeStatus, setWriteStatus] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  const fetchStations = async (customCode = "") => {
    setLoading(true);
    try {
      const url = customCode
        ? `/api/checkins/shop-token?mode=nfc&station=${encodeURIComponent(customCode)}`
        : "/api/checkins/shop-token?mode=nfc";
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setStations(json.stations || []);
        setKeyVersion(json.keyVersion || "V1");
      }
    } catch (e) {
      console.error("Failed to fetch NFC stations:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStations();
  }, []);

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleWriteWebNfc = async (station, urlToWrite) => {
    setWriteStatus(null);
    if (typeof window === "undefined" || !("NDEFReader" in window)) {
      setWriteStatus({
        type: "info",
        message:
          "อุปกรณ์นี้ไม่รองรับการเขียน NFC ผ่านเบราว์เซอร์โดยตรง (iOS/Desktop) กรุณากด 'คัดลอกลิงก์' แล้วนำไปวางในแอป NFC Tools (เมนู Write -> Add a record -> URL/URI) แล้วแตะแผ่น NFC"
      });
      return;
    }

    try {
      setWritingStationId(station.stationId);
      setWriteStatus({
        type: "pending",
        message: `กำลังรอแผ่น NFC... กรุณานำแผ่น NFC มาแตะที่ด้านหลังเครื่องโทรศัพท์เพื่อเขียนจุด [${station.stationId}]`
      });
      const ndef = new window.NDEFReader();
      await ndef.write({
        records: [{ recordType: "url", data: urlToWrite }]
      });
      setWriteStatus({
        type: "success",
        message: `✅ เขียนข้อมูลจุด [${station.name}] ลงแผ่น NFC สำเร็จเรียบร้อยแล้ว!`
      });
    } catch (err) {
      setWriteStatus({
        type: "error",
        message: `ไม่สามารถเขียนแผ่น NFC ได้: ${err.message || "กรุณาตรวจสอบว่าเปิด NFC ในเครื่องแล้ว"}`
      });
    } finally {
      setWritingStationId(null);
    }
  };

  const handleAddCustom = (e) => {
    e.preventDefault();
    if (!customStationCode.trim()) return;
    fetchStations(customStationCode.trim());
    setCustomStationCode("");
  };

  const filteredStations = stations.filter((s) =>
    categoryFilter === "ALL" ? true : s.category === categoryFilter
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-rams-panel border-2 border-rams-rule rounded-sm p-5 shadow-[0_2px_0_0_var(--color-rams-rule)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rams-orange" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-rams-ink-muted">
              HARDWARE INTEGRATION · NFC TAG STATION MANAGER (KEY {keyVersion})
            </span>
          </div>
          <h2 className="text-lg font-mono font-bold text-rams-ink mt-1">
            ระบบจัดการและสร้างลิงก์สำหรับแผ่น NFC (NTAG213 / 215 / 216)
          </h2>
          <p className="text-xs text-rams-ink-muted mt-1 leading-relaxed">
            คัดลอกลิงก์ด้านล่างเพื่อเขียนลงแผ่น NFC ด้วยแอป <strong>NFC Tools</strong> (iOS/Android) หรือกดเขียนจากหน้าเว็บโดยตรงบน Android Chrome
          </p>
        </div>

        {/* Custom Station Generator */}
        <form onSubmit={handleAddCustom} className="flex items-center gap-2 shrink-0">
          <input
            type="text"
            placeholder="รหัสจุดใหม่ เช่น BAR_02"
            value={customStationCode}
            onChange={(e) => setCustomStationCode(e.target.value)}
            className="px-3 py-2 bg-rams-bg border border-rams-rule-light focus:border-rams-rule rounded-sm text-xs font-mono font-bold text-rams-ink uppercase outline-none w-44"
          />
          <button
            type="submit"
            className="px-3.5 py-2 bg-rams-ink text-rams-panel border border-rams-rule rounded-sm text-xs font-mono font-bold uppercase flex items-center gap-1.5 cursor-pointer hover:bg-neutral-800"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>สร้างรหัส</span>
          </button>
        </form>
      </div>

      {/* Write Status Alert */}
      {writeStatus && (
        <div
          className={`p-4 rounded-sm border font-mono text-xs font-bold flex items-center justify-between ${
            writeStatus.type === "success"
              ? "bg-rams-green/10 border-rams-green text-rams-green"
              : writeStatus.type === "error"
              ? "bg-rams-red/10 border-rams-red text-rams-red"
              : "bg-rams-amber/15 border-rams-amber text-rams-ink"
          }`}
        >
          <span>{writeStatus.message}</span>
          <button
            onClick={() => setWriteStatus(null)}
            className="ml-4 px-2 py-0.5 bg-rams-panel border border-rams-rule-light rounded-sm text-[10px] cursor-pointer"
          >
            ปิด
          </button>
        </div>
      )}

      {/* How-to Guide Box */}
      <div className="bg-rams-panel border border-rams-rule-light rounded-sm p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-sm bg-rams-orange text-rams-panel font-mono font-bold flex items-center justify-center shrink-0">
            01
          </div>
          <div>
            <div className="font-mono font-bold text-rams-ink uppercase">เลือกจุดติดตั้งแผ่น NFC</div>
            <p className="text-rams-ink-muted mt-0.5 leading-relaxed">
              แต่ละจุดมีรหัส HMAC เฉพาะตัว เช่น จุดลงเวลาบาร์, เครื่องชงกาแฟ, โซนตรวจเช็กลิสต์ หรือตู้แช่สต็อก
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-sm bg-rams-ink text-rams-panel font-mono font-bold flex items-center justify-center shrink-0">
            02
          </div>
          <div>
            <div className="font-mono font-bold text-rams-ink uppercase">เขียนลิงก์ลงแผ่น NFC</div>
            <p className="text-rams-ink-muted mt-0.5 leading-relaxed">
              บน iPhone ใช้แอปฟรี <strong>NFC Tools</strong> → <em>Write</em> → <em>Add a record</em> → <em>URL/URI</em> แล้ววางลิงก์ที่คัดลอกไป
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-sm bg-rams-green text-rams-panel font-mono font-bold flex items-center justify-center shrink-0">
            03
          </div>
          <div>
            <div className="font-mono font-bold text-rams-ink uppercase">ติดแผ่นที่จุดปฏิบัติงาน</div>
            <p className="text-rams-ink-muted mt-0.5 leading-relaxed">
              เมื่อพนักงานนำมือถือแตะ ระบบจะเปิดหน้านั้นพร้อมปลดล็อกสิทธิ์ยืนยันสถานที่ให้อัตโนมัติใน 1 วินาที
            </p>
          </div>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: "ALL", label: "ทั้งหมด (9 จุด)" },
          { id: "ATTENDANCE", label: "⏱️ จุดลงเวลาเข้า-ออกงาน" },
          { id: "ESPRESSO", label: "☕ เครื่องชงกาแฟ Espresso" },
          { id: "CHECKLIST", label: "✅ โซนตรวจเช็กลิสต์เปิด-ปิดร้าน" },
          { id: "STOCK", label: "📦 จุดนับสต็อกตามตู้แช่/ชั้นวาง" }
        ].map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategoryFilter(cat.id)}
            className={`px-3.5 py-2 rounded-sm text-xs font-mono font-bold border transition cursor-pointer ${
              categoryFilter === cat.id
                ? "bg-rams-ink text-rams-panel border-rams-rule"
                : "bg-rams-panel text-rams-ink-muted border-rams-rule-light hover:text-rams-ink"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Stations Grid */}
      {loading ? (
        <div className="p-12 bg-rams-panel border border-rams-rule-light rounded-sm flex items-center justify-center gap-2 font-mono text-xs text-rams-ink-muted">
          <RefreshCw className="w-4 h-4 animate-spin text-rams-orange" />
          <span>กำลังโหลดรหัสสถานี NFC...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredStations.map((st) => {
            const primaryUrl = st.category === "ATTENDANCE" ? st.liffUrl : st.directUrl;
            const isCopiedPrimary = copiedId === `${st.stationId}_primary`;
            const isCopiedToken = copiedId === `${st.stationId}_token`;

            return (
              <div
                key={st.stationId}
                className="bg-rams-panel border border-rams-rule rounded-sm p-5 flex flex-col justify-between space-y-4 shadow-[0_2px_0_0_var(--color-rams-rule-light)]"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm bg-rams-bg border border-rams-rule-light text-rams-ink">
                      {st.stationId}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-sm border ${
                        st.category === "ATTENDANCE"
                          ? "bg-rams-green/10 text-rams-green border-rams-green/30"
                          : st.category === "ESPRESSO"
                          ? "bg-rams-orange/10 text-rams-orange border-rams-orange/30"
                          : "bg-rams-bg text-rams-ink-muted border-rams-rule-light"
                      }`}
                    >
                      {st.category} · ZONE {st.zone}
                    </span>
                  </div>

                  <h3 className="text-sm font-mono font-bold text-rams-ink">{st.name}</h3>
                  <p className="text-xs text-rams-ink-muted leading-relaxed">{st.description}</p>
                </div>

                <div className="space-y-2.5 pt-2 border-t border-rams-rule-light">
                  {/* URL Box */}
                  <div className="bg-rams-bg border border-rams-rule-light p-2.5 rounded-sm">
                    <div className="flex items-center justify-between text-[10px] font-mono text-rams-ink-muted mb-1">
                      <span>URL สำหรับเขียนลงแผ่น NFC:</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(st.nfcToken, `${st.stationId}_token`)}
                        className="underline hover:text-rams-ink cursor-pointer"
                      >
                        {isCopiedToken ? "คัดลอก Token แล้ว ✓" : `Token: ${st.nfcToken}`}
                      </button>
                    </div>
                    <div className="text-[11px] font-mono font-bold text-rams-ink break-all line-clamp-2">
                      {primaryUrl}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopy(primaryUrl, `${st.stationId}_primary`)}
                      className="py-2.5 px-3 bg-rams-orange hover:bg-rams-orange-active text-rams-panel border border-rams-rule rounded-sm text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-[0_2px_0_0_var(--color-rams-rule)] active:translate-y-[1px] active:shadow-none transition"
                    >
                      {isCopiedPrimary ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>คัดลอกลิงก์แล้ว</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>คัดลอกลิงก์ NFC</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleWriteWebNfc(st, primaryUrl)}
                      disabled={writingStationId === st.stationId}
                      className="py-2.5 px-3 bg-rams-bg hover:bg-rams-panel text-rams-ink border border-rams-rule rounded-sm text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
                    >
                      <Wifi className="w-3.5 h-3.5 rotate-90 text-rams-orange" />
                      <span>
                        {writingStationId === st.stationId ? "แตะแผ่น NFC..." : "เขียนลงแผ่น (Web NFC)"}
                      </span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-1 text-[10px] font-mono text-rams-ink-muted">
                    <span>ปลายทาง: {st.targetPath}</span>
                    <a
                      href={st.directUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-rams-ink hover:text-rams-orange font-bold underline"
                    >
                      <span>ทดสอบเปิดหน้านี้</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
