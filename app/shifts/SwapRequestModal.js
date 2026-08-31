import { useState } from "react";
import { format } from "date-fns";
import { th } from "date-fns/locale";

export default function SwapRequestModal({
  isOpen,
  onClose,
  currentUser,
  shiftDate,
  shiftData,
  employees,
  schedules,
  overrides,
  shifts
}) {
  const [step, setStep] = useState(1);
  const [actionType, setActionType] = useState(null); // 'GIVE_AWAY' | 'TRADE'
  const [selectedPeer, setSelectedPeer] = useState(null);
  const [note, setNote] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!isOpen) return null;

  const isDouble = (name) => name && (name.includes("ควบ") || name.toLowerCase().includes("double"));
  const userIsDouble = isDouble(shiftData.shift_name);

  const validPeers = employees.filter((emp) => {
    if (emp.id === currentUser.id) return false;
    if (emp.position !== currentUser.position) return false;

    let isPeerOff = true;
    let peerShiftDef = null;
    let peerShiftName = null;

    const override = overrides?.find((o) => String(o.employee_id) === String(emp.id) && o.date === shiftDate);
    if (override) {
      if (!override.is_off) {
        isPeerOff = false;
        peerShiftDef = shifts?.find((sh) => String(sh.id) === String(override.shift_id));
        peerShiftName = peerShiftDef?.name;
      }
    } else {
      const dayOfWeek = new Date(shiftDate).getDay();
      const schedule = schedules[emp.id]?.[dayOfWeek];
      if (schedule && !schedule.is_off) {
        isPeerOff = false;
        peerShiftDef = shifts?.find((sh) => String(sh.id) === String(schedule.shift_id));
        peerShiftName = peerShiftDef?.name;
      }
    }

    if (actionType === "GIVE_AWAY") {
      if (isPeerOff) return true;
      const peerIsDouble = isDouble(peerShiftName);
      if (peerIsDouble) return false;

      if (shiftData.start_time && shiftData.end_time && peerShiftDef) {
        const s1 = shiftData.start_time;
        const e1 = shiftData.end_time;
        const s2 = peerShiftDef.start_time;
        const e2 = peerShiftDef.end_time;
        if (s1 < e2 && s2 < e1) return false;
        return true;
      }
      return false;
    }

    if (actionType === "TRADE") {
      if (isPeerOff) return false;
      const peerIsDouble = isDouble(peerShiftName);
      if (userIsDouble) return peerIsDouble;
      return !peerIsDouble;
    }

    return false;
  });

  const handleSubmit = async () => {
    setIsLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/shift-swap/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requester_id: currentUser.id,
          target_date: shiftDate,
          old_shift_id: shiftData.shift_id,
          type: actionType,
          target_peer_id: selectedPeer?.id || null,
          notes: note
        })
      });
      const data = await res.json();
      if (data.success) {
        onClose();
      } else {
        setErrorMsg(data.error || "ไม่สามารถส่งคำขอได้");
      }
    } catch (e) {
      setErrorMsg("เกิดข้อผิดพลาดในการส่งคำขอ");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-rams-ink/60 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-rams-panel w-full max-w-md rounded-sm border border-rams-rule shadow-[0_8px_24px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-rams-bg/50 p-4 border-b border-rams-rule-light flex justify-between items-center font-mono">
          <div>
            <div className="text-[10px] font-bold text-rams-ink-muted uppercase tracking-widest">
              SHIFT SWAP CONSOLE · สลับกะงาน
            </div>
            <div className="font-bold text-xs text-rams-ink mt-0.5">
              {format(new Date(shiftDate), "EEEE dd MMM yyyy", { locale: th })} · {shiftData.shift_name}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-sm border border-rams-rule-light hover:border-rams-rule text-rams-ink flex items-center justify-center font-bold text-xs"
          >
            ✕
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 font-mono">
          {errorMsg && (
            <div className="p-3 rounded-sm border border-rams-red bg-rams-red/10 text-rams-red text-xs font-bold">
              {errorMsg}
            </div>
          )}

          {/* STEP 1 */}
          {step === 1 && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-rams-ink uppercase tracking-wider mb-2">
                STEP 1: SELECT ACTION (เลือกประเภทคำขอ)
              </div>

              <button
                onClick={() => {
                  setActionType("GIVE_AWAY");
                  setStep(2);
                }}
                className="w-full bg-rams-bg hover:bg-rams-panel border border-rams-rule-light hover:border-rams-rule p-4 rounded-sm flex items-center gap-3 transition-all text-left tactile-btn-sm"
              >
                <div className="text-xl">👋</div>
                <div>
                  <div className="font-bold text-xs text-rams-ink">GIVE AWAY · ยกกะให้คนอื่น</div>
                  <div className="text-[10px] text-rams-ink-muted font-sans mt-0.5">
                    มอบกะนี้ให้เพื่อนร่วมงาน หรือเข้าตลาดกลางส่วนกลาง
                  </div>
                </div>
              </button>

              <button
                onClick={() => {
                  setActionType("TRADE");
                  setStep(2);
                }}
                className="w-full bg-rams-bg hover:bg-rams-panel border border-rams-rule-light hover:border-rams-rule p-4 rounded-sm flex items-center gap-3 transition-all text-left tactile-btn-sm"
              >
                <div className="text-xl">🔄</div>
                <div>
                  <div className="font-bold text-xs text-rams-ink">TRADE · แลกกะระหว่างวัน</div>
                  <div className="text-[10px] text-rams-ink-muted font-sans mt-0.5">
                    สลับกะทำงานกับเพื่อนร่วมงานที่มีกะในระดับเดียวกัน
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-rams-ink uppercase tracking-wider mb-2">
                STEP 2: ASSIGN TARGET ({actionType === "GIVE_AWAY" ? "ยกให้ใคร?" : "แลกกับใคร?"})
              </div>

              {actionType === "GIVE_AWAY" && (
                <button
                  onClick={() => setSelectedPeer(null)}
                  className={`w-full p-3 rounded-sm border flex items-center justify-between transition-all tactile-btn-sm ${
                    selectedPeer === null
                      ? "bg-rams-ink text-rams-panel border-rams-ink"
                      : "bg-rams-bg border-rams-rule-light text-rams-ink"
                  }`}
                >
                  <div className="text-left">
                    <div className="font-bold text-xs">OPEN POOL · ตลาดกลาง (ทุกคน)</div>
                    <div className="text-[9px] opacity-80">ประกาศให้เพื่อนทุกคนในแผนกกดรับได้</div>
                  </div>
                  {selectedPeer === null && <span className="font-bold">✓</span>}
                </button>
              )}

              <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                <div className="text-[9px] font-bold text-rams-ink-muted uppercase tracking-widest py-1">
                  AVAILABLE PEERS ({validPeers.length})
                </div>

                {validPeers.map((peer) => (
                  <button
                    key={peer.id}
                    onClick={() => setSelectedPeer(peer)}
                    className={`w-full p-2.5 rounded-sm border flex items-center justify-between transition-all tactile-btn-sm ${
                      selectedPeer?.id === peer.id
                        ? "bg-rams-orange text-rams-panel border-rams-orange"
                        : "bg-rams-bg border-rams-rule-light text-rams-ink"
                    }`}
                  >
                    <span className="font-bold text-xs">
                      {peer.nickname ? `${peer.nickname} (${peer.name})` : peer.name}
                    </span>
                    {selectedPeer?.id === peer.id && <span>✓</span>}
                  </button>
                ))}

                {validPeers.length === 0 && (
                  <p className="text-center text-xs text-rams-ink-muted py-4 bg-rams-bg rounded-sm border border-rams-rule-light">
                    ไม่มีเพื่อนที่ตรงเงื่อนไขในวันนี้
                  </p>
                )}
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2 border border-rams-rule-light rounded-sm text-xs font-bold text-rams-ink-muted hover:text-rams-ink"
                >
                  BACK (ย้อนกลับ)
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={actionType === "TRADE" && !selectedPeer}
                  className="flex-1 bg-rams-orange text-rams-panel border border-rams-rule rounded-sm font-bold text-xs py-2 uppercase tracking-wider disabled:opacity-50 tactile-btn"
                >
                  NEXT (ถัดไป) →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-rams-ink uppercase tracking-wider mb-2">
                STEP 3: CONFIRMATION (ตรวจสอบและยืนยัน)
              </div>

              <div className="bg-rams-bg p-3.5 rounded-sm border border-rams-rule-light space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-rams-ink-muted">ผู้ขอ (REQUESTER):</span>
                  <span className="font-bold text-rams-ink">{currentUser.nickname || currentUser.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-rams-ink-muted">เป้าหมาย (TARGET):</span>
                  <span className="font-bold text-rams-ink">
                    {selectedPeer ? selectedPeer.nickname || selectedPeer.name : "OPEN POOL (ตลาดกลาง)"}
                  </span>
                </div>
                <div className="flex justify-between border-t border-rams-rule-light/60 pt-2">
                  <span className="text-rams-ink-muted">ประเภท (TYPE):</span>
                  <span className="font-bold text-rams-orange">
                    {actionType === "GIVE_AWAY" ? "GIVE AWAY (ยกให้)" : "TRADE (แลกกะ)"}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-rams-ink uppercase tracking-wider mb-1">
                  หมายเหตุ (REASON / NOTES - OPTIONAL)
                </label>
                <textarea
                  className="w-full p-2 bg-rams-bg border border-rams-rule-light rounded-sm text-xs font-sans text-rams-ink outline-none focus:border-rams-orange"
                  rows="2"
                  placeholder="เช่น ติดธุระด่วน, สลับเพื่อเข้าเวรแทนวันพรุ่งนี้..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  onClick={() => setStep(2)}
                  className="px-4 py-2 border border-rams-rule-light rounded-sm text-xs font-bold text-rams-ink-muted hover:text-rams-ink"
                >
                  BACK
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isLoading}
                  className="flex-1 bg-rams-orange text-rams-panel border border-rams-rule rounded-sm font-bold text-xs py-2.5 uppercase tracking-wider tactile-btn cursor-pointer"
                >
                  {isLoading ? "SENDING..." : "CONFIRM REQUEST (ยืนยัน) →"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
