"use client";
import React, { useState, useEffect } from "react";

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
      <div className="bg-cream border-2 border-charcoal p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-plum" />
            <span className="text-xs font-semibold text-neutral">
              จุดแตะ NFC · กุญแจรุ่น {keyVersion}
            </span>
          </div>
          <h2 className="text-lg font-semibold text-charcoal mt-1">
            ระบบจัดการและสร้างลิงก์สำหรับแผ่น NFC (NTAG213 / 215 / 216)
          </h2>
          <p className="text-xs text-neutral mt-1 leading-relaxed">
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
            className="px-3 py-2 bg-cream border border-rule focus:border-charcoal text-xs font-num font-semibold text-charcoal outline-none w-44"
          />
          <button
            type="submit"
            className="px-3.5 py-2 bg-charcoal text-cream border border-charcoal text-xs font-num font-semibold flex items-center gap-1.5 cursor-pointer hover:bg-charcoal"
          >
                        <span>สร้างรหัส</span>
          </button>
        </form>
      </div>

      {/* Write Status Alert */}
      {writeStatus && (
        <div
          className={`p-4 border font-num text-xs font-semibold flex items-center justify-between ${
 writeStatus.type === "success"
 ? "bg-charcoal/10 border-charcoal text-charcoal"
 : writeStatus.type === "error"
 ? "bg-error/10 border-error text-error"
 : "bg-plum/15 border-plum text-charcoal"
 }`}
        >
          <span>{writeStatus.message}</span>
          <button
            onClick={() => setWriteStatus(null)}
            className="ml-4 px-2 py-0.5 bg-cream border border-rule text-xs cursor-pointer"
          >
            ปิด
          </button>
        </div>
      )}

      {/* How-to Guide Box */}
      <div className="bg-cream border border-rule p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 bg-plum text-cream font-num font-semibold flex items-center justify-center shrink-0">
            01
          </div>
          <div>
            <div className="font-semibold text-charcoal">เลือกจุดติดตั้งแผ่น NFC</div>
            <p className="text-neutral mt-0.5 leading-relaxed">
              แต่ละจุดมีรหัส HMAC เฉพาะตัว เช่น จุดลงเวลาบาร์, เครื่องชงกาแฟ, โซนตรวจเช็กลิสต์ หรือตู้แช่สต็อก
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 bg-charcoal text-cream font-num font-semibold flex items-center justify-center shrink-0">
            02
          </div>
          <div>
            <div className="font-semibold text-charcoal">เขียนลิงก์ลงแผ่น NFC</div>
            <p className="text-neutral mt-0.5 leading-relaxed">
              บน iPhone ใช้แอปฟรี <strong>NFC Tools</strong> → <em>Write</em> → <em>Add a record</em> → <em>URL/URI</em> แล้ววางลิงก์ที่คัดลอกไป
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 bg-charcoal text-cream font-num font-semibold flex items-center justify-center shrink-0">
            03
          </div>
          <div>
            <div className="font-semibold text-charcoal">ติดแผ่นที่จุดปฏิบัติงาน</div>
            <p className="text-neutral mt-0.5 leading-relaxed">
              เมื่อพนักงานนำมือถือแตะ ระบบจะเปิดหน้านั้นพร้อมปลดล็อกสิทธิ์ยืนยันสถานที่ให้อัตโนมัติใน 1 วินาที
            </p>
          </div>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: "ALL", label: "ทั้งหมด (9 จุด)" },
          { id: "ATTENDANCE", label: " จุดลงเวลาเข้า-ออกงาน" },
          { id: "ESPRESSO", label: "เครื่องชงกาแฟ Espresso" },
          { id: "CHECKLIST", label: "โซนตรวจเช็กลิสต์เปิด-ปิดร้าน" },
          { id: "STOCK", label: "จุดนับสต็อกตามตู้แช่/ชั้นวาง" }
        ].map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategoryFilter(cat.id)}
            className={`px-3.5 py-2 text-xs font-num font-semibold border transition cursor-pointer ${
 categoryFilter === cat.id
 ? "bg-charcoal text-cream border-charcoal"
 : "bg-cream text-neutral border-rule hover:text-charcoal"
 }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Stations Grid */}
      {loading ? (
        <div className="p-12 bg-cream border border-rule flex items-center justify-center gap-2 font-num text-xs text-neutral">
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
                className="bg-cream border border-charcoal p-5 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-num font-semibold px-2 py-0.5 bg-cream border border-rule text-charcoal">
                      {st.stationId}
                    </span>
                    <span
                      className={`text-xs font-num font-semibold px-2 py-0.5 border ${
 st.category === "ATTENDANCE"
 ? "bg-charcoal/10 text-charcoal border-charcoal/30"
 : st.category === "ESPRESSO"
 ? "bg-plum/10 text-plum border-plum/30"
 : "bg-cream text-neutral border-rule"
 }`}
                    >
                      {st.category} · ZONE {st.zone}
                    </span>
                  </div>

                  <h3 className="text-sm font-num font-semibold text-charcoal">{st.name}</h3>
                  <p className="text-xs text-neutral leading-relaxed">{st.description}</p>
                </div>

                <div className="space-y-2.5 pt-2 border-t border-rule">
                  {/* URL Box */}
                  <div className="bg-cream border border-rule p-2.5">
                    <div className="flex items-center justify-between text-xs font-num text-neutral mb-1">
                      <span>URL สำหรับเขียนลงแผ่น NFC:</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(st.nfcToken, `${st.stationId}_token`)}
                        className="underline hover:text-charcoal cursor-pointer"
                      >
                        {isCopiedToken ? "คัดลอก Token แล้ว " : `Token: ${st.nfcToken}`}
                      </button>
                    </div>
                    <div className="text-xs font-num font-semibold text-charcoal break-all line-clamp-2">
                      {primaryUrl}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopy(primaryUrl, `${st.stationId}_primary`)}
                      className="py-2.5 px-3 bg-plum hover:bg-plum-2 text-cream border border-charcoal text-xs font-num font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition"
                    >
                      {isCopiedPrimary ? (
                        <>
                                                    <span>คัดลอกลิงก์แล้ว</span>
                        </>
                      ) : (
                        <>
                                                    <span>คัดลอกลิงก์ NFC</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleWriteWebNfc(st, primaryUrl)}
                      disabled={writingStationId === st.stationId}
                      className="py-2.5 px-3 bg-cream hover:bg-cream text-charcoal border border-charcoal text-xs font-num font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition"
                    >
                                            <span>
                        {writingStationId === st.stationId ? "แตะแผ่น NFC..." : "เขียนลงแผ่น"}
                      </span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-1 text-xs font-num text-neutral">
                    <span>ปลายทาง: {st.targetPath}</span>
                    <a
                      href={st.directUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-charcoal hover:text-plum font-semibold underline"
                    >
                      <span>ทดสอบเปิดหน้านี้</span>
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
