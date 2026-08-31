import { format, startOfWeek, addDays, isSameDay } from "date-fns";
import { th } from "date-fns/locale";
import { getEffectiveDailyRoster } from "../../utils/roster_logic";

export default function TeamSchedule({
  employees,
  schedules,
  overrides,
  shifts,
  leaveRequests = []
}) {
  const today = new Date();
  const startOfCurrentWeek = startOfWeek(today, { weekStartsOn: 1 }); // Monday start
  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(startOfCurrentWeek, i));

  const weeklyRoster = weekDays.map((date) => ({
    date,
    roster: getEffectiveDailyRoster(employees, schedules, overrides, shifts, date)
  }));

  const getPositionOrder = (position) => {
    const pos = (position || "").toLowerCase().trim();
    if (pos.includes("owner")) return 1;
    if (pos.includes("cook") || pos.includes("kitchen")) return 2;
    if (pos.includes("bar") || pos.includes("floor")) return 3;
    return 4;
  };

  const sortedEmployees = [...employees].sort((a, b) => {
    const orderA = getPositionOrder(a.position);
    const orderB = getPositionOrder(b.position);
    if (orderA !== orderB) return orderA - orderB;
    return (a.nickname || a.name || "").localeCompare(b.nickname || b.name || "", "th");
  });

  return (
    <div className="space-y-4">
      <div className="bg-rams-panel border border-rams-rule rounded-sm overflow-hidden shadow-none">
        {/* Header */}
        <div className="p-4 border-b border-rams-rule-light bg-rams-bg/30 flex justify-between items-center">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-rams-ink">
              TEAM ROSTER MATRIX · ตารางงานทีม
            </span>
          </div>
          <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-rams-ink bg-rams-panel px-2 py-0.5 rounded-sm border border-rams-rule-light">
            {format(startOfCurrentWeek, "d MMM", { locale: th })} -{" "}
            {format(addDays(startOfCurrentWeek, 6), "d MMM yyyy", { locale: th })}
          </div>
        </div>

        {/* Matrix Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse font-mono">
            <thead>
              <tr className="bg-rams-bg/60 border-b border-rams-rule-light text-rams-ink-muted">
                <th className="p-3 min-w-[130px] font-bold uppercase tracking-wider sticky left-0 z-10 bg-rams-bg/95 border-r border-rams-rule-light">
                  พนักงาน (STAFF)
                </th>
                {weekDays.map((day) => (
                  <th
                    key={day.toString()}
                    className={`p-2.5 min-w-[100px] text-center border-r border-rams-rule-light ${
                      isSameDay(day, today) ? "bg-rams-orange/10 text-rams-orange font-bold" : ""
                    }`}
                  >
                    <div className="text-[9px] uppercase">{format(day, "EEE", { locale: th })}</div>
                    <div className="text-sm font-bold mt-0.5">{format(day, "d")}</div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-rams-rule-light">
              {sortedEmployees.map((emp) => (
                <tr key={emp.id} className="hover:bg-rams-bg/30 transition-colors">
                  <td className="p-3 sticky left-0 z-10 bg-rams-panel border-r border-rams-rule-light font-sans">
                    <div className="font-bold text-xs text-rams-ink">{emp.nickname || emp.name}</div>
                    <div className="text-[9px] font-mono text-rams-ink-muted uppercase">{emp.position}</div>
                  </td>
                  {weekDays.map((day) => {
                    const dayStr = format(day, "yyyy-MM-dd");
                    const dayData = weeklyRoster.find((d) => isSameDay(d.date, day));
                    const shift = dayData?.roster?.find((r) => String(r.employee.id) === String(emp.id));
                    const empLeave = leaveRequests.find(
                      (l) => String(l.employee_id) === String(emp.id) && l.leave_date === dayStr
                    );

                    return (
                      <td
                        key={day.toString()}
                        className={`p-2 text-center border-r border-rams-rule-light ${
                          isSameDay(day, today) ? "bg-rams-orange/5" : ""
                        }`}
                      >
                        {empLeave && empLeave.status === "approved" ? (
                          <div className="rounded-sm p-1 text-[9px] font-bold border border-rams-green/30 bg-rams-green/10 text-rams-green uppercase">
                            <div>{empLeave.leave_type === "sick" ? "SICK" : empLeave.leave_type === "business" ? "BIZ" : "VAC"}</div>
                            {empLeave.replacement_employee && (
                              <div className="text-[8px] text-rams-ink-muted mt-0.5 truncate font-sans">
                                แทน: {empLeave.replacement_employee.nickname || empLeave.replacement_employee.name}
                              </div>
                            )}
                          </div>
                        ) : shift ? (
                          <div className={`rounded-sm p-1.5 border ${getShiftColorClass(shift.shift_name)}`}>
                            <div className="truncate max-w-[85px] mx-auto font-bold text-[10px]">
                              {shift.shift_name}
                            </div>
                            <div className="text-[9px] font-mono text-rams-ink-muted mt-0.5">
                              {(shift.start_time || "").slice(0, 5)}-{(shift.end_time || "").slice(0, 5)}
                            </div>
                            {empLeave && empLeave.status === "pending" && (
                              <div className="text-[8px] text-rams-amber mt-1 bg-rams-amber/10 py-0.5 rounded-sm border border-rams-amber/20 uppercase font-bold">
                                REQ LEAVE
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-rams-ink-muted text-[10px]">-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr className="border-t-2 border-rams-rule bg-rams-bg/60 font-mono">
                <td className="p-3 sticky left-0 z-10 bg-rams-bg/95 border-r border-rams-rule-light text-[10px] font-bold uppercase tracking-wider text-rams-ink">
                  TOTAL ON DUTY (รวม)
                </td>
                {weekDays.map((day) => {
                  const dayData = weeklyRoster.find((d) => isSameDay(d.date, day));
                  const workingCount = (dayData?.roster || []).filter((r) => r.shift_name).length;
                  return (
                    <td
                      key={`total-${day.toString()}`}
                      className="p-2 text-center text-xs font-bold text-rams-ink border-r border-rams-rule-light"
                    >
                      {workingCount > 0 ? `${workingCount}` : "-"}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

const getShiftColorClass = (shiftName) => {
  const name = (shiftName || "").toLowerCase();

  if (name.includes("ควบ") || name.toLowerCase().includes("double")) {
    return "bg-rams-red/10 text-rams-red border-rams-red/30";
  }

  if (
    name.includes("ค่ำ") ||
    name.includes("ดึก") ||
    name.toLowerCase().includes("night") ||
    name.toLowerCase().includes("evening")
  ) {
    return "bg-rams-ink/10 text-rams-ink border-rams-ink/20";
  }

  if (name.includes("เช้า") || name.toLowerCase().includes("morning")) {
    return "bg-rams-orange/10 text-rams-orange border-rams-orange/30";
  }

  return "bg-rams-amber/10 text-rams-amber border-rams-amber/30";
};
