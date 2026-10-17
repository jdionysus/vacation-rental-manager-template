import { useState, useMemo } from "react";
import HostLayout from "@/components/HostLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, Users, Brush, Wrench, ExternalLink, X, CheckCircle2, Circle,
  Plus, RefreshCw, Trash2
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const SOURCE_COLORS: Record<string, string> = {
  airbnb: "bg-rose-400",
  vrbo: "bg-blue-400",
  booking_com: "bg-indigo-400",
  direct: "bg-emerald-400",
  other: "bg-gray-400",
};

const SOURCE_TEXT: Record<string, string> = {
  airbnb: "text-rose-700",
  vrbo: "text-blue-700",
  booking_com: "text-indigo-700",
  direct: "text-emerald-700",
  other: "text-gray-700",
};

const SOURCE_BG: Record<string, string> = {
  airbnb: "bg-rose-50 border-rose-200",
  vrbo: "bg-blue-50 border-blue-200",
  booking_com: "bg-indigo-50 border-indigo-200",
  direct: "bg-emerald-50 border-emerald-200",
  other: "bg-gray-50 border-gray-200",
};

const TASK_TYPE_COLORS: Record<string, string> = {
  turnover: "bg-amber-400",
  maintenance: "bg-purple-400",
  inspection: "bg-sky-400",
  other: "bg-gray-400",
};

export default function ReservationCalendarPage() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthName = viewDate.toLocaleString("default", { month: "long", year: "numeric" });

  const { data: reservations = [] } = trpc.reservations.list.useQuery();
  const { data: calendarEvents = [], refetch: refetchEvents } = trpc.calendar.events.useQuery();
  const { data: allTasks = [], refetch: refetchTasks } = trpc.tasks.list.useQuery();
  const updateTask = trpc.tasks.update.useMutation({ onSuccess: () => { refetchTasks(); toast.success("Task updated"); } });
  const updateRes = trpc.reservations.update.useMutation({ onSuccess: () => toast.success("Reservation updated") });
  const addBlock = trpc.calendar.addBlock.useMutation({ onSuccess: () => { refetchEvents(); setShowAddBlock(false); toast.success("Block added"); } });
  const deleteEvent = trpc.calendar.deleteEvent.useMutation({ onSuccess: () => { refetchEvents(); toast.success("Event removed"); } });
  const syncAll = trpc.ical.syncAll.useMutation({ onSuccess: (r) => { refetchEvents(); toast.success(`Synced ${r.total} feeds`); } });

  const [showAddBlock, setShowAddBlock] = useState(false);
  const [blockForm, setBlockForm] = useState({ title: "Blocked", startDate: "", endDate: "", eventType: "block" as "block" | "maintenance" });

  // Build calendar grid
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  const days = Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - firstDay + 1;
    if (dayNum < 1 || dayNum > daysInMonth) return null;
    return new Date(year, month, dayNum).toISOString().split("T")[0];
  });

  // Helper: safely convert Date object or string to YYYY-MM-DD
  function toDateStr(val: unknown): string {
    if (!val) return '';
    if (val instanceof Date) return val.toISOString().split('T')[0];
    const s = String(val);
    if (s.includes('T')) return s.split('T')[0];
    // Handle 'Mon Jan 01 2024 ...' format
    if (s.includes(' ') && s.length > 10) {
      const d = new Date(s);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    return s.slice(0, 10);
  }

  // Map reservations + iCal calendar events to date ranges
  const resForDate = useMemo(() => {
    const map = new Map<string, (typeof reservations[0] | { id: number; guestName: string | null; source: string; guestCount: number | null; status: string; arrivalDate: unknown; departureDate: unknown; guestEmail: string | null })[]>();
    const eventByReservationId = new Map(
      calendarEvents
        .filter((event) => typeof event.reservationId === "number")
        .map((event) => [event.reservationId as number, event]),
    );
    const reservationIds = new Set(reservations.map((reservation) => reservation.id));
    
    // Add each canonical reservation once, keeping original imported guest details for display.
    for (const r of reservations) {
      if (r.guestEmail === 'demo@example.com') continue;
      const linkedEvent = eventByReservationId.get(r.id);
      const canonicalReservation = linkedEvent ? {
        ...r,
        guestName: linkedEvent.guestFirstNames || r.guestName,
        guestCount: linkedEvent.guestCount ?? r.guestCount,
      } : r;
      const arr = toDateStr(r.arrivalDate);
      const dep = toDateStr(r.departureDate);
      if (!arr || !dep || arr.length < 10 || dep.length < 10) continue;
      let cur = new Date(arr + "T12:00:00Z");
      const end = new Date(dep + "T12:00:00Z");
      let safety = 0;
      while (cur <= end && safety++ < 365) {
        const key = cur.toISOString().split("T")[0];
        const list = map.get(key) ?? [];
        list.push(canonicalReservation);
        map.set(key, list);
        cur = new Date(cur.getTime() + 86400000);
      }
    }
    
    // Only unlinked iCal bookings need a synthetic display row. Linked events are
    // already represented by their canonical reservation above.
    for (const ev of calendarEvents) {
      if (ev.eventType !== 'booking' && ev.title !== 'Reserved') continue;
      if (typeof ev.reservationId === "number" && reservationIds.has(ev.reservationId)) continue;
      const arr = toDateStr(ev.startDate);
      const dep = toDateStr(ev.endDate);
      if (!arr || !dep || arr.length < 10 || dep.length < 10) continue;
      // Create a reservation-like object for display
      const evAsRes = {
        id: -(ev.id), // negative ID to distinguish from real reservations
        guestName: ev.guestFirstNames ?? ev.title ?? ev.source,
        source: ev.source,
        guestCount: null,
        status: 'confirmed',
        arrivalDate: arr,
        departureDate: dep,
        guestEmail: null,
      };
      let cur = new Date(arr + "T12:00:00Z");
      const end = new Date(dep + "T12:00:00Z");
      let safety = 0;
      while (cur <= end && safety++ < 365) {
        const key = cur.toISOString().split("T")[0];
        const list = map.get(key) ?? [];
        list.push(evAsRes);
        map.set(key, list);
        cur = new Date(cur.getTime() + 86400000);
      }
    }
    
    return map;
  }, [reservations, calendarEvents]);

  // Map tasks to due dates
  const tasksForDate = useMemo(() => {
    const map = new Map<string, typeof allTasks>();
    for (const t of allTasks) {
      if (!t.dueDate) continue;
      const key = String(t.dueDate).split("T")[0];
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    return map;
  }, [allTasks]);

  const selectedRes = selectedDate ? (resForDate.get(selectedDate) ?? []) : [];
  const selectedTasks = selectedDate ? (tasksForDate.get(selectedDate) ?? []) : [];

  function toggleChecklistItem(task: typeof allTasks[0], idx: number) {
    const checklist = [...((task.checklist as { item: string; done: boolean }[]) ?? [])];
    checklist[idx] = { ...checklist[idx], done: !checklist[idx].done };
    const allDone = checklist.every(c => c.done);
    updateTask.mutate({
      id: task.id,
      checklist,
      status: allDone ? "complete" : task.status === "pending" ? "in_progress" : task.status,
    });
  }

  return (
    <HostLayout title="Stay Calendar">
      <div className="max-w-5xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setViewDate(new Date(year, month - 1, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="font-serif text-xl w-52 text-center">{monthName}</span>
            <Button variant="ghost" size="icon" onClick={() => setViewDate(new Date(year, month + 1, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="text-xs ml-2" onClick={() => setViewDate(new Date(today.getFullYear(), today.getMonth(), 1))}>
              Today
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8"
              onClick={() => syncAll.mutate()}
              disabled={syncAll.isPending}>
              <RefreshCw className={`w-3.5 h-3.5 ${syncAll.isPending ? "animate-spin" : ""}`} />
              Sync
            </Button>
            <Button size="sm" className="gap-1.5 text-xs h-8"
              onClick={() => { setBlockForm({ title: "Blocked", startDate: "", endDate: "", eventType: "block" }); setShowAddBlock(true); }}>
              <Plus className="w-3.5 h-3.5" />
              Block
            </Button>
            <a
              href="/cleaner"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Brush className="w-3.5 h-3.5" />
              Cleaner Portal
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {Object.entries(SOURCE_COLORS).map(([src, cls]) => (
            <div key={src} className="flex items-center gap-1">
              <div className={`w-3 h-2 rounded-sm ${cls}`} />
              <span className="capitalize">{src.replace("_", ".")}</span>
            </div>
          ))}
          <div className="flex items-center gap-1 ml-2">
            <Brush className="w-3 h-3 text-amber-500" />
            <span>Cleaning</span>
          </div>
          <div className="flex items-center gap-1">
            <Wrench className="w-3 h-3 text-purple-500" />
            <span>Maintenance</span>
          </div>
        </div>

        <div className="flex gap-4">
          {/* Calendar grid */}
          <div className="flex-1 min-w-0">
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {DAYS.map(d => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden border border-border">
              {days.map((dateStr, i) => {
                if (!dateStr) {
                  return <div key={i} className="bg-secondary/30 min-h-[72px]" />;
                }
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === selectedDate;
                const dayRes = resForDate.get(dateStr) ?? [];
                const dayTasks = tasksForDate.get(dateStr) ?? [];
                const dayNum = parseInt(dateStr.split("-")[2]);

                // Count arrivals and departures from the same de-duplicated list used for bars.
                const arrivals = dayRes.filter(r => toDateStr(r.arrivalDate) === dateStr);
                const departures = dayRes.filter(r => toDateStr(r.departureDate) === dateStr);

                return (
                  <div
                    key={dateStr}
                    onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                    className={`bg-background min-h-[72px] p-1 cursor-pointer transition-colors hover:bg-accent/30 ${
                      isSelected ? "ring-2 ring-inset ring-primary" : ""
                    }`}
                  >
                    {/* Day number */}
                    <div className={`text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full mb-0.5 ${
                      isToday ? "bg-primary text-primary-foreground" : "text-foreground"
                    }`}>
                      {dayNum}
                    </div>

                    {/* Reservation bars */}
                    <div className="space-y-0.5">
                      {dayRes.slice(0, 2).map((r) => {
                        const arr = String(r.arrivalDate).split("T")[0];
                        const dep = String(r.departureDate).split("T")[0];
                        const isArr = arr === dateStr;
                        const isDep = dep === dateStr;
                        const color = SOURCE_COLORS[r.source] ?? SOURCE_COLORS.other;
                        return (
                          <div
                            key={r.id}
                            className={`h-1.5 rounded-full ${color} opacity-80 ${isArr ? "ml-2" : ""} ${isDep ? "mr-2" : ""}`}
                            title={`${r.guestName ?? "Guest"} · ${r.source}`}
                          />
                        );
                      })}
                      {dayRes.length > 2 && (
                        <div className="text-[9px] text-muted-foreground">+{dayRes.length - 2}</div>
                      )}
                    </div>

                    {/* Task icons */}
                    {dayTasks.length > 0 && (
                      <div className="flex gap-0.5 mt-0.5 flex-wrap">
                        {dayTasks.slice(0, 3).map(t => (
                          <div key={t.id} title={t.title ?? t.type}>
                            {t.type === "turnover" ? (
                              <Brush className={`w-2.5 h-2.5 ${t.status === "complete" ? "text-emerald-500" : "text-amber-500"}`} />
                            ) : (
                              <Wrench className={`w-2.5 h-2.5 ${t.status === "complete" ? "text-emerald-500" : "text-purple-500"}`} />
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Arrival/departure indicators */}
                    {(arrivals.length > 0 || departures.length > 0) && (
                      <div className="flex gap-0.5 mt-0.5">
                        {arrivals.length > 0 && <div className="text-[8px] text-emerald-600 font-medium">IN</div>}
                        {departures.length > 0 && <div className="text-[8px] text-rose-600 font-medium">OUT</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Day detail panel */}
          {selectedDate && (
            <div className="w-72 shrink-0 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">
                  {new Date(selectedDate + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedDate(null)}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>

              {selectedRes.length === 0 && selectedTasks.length === 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">No reservations or tasks on this day.</p>
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7"
                    onClick={() => { setBlockForm({ title: "Blocked", startDate: selectedDate!, endDate: selectedDate!, eventType: "block" }); setShowAddBlock(true); }}>
                    <Plus className="w-3 h-3" />Block this date
                  </Button>
                </div>
              )}

              {/* Manual blocks that can be deleted */}
              {calendarEvents.filter(ev => ev.source === 'manual' && selectedDate && toDateStr(ev.startDate) <= selectedDate && toDateStr(ev.endDate) >= selectedDate).map(ev => (
                <div key={ev.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div>
                    <p className="text-sm font-medium">{ev.title ?? "Blocked"}</p>
                    <p className="text-xs text-muted-foreground">{toDateStr(ev.startDate)} → {toDateStr(ev.endDate)}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => deleteEvent.mutate({ id: ev.id })}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}

              {/* Reservations */}
              {selectedRes.filter((r, i, arr) => arr.findIndex(x => x.id === r.id) === i).map(r => {
                const arr = toDateStr(r.arrivalDate);
                const dep = toDateStr(r.departureDate);
                const nights = Math.round((new Date(dep + "T12:00:00Z").getTime() - new Date(arr + "T12:00:00Z").getTime()) / 86400000);
                const bgCls = SOURCE_BG[r.source] ?? SOURCE_BG.other;
                const textCls = SOURCE_TEXT[r.source] ?? SOURCE_TEXT.other;
                return (
                  <div key={r.id} className={`rounded-xl border p-3 space-y-2 ${bgCls}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{r.guestName ?? "Guest"}</p>
                        <p className={`text-xs font-medium capitalize ${textCls}`}>{r.source.replace("_", ".")}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] capitalize shrink-0">{r.status?.replace("_", " ")}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <div>Check-in: <span className="text-foreground">{arr}</span></div>
                      <div>Check-out: <span className="text-foreground">{dep}</span></div>
                      <div>{nights} night{nights !== 1 ? "s" : ""} · <Users className="w-3 h-3 inline" /> {r.guestCount ?? 1}</div>
                    </div>
                    {/* Status actions */}
                    <div className="flex gap-1.5 flex-wrap">
                      {r.status === "confirmed" && (
                        <Button size="sm" variant="outline" className="h-6 text-[10px]"
                          onClick={() => updateRes.mutate({ id: r.id, status: "checked_in" })}>
                          Check In
                        </Button>
                      )}
                      {r.status === "checked_in" && (
                        <Button size="sm" variant="outline" className="h-6 text-[10px]"
                          onClick={() => updateRes.mutate({ id: r.id, status: "checked_out" })}>
                          Check Out
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Tasks */}
              {selectedTasks.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tasks</p>
                  {selectedTasks.map(task => {
                    const checklist = (task.checklist as { item: string; done: boolean }[] | null) ?? [];
                    const done = checklist.filter(c => c.done).length;
                    return (
                      <div key={task.id} className="rounded-xl border border-border bg-background p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            {task.type === "turnover" ? (
                              <Brush className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            ) : (
                              <Wrench className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                            )}
                            <span className="text-sm font-medium">{task.title ?? task.type}</span>
                          </div>
                          <Badge variant="outline" className="text-[10px] capitalize shrink-0">
                            {task.status?.replace("_", " ")}
                          </Badge>
                        </div>
                        {checklist.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[10px] text-muted-foreground">{done}/{checklist.length} items</p>
                            {checklist.slice(0, 5).map((item, idx) => (
                              <button
                                key={idx}
                                onClick={() => toggleChecklistItem(task, idx)}
                                className="flex items-center gap-1.5 text-xs w-full text-left hover:text-foreground transition-colors"
                              >
                                {item.done
                                  ? <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                                  : <Circle className="w-3 h-3 text-muted-foreground shrink-0" />}
                                <span className={item.done ? "line-through text-muted-foreground" : ""}>{item.item}</span>
                              </button>
                            ))}
                            {checklist.length > 5 && (
                              <p className="text-[10px] text-muted-foreground">+{checklist.length - 5} more</p>
                            )}
                          </div>
                        )}
                        <div className="flex gap-1.5">
                          {task.status === "pending" && (
                            <Button size="sm" variant="outline" className="h-6 text-[10px]"
                              onClick={() => updateTask.mutate({ id: task.id, status: "in_progress" })}>
                              Start
                            </Button>
                          )}
                          {task.status !== "complete" && task.status !== "skipped" && (
                            <Button size="sm" variant="outline" className="h-6 text-[10px] text-emerald-700 border-emerald-200"
                              onClick={() => updateTask.mutate({ id: task.id, status: "complete" })}>
                              Complete
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Block Dialog */}
      <Dialog open={showAddBlock} onOpenChange={setShowAddBlock}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Block Dates</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Title</label>
              <Input value={blockForm.title} onChange={e => setBlockForm(f => ({ ...f, title: e.target.value }))} placeholder="Blocked" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Start Date</label>
                <Input type="date" value={blockForm.startDate} onChange={e => setBlockForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">End Date</label>
                <Input type="date" value={blockForm.endDate} onChange={e => setBlockForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Type</label>
              <Select value={blockForm.eventType} onValueChange={v => setBlockForm(f => ({ ...f, eventType: v as "block" | "maintenance" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="block">Manual Block</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddBlock(false)}>Cancel</Button>
            <Button
              disabled={!blockForm.startDate || !blockForm.endDate || addBlock.isPending}
              onClick={() => addBlock.mutate(blockForm)}>
              {addBlock.isPending ? "Adding..." : "Add Block"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HostLayout>
  );
}
