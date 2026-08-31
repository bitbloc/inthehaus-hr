import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { th } from "date-fns/locale";
import { supabase } from "../../lib/supabaseClient";

export default function Marketplace({ currentUser, initialRequests, onRefresh }) {
  const [requests, setRequests] = useState(initialRequests || []);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (text, type = "success") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    const { data } = await supabase
      .from("shift_swap_requests")
      .select(`
        *,
        requester:employees!requester_id(name, nickname, position),
        shift:shifts!old_shift_id(name, start_time, end_time)
      `)
      .eq("status", "PENDING_PEER")
      .is("target_peer_id", null)
      .order("target_date", { ascending: true });
    setRequests(data || []);
  };

  const handleAccept = async (reqId) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/shift-swap/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: reqId,
          responder_id: currentUser.id,
          action: "ACCEPT"
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast("รับกะงานสำเร็จ! ส่งต่อให้ผู้จัดการอนุมัติแล้ว", "success");
        fetchRequests();
        if (onRefresh) onRefresh();
      } else {
        showToast(data.error || "ไม่สามารถรับกะงานได้", "error");
      }
    } catch (e) {
      showToast("เกิดข้อผิดพลาดในการรับกะงาน", "error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div
          className={`p-3 rounded-sm border text-xs font-mono font-bold flex items-center justify-between ${
            toast.type === "error"
              ? "bg-rams-red text-rams-panel border-rams-red"
              : "bg-rams-green text-rams-panel border-rams-green"
          }`}
        >
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} className="ml-2">✕</button>
        </div>
      )}

      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-rams-ink">
          OPEN SWAP POOL · ตลาดแลกกะส่วนกลาง
        </span>
        <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-rams-panel border border-rams-rule-light rounded-sm text-rams-ink">
          {requests.length} POOL ITEMS
        </span>
      </div>

      {requests.length === 0 ? (
        <div className="bg-rams-panel border border-rams-rule-light p-8 rounded-sm text-center">
          <p className="text-xs font-mono font-bold text-rams-ink uppercase">ไม่มีกะว่างในตลาดแลกกะ</p>
          <p className="text-[11px] font-mono text-rams-ink-muted mt-1">NO PENDING SWAP REQUESTS IN POOL</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {requests.map((req) => (
            <div
              key={req.id}
              className="bg-rams-panel border border-rams-rule p-4 sm:p-5 rounded-sm flex flex-col justify-between hover:border-rams-orange transition-colors"
            >
              <div>
                <div className="flex justify-between items-start mb-3 border-b border-rams-rule-light pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-rams-ink">
                        {req.requester?.nickname || req.requester?.name}
                      </span>
                      <span className="text-[9px] font-mono uppercase bg-rams-bg border border-rams-rule-light px-1.5 py-0.5 rounded-sm text-rams-ink-muted">
                        {req.requester?.position || "Staff"}
                      </span>
                    </div>
                    <div className="mt-1">
                      <span
                        className={`text-[8px] font-mono font-bold uppercase px-1.5 py-0.5 rounded-sm border ${
                          req.type === "GIVE_AWAY"
                            ? "bg-rams-amber/10 text-rams-amber border-rams-amber/30"
                            : "bg-rams-orange/10 text-rams-orange border-rams-orange/30"
                        }`}
                      >
                        {req.type === "GIVE_AWAY" ? "GIVE AWAY (ยกให้)" : "TRADE (แลกกะ)"}
                      </span>
                    </div>
                  </div>

                  <div className="text-right font-mono">
                    <div className="text-sm font-bold text-rams-ink">
                      {format(parseISO(req.target_date), "d MMM yyyy", { locale: th })}
                    </div>
                    <div className="text-[9px] font-bold text-rams-ink-muted uppercase">
                      {format(parseISO(req.target_date), "EEEE", { locale: th })}
                    </div>
                  </div>
                </div>

                <div className="bg-rams-bg p-3 rounded-sm border border-rams-rule-light font-mono text-xs mb-3 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-rams-ink-muted text-[10px]">กะงาน (SHIFT):</span>
                    <span className="font-bold text-rams-ink">{req.shift?.name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-rams-ink-muted text-[10px]">ช่วงเวลา (TIME):</span>
                    <span className="font-bold text-rams-orange">
                      {(req.shift?.start_time || "").slice(0, 5)} - {(req.shift?.end_time || "").slice(0, 5)}
                    </span>
                  </div>
                </div>

                {req.notes && (
                  <p className="text-xs font-sans text-rams-ink-muted italic mb-3 pl-2 border-l-2 border-rams-orange">
                    "{req.notes}"
                  </p>
                )}
              </div>

              <button
                onClick={() => handleAccept(req.id)}
                disabled={isLoading || req.requester_id === currentUser.id}
                className={`w-full py-2.5 rounded-sm font-mono font-bold text-xs uppercase tracking-wider transition-all tactile-btn ${
                  req.requester_id === currentUser.id
                    ? "bg-rams-bg text-rams-ink-muted border border-rams-rule-light cursor-not-allowed shadow-none"
                    : "bg-rams-orange text-rams-panel border border-rams-rule hover:bg-rams-orange-active cursor-pointer"
                }`}
              >
                {req.requester_id === currentUser.id ? "YOUR REQUEST (คำขอของคุณ)" : "ACCEPT SHIFT (รับกะงาน) →"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
