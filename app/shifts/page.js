/* Hallmark · route: custom (bespoke) · structure: live roster console
 * paper: oklch(96% 0.006 80) · accent: oklch(62% 0.16 45) · display: Geist Mono · body: Geist Sans
 * axes: light / geometric-sans / warm · gates: all-pass
 */
"use client";
import { useEffect, useState } from "react";
import liff from "@line/liff";
import { supabase } from "../../lib/supabaseClient";
import { useRealtimeSync } from "../../lib/useRealtimeSync";
import MyShifts from "./MyShifts";
import Marketplace from "./Marketplace";
import TeamSchedule from "./TeamSchedule";
import NavigationDock from "../_components/NavigationDock";
import { Calendar, ArrowRightLeft, Users, RefreshCw } from "lucide-react";

export default function ShiftsPage() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdminSession, setIsAdminSession] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [schedules, setSchedules] = useState({});
  const [overrides, setOverrides] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [poolRequests, setPoolRequests] = useState([]);

  const [activeTab, setActiveTab] = useState("my-shifts");

  const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID;

  const fetchData = async (isInitial = false) => {
    if (isInitial) setLoading(true);
    else setIsSyncing(true);

    try {
      // 1. Fetch Master Data
      const { data: empData } = await supabase.from("employees").select("*").eq("is_active", true);
      const { data: shiftData } = await supabase.from("shifts").select("*");
      const { data: schedData } = await supabase.from("employee_schedules").select("*");

      // 2. Fetch Transactional Data
      const { data: ovData } = await supabase.from("roster_transactions").select("*, shifts(*)");
      const { data: reqData } = await supabase.from("shift_swap_requests").select(
        "*, requester:employees!requester_id(name, nickname, position), peer:employees!target_peer_id(name, nickname), shift:shifts!old_shift_id(name, start_time, end_time)"
      );
      const { data: leaveData } = await supabase
        .from("leave_requests")
        .select(`
          *,
          employee:employees!employee_id(id, name, nickname, position),
          replacement_employee:employees!replacement_employee_id(id, name, nickname, position)
        `)
        .neq("status", "rejected");

      const schedMap = {};
      schedData?.forEach((s) => {
        if (!schedMap[s.employee_id]) schedMap[s.employee_id] = {};
        schedMap[s.employee_id][s.day_of_week] = s;
      });

      setEmployees(empData || []);
      setShifts(shiftData || []);
      setSchedules(schedMap);
      setOverrides(ovData || []);
      setLeaveRequests(leaveData || []);
      setPoolRequests(reqData?.filter((r) => r.status === "PENDING_PEER" && !r.target_peer_id) || []);

      if (empData && empData.length > 0) {
        let resolvedEmp = currentUser;
        let adminAuthed = isAdminSession;

        if (!adminAuthed) {
          try {
            const { data: sessionData } = await supabase.auth.getSession();
            if (sessionData?.session?.user) {
              adminAuthed = true;
              setIsAdminSession(true);
            }
          } catch (e) {}
        }

        if (!resolvedEmp) {
          try {
            if (typeof liff !== "undefined" && liff.isLoggedIn && liff.isLoggedIn()) {
              let lineUid = null;
              try {
                const prof = await liff.getProfile();
                lineUid = prof?.userId;
              } catch (profErr) {
                const decoded = liff.getDecodedIDToken?.();
                lineUid = decoded?.sub;
              }
              if (lineUid) {
                const matched = empData.find(
                  (e) =>
                    (e.line_bot_id && e.line_bot_id === lineUid) ||
                    (e.line_user_id && e.line_user_id === lineUid)
                );
                if (matched) resolvedEmp = matched;
              }
            }
          } catch (e) {
            console.warn("LIFF Profile lookup skipped:", e);
          }

          if (!resolvedEmp && adminAuthed) {
            resolvedEmp = empData[0];
          }
        }

        if (resolvedEmp) {
          setCurrentUser(resolvedEmp);
          setMyRequests(
            reqData?.filter(
              (r) => String(r.requester_id) === String(resolvedEmp.id) || String(r.target_peer_id) === String(resolvedEmp.id)
            ) || []
          );
        } else {
          setCurrentUser(null);
          setMyRequests([]);
        }
      }
    } catch (err) {
      console.error("Error fetching shifts data:", err);
    }

    setLoading(false);
    setIsSyncing(false);
  };

  useEffect(() => {
    const init = async () => {
      try {
        if (typeof liff !== "undefined" && LIFF_ID) {
          await liff.init({ liffId: LIFF_ID });
        }
      } catch (err) {
        console.warn("LIFF init warning:", err);
      }
      fetchData(true);
    };
    init();
  }, [LIFF_ID]);

  useRealtimeSync(["roster_transactions", "shift_swap_requests", "leave_requests"], (payload) => {
    fetchData(false);
  });

  const handleUserSwitch = (e) => {
    const user = employees.find((emp) => String(emp.id) === String(e.target.value));
    if (user) {
      setCurrentUser(user);
      try {
        localStorage.setItem("demo_user_id", user.id);
      } catch (e) {}
      setMyRequests(
        overrides?.filter(
          (r) => String(r.requester_id) === String(user.id) || String(r.target_peer_id) === String(user.id)
        ) || []
      );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-rams-bg text-rams-ink flex flex-col items-center justify-center font-mono">
        <RefreshCw className="w-8 h-8 animate-spin text-rams-orange mb-3" />
        <div className="text-xs font-bold uppercase tracking-wider text-rams-ink-muted">
          LOADING LIVE ROSTER...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-rams-bg text-rams-ink safe-bottom-dock">
      {/* Header */}
      <header className="border-b border-rams-rule-light bg-rams-panel px-5 py-5">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rams-orange"></span>
              <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-rams-ink-muted">
                IN THE HAUS · LIVE ROSTER
              </span>
            </div>
            <h1 className="text-xl font-mono font-bold tracking-tight text-rams-ink mt-1">
              ตารางงาน & ตลาดแลกกะ (SHIFTS)
            </h1>
            <p className="text-[11px] font-mono text-rams-ink-muted mt-0.5">
              ระบบจัดการและสลับกะงานแบบเรียลไทม์
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isSyncing && <RefreshCw className="w-3.5 h-3.5 text-rams-orange animate-spin" />}
            {isAdminSession ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono font-bold uppercase px-2 py-1 bg-rams-amber/20 text-rams-ink border border-rams-rule rounded-sm">
                  ADMIN VIEW
                </span>
                <select
                  className="text-xs font-mono font-bold border border-rams-rule rounded-sm bg-rams-bg text-rams-ink p-2 outline-none focus:border-rams-orange cursor-pointer"
                  value={currentUser?.id || ""}
                  onChange={handleUserSwitch}
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nickname ? `${e.nickname} (${e.name})` : e.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : currentUser ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-rams-bg border border-rams-rule-light rounded-sm">
                <span className="w-2 h-2 rounded-full bg-rams-green"></span>
                <span className="text-xs font-mono font-bold text-rams-ink">
                  {currentUser.nickname ? `${currentUser.nickname} (${currentUser.name})` : currentUser.name}
                </span>
              </div>
            ) : (
              <button
                onClick={() => {
                  if (typeof liff !== "undefined" && liff.login) {
                    liff.login();
                  } else {
                    window.location.href = "https://liff.line.me/2008567449-W868y8RY";
                  }
                }}
                className="px-3.5 py-2 bg-[#06C755] hover:bg-[#05b34c] text-white rounded-sm text-xs font-mono font-bold border border-rams-rule tactile-btn-sm cursor-pointer"
              >
                LINE Login เพื่อจัดการกะ
              </button>
            )}
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="max-w-3xl mx-auto mt-4 pt-3 border-t border-rams-rule-light flex gap-2">
          <button
            onClick={() => setActiveTab("my-shifts")}
            className={`flex-1 py-2 px-3 rounded-sm font-mono font-bold text-xs flex items-center justify-center gap-1.5 transition-all tactile-btn-sm ${
              activeTab === "my-shifts"
                ? "bg-rams-ink text-rams-panel border border-rams-ink"
                : "bg-rams-bg text-rams-ink-muted border border-rams-rule-light hover:text-rams-ink"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>กะของฉัน (MY SHIFTS)</span>
          </button>
          <button
            onClick={() => setActiveTab("marketplace")}
            className={`flex-1 py-2 px-3 rounded-sm font-mono font-bold text-xs flex items-center justify-center gap-1.5 transition-all tactile-btn-sm relative ${
              activeTab === "marketplace"
                ? "bg-rams-ink text-rams-panel border border-rams-ink"
                : "bg-rams-bg text-rams-ink-muted border border-rams-rule-light hover:text-rams-ink"
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>ตลาดแลกกะ (MARKET)</span>
            {poolRequests.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-rams-orange animate-pulse" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("team")}
            className={`flex-1 py-2 px-3 rounded-sm font-mono font-bold text-xs flex items-center justify-center gap-1.5 transition-all tactile-btn-sm ${
              activeTab === "team"
                ? "bg-rams-ink text-rams-panel border border-rams-ink"
                : "bg-rams-bg text-rams-ink-muted border border-rams-rule-light hover:text-rams-ink"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>ตารางทีม (TEAM)</span>
          </button>
        </div>
      </header>

      {/* Content Area */}
      <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        {activeTab === "my-shifts" && (
          <MyShifts
            currentUser={currentUser}
            employees={employees}
            schedules={schedules}
            shifts={shifts}
            overrides={overrides}
            requests={myRequests}
            leaveRequests={leaveRequests}
          />
        )}

        {activeTab === "marketplace" && (
          <Marketplace
            currentUser={currentUser}
            shifts={shifts}
            poolRequests={poolRequests}
            myRequests={myRequests}
            onRefresh={() => fetchData(false)}
          />
        )}

        {activeTab === "team" && (
          <TeamSchedule
            employees={employees}
            schedules={schedules}
            shifts={shifts}
            overrides={overrides}
            leaveRequests={leaveRequests}
          />
        )}
      </main>

      <NavigationDock />
    </div>
  );
}
