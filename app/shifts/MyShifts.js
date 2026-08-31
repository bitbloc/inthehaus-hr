import { useState } from "react";
import { startOfMonth, endOfMonth, eachDayOfInterval, format, isToday } from "date-fns";
import { th } from "date-fns/locale";
import SwapRequestModal from "./SwapRequestModal";
import { getEffectiveDailyRoster } from "../../utils/roster_logic";

export default function MyShifts({
  currentUser,
  employees,
  schedules,
  shifts,
  overrides,
  requests,
  leaveRequests = []
}) {
  const [selectedDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalData, setModalData] = useState(null);

  const days = eachDayOfInterval({
    start: startOfMonth(selectedDate),
    end: endOfMonth(selectedDate)
  });

  const handleSwapClick = (dateStr, shift) => {
    setModalData({ date: dateStr, shift });
    setIsModalOpen(true);
  };

  return (
    <div className="bg-rams-panel border border-rams-rule rounded-sm overflow-hidden shadow-none">
      {/* Card Header */}
      <div className="p-4 border-b border-rams-rule-light bg-rams-bg/30 flex justify-between items-center">
        <div>
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-rams-ink">
            MY SHIFT SCHEDULE · กะของฉัน
          </span>
        </div>
        <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-rams-ink bg-rams-panel px-2 py-0.5 rounded-sm border border-rams-rule-light">
          {format(selectedDate, "MMMM yyyy", { locale: th })}
        </div>
      </div>

      {/* Shifts List */}
      <div className="divide-y divide-rams-rule-light font-mono">
        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");

          // 1. Calculate Effective Roster
          const dailyRoster = getEffectiveDailyRoster([currentUser], schedules, overrides, shifts, day);
          const myShift = dailyRoster.find((r) => String(r.employee.id) === String(currentUser.id));

          // 2. Check Pending Swap
          const pendingReq = requests.find(
            (r) => r.target_date === dateStr && r.status !== "REJECTED" && r.status !== "CANCELLED"
          );

          // 3. Check Leave
          const myLeave = leaveRequests.find(
            (l) => String(l.employee_id) === String(currentUser.id) && l.leave_date === dateStr
          );

          const isWork = !!myShift;
          const isPast = day < new Date().setHours(0, 0, 0, 0);
          const hasLeave = !!myLeave;

          if (!isWork && !pendingReq && !hasLeave) return null;

          let leaveBadge = null;
          if (hasLeave) {
            const typeLabel =
              myLeave.leave_type === "sick"
                ? "SICK (ลาป่วย)"
                : myLeave.leave_type === "business"
                ? "BUSINESS (ลากิจ)"
                : "VACATION (พักร้อน)";
            const statusLabel = myLeave.status === "approved" ? "APPROVED" : "PENDING";
            const statusColor =
              myLeave.status === "approved"
                ? "bg-rams-green/10 text-rams-green border-rams-green/30"
                : "bg-rams-amber/10 text-rams-amber border-rams-amber/30";

            leaveBadge = (
              <div className="mt-1 flex flex-col gap-1">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-sm border ${statusColor} w-max uppercase`}>
                  {typeLabel} · {statusLabel}
                </span>
                {myLeave.replacement_employee && (
                  <div className="text-[10px] text-rams-ink-muted flex items-center gap-1 font-sans">
                    <span>คนแทน:</span>
                    <span className="font-mono font-bold text-rams-ink">
                      {myLeave.replacement_employee.nickname || myLeave.replacement_employee.name}
                    </span>
                  </div>
                )}
              </div>
            );
          }

          return (
            <div
              key={dateStr}
              className={`p-3.5 sm:p-4 flex items-center justify-between transition-colors ${
                isToday(day) ? "bg-rams-bg border-l-4 border-rams-orange" : "hover:bg-rams-bg/40"
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div
                  className={`text-center min-w-[44px] p-1.5 rounded-sm border ${
                    isToday(day)
                      ? "bg-rams-panel border-rams-orange text-rams-orange font-bold"
                      : "bg-rams-bg border-rams-rule-light text-rams-ink"
                  }`}
                >
                  <div className="text-[8px] uppercase">{format(day, "EEE", { locale: th })}</div>
                  <div className="text-base font-bold leading-tight">{format(day, "d")}</div>
                </div>

                <div>
                  {isWork ? (
                    <>
                      <div className="font-bold text-xs sm:text-sm text-rams-ink flex items-center gap-2">
                        <span>{myShift.shift_name}</span>
                        {myShift.source === "OVERRIDE" && (
                          <span className="bg-rams-amber/10 text-rams-amber text-[8px] px-1.5 py-0.5 rounded-sm font-bold border border-rams-amber/30 uppercase">
                            SWAPPED
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-rams-orange font-bold mt-0.5">
                        {(myShift.start_time || "").slice(0, 5)} - {(myShift.end_time || "").slice(0, 5)}
                      </div>
                    </>
                  ) : (
                    <div className="text-xs font-bold text-rams-ink-muted">
                      {hasLeave && myLeave.status === "approved" ? "วันหยุด (ลาอนุมัติ)" : "วันหยุด (OFF)"}
                    </div>
                  )}

                  {leaveBadge}

                  {pendingReq && (
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rams-orange animate-pulse"></span>
                      <span className="text-[9px] font-bold text-rams-orange uppercase tracking-wider">
                        ขอสลับ: {pendingReq.status === "PENDING_PEER" ? "WAITING PEER" : "WAITING MANAGER"}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Button */}
              {!isPast && isWork && !pendingReq && !hasLeave && (
                <button
                  onClick={() => handleSwapClick(dateStr, myShift)}
                  className="px-3 py-1.5 bg-rams-panel hover:bg-rams-bg border border-rams-rule rounded-sm text-[10px] font-mono font-bold text-rams-ink uppercase tracking-wider transition-all tactile-btn-sm cursor-pointer"
                >
                  SWAP ⇄
                </button>
              )}
            </div>
          );
        })}

        {days.every((d) => {
          const dateStr = format(d, "yyyy-MM-dd");
          const dailyRoster = getEffectiveDailyRoster([currentUser], schedules, overrides, shifts, d);
          const myShift = dailyRoster.find((r) => String(r.employee.id) === String(currentUser.id));
          const myLeave = leaveRequests.find(
            (l) => String(l.employee_id) === String(currentUser.id) && l.leave_date === dateStr
          );
          return !myShift && !myLeave;
        }) && (
          <div className="p-8 text-center text-rams-ink-muted font-mono text-xs uppercase">
            ไม่มีกะงานหรือวันลาในเดือนนี้
          </div>
        )}
      </div>

      {/* Swap Request Modal */}
      {isModalOpen && modalData && (
        <SwapRequestModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setModalData(null);
          }}
          currentUser={currentUser}
          shiftDate={modalData.date}
          shiftData={modalData.shift}
          employees={employees}
          schedules={schedules}
          overrides={overrides}
          shifts={shifts}
        />
      )}
    </div>
  );
}
