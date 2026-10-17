import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Circle, CalendarDays, Clock, ChevronDown, ChevronUp, LogOut, Home, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toDateStr } from "@/lib/dateUtils";

type View = "upcoming" | "today" | "past";

export default function CohostPortal() {
  const session = sessionStorage.getItem("cohost_session");
  if (!session) { window.location.href = "/cohost"; return null; }

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const [view, setView] = useState<View>("upcoming");
  const [expandedTask, setExpandedTask] = useState<Set<number>>(new Set());
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const { data: allTasks = [], refetch } = trpc.tasks.list.useQuery();
  const { data: reservations = [] } = trpc.reservations.list.useQuery();
  const { data: events = [] } = trpc.calendar.events.useQuery();
  const updateTask = trpc.tasks.update.useMutation({ onSuccess: () => refetch() });

  // Co-host sees inspection tasks only
  const cohostTasks = useMemo(() =>
    allTasks.filter(t => t.type === "inspection"),
    [allTasks]
  );

  const filtered = useMemo(() => {
    return cohostTasks.filter(t => {
      const due = t.dueDate ? String(t.dueDate).split("T")[0] : null;
      if (view === "today") return due === todayStr && t.status !== "complete";
      if (view === "upcoming") return (!due || due > todayStr) && t.status !== "complete";
      if (view === "past") return t.status === "complete" || (due && due < todayStr);
      return false;
    }).sort((a, b) => {
      const aDate = String(a.dueDate ?? "").split("T")[0];
      const bDate = String(b.dueDate ?? "").split("T")[0];
      return view === "past" ? bDate.localeCompare(aDate) : aDate.localeCompare(bDate);
    });
  }, [cohostTasks, view, todayStr]);

  const resMap = useMemo(() => new Map(reservations.map(r => [r.id, r])), [reservations]);

  // Calendar
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = viewDate.toLocaleString("default", { month: "long", year: "numeric" });
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  function toggleChecklistItem(task: typeof allTasks[0], idx: number) {
    const checklist = [...((task.checklist as {item:string;done:boolean}[]) ?? [])];
    checklist[idx] = { ...checklist[idx], done: !checklist[idx].done };
    const allDone = checklist.every(c => c.done);
    updateTask.mutate({ id: task.id, checklist, status: allDone ? "complete" : "in_progress" });
  }

  // Upcoming arrivals for context
  const upcomingArrivals = useMemo(() =>
    reservations
      .filter(r => String(r.arrivalDate).split("T")[0] >= todayStr && r.status !== "cancelled")
      .sort((a, b) => String(a.arrivalDate).localeCompare(String(b.arrivalDate)))
      .slice(0, 5),
    [reservations, todayStr]
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Home className="w-5 h-5 text-gray-900" />
            <span className="font-serif text-lg text-gray-900">Vacation Rental</span>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Property Manager</span>
          </div>
          <button
            onClick={() => { sessionStorage.removeItem("cohost_session"); window.location.href = "/cohost"; }}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Booking calendar */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewDate(new Date(year, month - 1, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-semibold">{monthName}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewDate(new Date(year, month + 1, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <div className="grid grid-cols-7 mb-1">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
              <div key={d} className="text-center text-[10px] text-gray-400 py-0.5">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((date, i) => {
              if (!date) return <div key={`e-${i}`} />;
              const ds = toDateStr(date);
              const isPast = date < new Date(today.getFullYear(), today.getMonth(), today.getDate());
              const blocked = events.some(ev => ds >= String(ev.startDate).split("T")[0] && ds < String(ev.endDate).split("T")[0]);
              const isCheckin = events.some(ev => String(ev.startDate).split("T")[0] === ds);
              const isCheckout = events.some(ev => String(ev.endDate).split("T")[0] === ds);
              const isToday = ds === todayStr;

              return (
                <div key={ds} className={`
                  h-8 flex items-center justify-center text-xs rounded-md transition-all
                  ${isPast ? "text-gray-300" : ""}
                  ${isToday ? "ring-1 ring-gray-900 font-semibold" : ""}
                  ${isCheckin && !isCheckout ? "bg-blue-100 text-blue-700 font-medium" : ""}
                  ${isCheckout && !isCheckin ? "bg-emerald-50 text-emerald-600" : ""}
                  ${isCheckin && isCheckout ? "bg-amber-100 text-amber-700 font-semibold" : ""}
                  ${blocked && !isCheckin && !isCheckout ? "bg-gray-100 text-gray-400" : ""}
                `}>
                  {date.getDate()}
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-gray-100 border border-gray-200" />Booked</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-100 border border-blue-200" />Check-in</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-50 border border-emerald-200" />Checkout</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-100 border border-amber-200" />Turnover</span>
          </div>
        </div>

        {/* Upcoming arrivals */}
        {upcomingArrivals.length > 0 && (
          <div className="bg-blue-50 rounded-xl p-4 space-y-2">
            <p className="text-xs font-medium text-blue-700 uppercase tracking-wide">Upcoming Arrivals</p>
            {upcomingArrivals.map(r => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{r.guestName ?? "Guest"} · {r.guestCount ?? 1} guest{(r.guestCount ?? 1) !== 1 ? "s" : ""}</span>
                <span className="text-gray-500">{String(r.arrivalDate).split("T")[0]}</span>
              </div>
            ))}
          </div>
        )}

        {/* View tabs + tasks */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Pre Check-In Tasks</h2>
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              {(["today", "upcoming", "past"] as View[]).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all capitalize ${view === v ? "bg-white shadow-sm text-gray-900" : "text-gray-400"}`}>
                  {v === "today" ? "Today" : v}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 space-y-2">
              <CalendarDays className="w-7 h-7 mx-auto opacity-30" />
              <p className="text-sm">
                {view === "today" ? "No inspection tasks for today." :
                 view === "upcoming" ? "No upcoming inspection tasks." :
                 "No completed tasks yet."}
              </p>
            </div>
          )}

          <div className="space-y-3">
            {filtered.map(task => {
              const checklist = (task.checklist as {item:string;done:boolean}[]) ?? [];
              const doneCount = checklist.filter(c => c.done).length;
              const isExpanded = expandedTask.has(task.id);
              const res = task.reservationId ? resMap.get(task.reservationId) : null;
              const dueStr = task.dueDate ? String(task.dueDate).split("T")[0] : null;

              return (
                <div key={task.id} className={`bg-white rounded-xl border overflow-hidden ${task.status === "complete" ? "border-emerald-200 opacity-70" : "border-gray-200"}`}>
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer"
                    onClick={() => setExpandedTask(prev => {
                      const n = new Set(prev);
                      n.has(task.id) ? n.delete(task.id) : n.add(task.id);
                      return n;
                    })}
                  >
                    <button className="shrink-0" onClick={e => {
                      e.stopPropagation();
                      updateTask.mutate({ id: task.id, status: task.status === "complete" ? "in_progress" : "complete" });
                    }}>
                      {task.status === "complete"
                        ? <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                        : <Circle className="w-6 h-6 text-gray-300 hover:text-gray-500 transition-colors" />
                      }
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium text-sm ${task.status === "complete" ? "line-through text-gray-400" : "text-gray-900"}`}>{task.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400 flex-wrap">
                        {dueStr && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{dueStr}</span>}
                        {task.arrivalWindow && <span>Ready by: {task.arrivalWindow}</span>}
                        {checklist.length > 0 && <span className={doneCount === checklist.length ? "text-emerald-600" : ""}>{doneCount}/{checklist.length} items</span>}
                        {res && <span>{res.guestName ?? "Guest"} arrives {String(res.arrivalDate).split("T")[0]}</span>}
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                  </div>

                  {isExpanded && checklist.length > 0 && (
                    <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-2 bg-gray-50">
                      {checklist.map((item, idx) => (
                        <label key={idx} className="flex items-start gap-3 cursor-pointer group">
                          <button onClick={() => toggleChecklistItem(task, idx)} className="shrink-0 mt-0.5">
                            {item.done
                              ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                              : <Circle className="w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                            }
                          </button>
                          <span className={`text-sm leading-relaxed ${item.done ? "line-through text-gray-400" : "text-gray-700"}`}>{item.item}</span>
                        </label>
                      ))}
                      {task.status !== "complete" && (
                        <button
                          onClick={() => updateTask.mutate({ id: task.id, status: "complete" })}
                          className="mt-3 w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors"
                        >
                          Mark Property Ready ✓
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
