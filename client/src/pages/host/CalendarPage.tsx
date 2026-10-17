import { useState } from "react";
import HostLayout from "@/components/HostLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, Plus, Trash2, RefreshCw, AlertTriangle
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CalendarEvent } from "../../../../drizzle/schema";

const SOURCE_STYLES: Record<string, string> = {
  airbnb: "bg-rose-100 text-rose-700 border-rose-200",
  vrbo: "bg-blue-100 text-blue-700 border-blue-200",
  booking_com: "bg-indigo-100 text-indigo-700 border-indigo-200",
  direct: "bg-emerald-100 text-emerald-700 border-emerald-200",
  manual: "bg-slate-100 text-slate-600 border-slate-200",
  other: "bg-slate-100 text-slate-600 border-slate-200",
};

function toDateStr(val: unknown): string {
  if (!val) return '';
  if (val instanceof Date) return val.toISOString().split('T')[0];
  const s = String(val);
  if (s.includes('T')) return s.split('T')[0];
  if (s.includes(' ') && s.length > 10) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  return s.slice(0, 10);
}

function getEventsForDate(date: Date, events: CalendarEvent[]): CalendarEvent[] {
  const d = date.toISOString().split("T")[0];
  return events.filter((ev) => {
    const start = toDateStr(ev.startDate);
    const end = toDateStr(ev.endDate);
    return d >= start && d <= end;
  });
}

export default function CalendarPage() {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [showAddBlock, setShowAddBlock] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [blockForm, setBlockForm] = useState({ title: "Blocked", startDate: "", endDate: "", eventType: "block" as "block" | "maintenance" });

  const { data: events = [], refetch } = trpc.calendar.events.useQuery();
  const addBlock = trpc.calendar.addBlock.useMutation({ onSuccess: () => { refetch(); setShowAddBlock(false); toast.success("Block added"); } });
  const deleteEvent = trpc.calendar.deleteEvent.useMutation({ onSuccess: () => { refetch(); toast.success("Event removed"); } });
  const syncAll = trpc.ical.syncAll.useMutation({ onSuccess: (r) => { refetch(); toast.success(`Synced ${r.total} feeds`); } });

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = viewDate.toLocaleString("default", { month: "long", year: "numeric" });

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  // Detect conflicts — safe date parsing
  const conflicts = new Set<string>();
  const dateMap: Record<string, Set<string>> = {};
  for (const ev of events) {
    try {
      const start = toDateStr(ev.startDate);
      const end = toDateStr(ev.endDate);
      if (!start || !end || start.length < 10 || end.length < 10) continue;
      // Parse as UTC noon to avoid timezone boundary issues
      const startMs = new Date(start + "T12:00:00Z").getTime();
      const endMs = new Date(end + "T12:00:00Z").getTime();
      if (isNaN(startMs) || isNaN(endMs)) continue;
      let cur = new Date(startMs);
      let safety = 0;
      while (cur.getTime() < endMs && safety++ < 365) {
        const key = cur.toISOString().split("T")[0];
        if (!dateMap[key]) dateMap[key] = new Set();
        dateMap[key].add(ev.source);
        if (dateMap[key].size > 1) conflicts.add(key);
        cur = new Date(cur.getTime() + 86400000);
      }
    } catch { /* skip malformed event */ }
  }

  function openAddBlock(date?: Date) {
    const d = date ? date.toISOString().split("T")[0] : "";
    // Default end date = same day (single-day block)
    setBlockForm({ title: "Blocked", startDate: d, endDate: d, eventType: "block" });
    setShowAddBlock(true);
  }

  const selectedEvents = selectedDate ? getEventsForDate(new Date(selectedDate), events) : [];

  return (
    <HostLayout title="Calendar">
      <div className="max-w-5xl space-y-6">
        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setViewDate(new Date(year, month - 1, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="font-serif text-xl w-48 text-center">{monthName}</span>
            <Button variant="ghost" size="icon" onClick={() => setViewDate(new Date(year, month + 1, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => syncAll.mutate()} disabled={syncAll.isPending} className="gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${syncAll.isPending ? "animate-spin" : ""}`} />
              Sync All
            </Button>
            <Button size="sm" onClick={() => openAddBlock()} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Block Dates
            </Button>
          </div>
        </div>

        {/* Conflict alert */}
        {conflicts.size > 0 && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span><strong>{conflicts.size} date{conflicts.size > 1 ? "s" : ""}</strong> have overlapping bookings from multiple sources. Review and resolve conflicts.</span>
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-3">
          {Object.entries(SOURCE_STYLES).map(([source, cls]) => (
            <div key={source} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className={`w-3 h-3 rounded border ${cls}`} />
              <span className="capitalize">{source.replace("_", ".")}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-3 h-3 rounded border bg-amber-100 border-amber-300" />
            <span>Conflict</span>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="card-premium overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-border">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-3 px-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {cells.map((date, i) => {
              if (!date) return <div key={`empty-${i}`} className="border-b border-r border-border/40 min-h-[80px]" />;
              const dateStr = date.toISOString().split("T")[0];
              const dayEvents = getEventsForDate(date, events);
              const isToday = dateStr === today.toISOString().split("T")[0];
              const hasConflict = conflicts.has(dateStr);
              const isPast = date < new Date(today.getFullYear(), today.getMonth(), today.getDate());

              return (
                <div
                  key={dateStr}
                  className={`
                    border-b border-r border-border/40 min-h-[80px] p-1.5 cursor-pointer transition-colors
                    ${isToday ? "bg-primary/5" : ""}
                    ${hasConflict ? "bg-amber-50" : ""}
                    ${isPast ? "opacity-50" : "hover:bg-secondary/50"}
                  `}
                  onClick={() => setSelectedDate(dateStr)}
                >
                  <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full
                    ${isToday ? "bg-primary text-primary-foreground" : "text-foreground"}
                  `}>
                    {date.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 2).map((ev) => (
                      <div
                        key={ev.id}
                        className={`text-xs px-1.5 py-0.5 rounded truncate border ${SOURCE_STYLES[ev.source] ?? SOURCE_STYLES.other}`}
                        title={ev.guestFirstNames ?? ev.title ?? ev.source}
                      >
                        {ev.guestFirstNames ?? ev.title ?? ev.source}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-xs text-muted-foreground px-1">+{dayEvents.length - 2} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected date detail — always shows when a date is clicked */}
        {selectedDate && (
          <div className="card-premium p-5 space-y-3 animate-fade-up">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-lg">
                {new Date(selectedDate + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              </h3>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs"
                  onClick={() => { setBlockForm({ title: "Blocked", startDate: selectedDate, endDate: selectedDate, eventType: "block" }); setShowAddBlock(true); }}>
                  <Plus className="w-3 h-3" />Block this date
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedDate(null)}>Close</Button>
              </div>
            </div>

            {selectedEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bookings or blocks on this date. Click "Block this date" to add a manual block.</p>
            ) : (
              <div className="space-y-2">
                {selectedEvents.map((ev) => (
                  <div key={ev.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                    <Badge className={`text-xs border ${SOURCE_STYLES[ev.source] ?? SOURCE_STYLES.other} shrink-0`}>
                      {ev.source.replace("_", ".")}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{ev.guestFirstNames ?? ev.title ?? "Blocked"}</p>
                      <p className="text-xs text-muted-foreground">
                        {toDateStr(ev.startDate)} → {toDateStr(ev.endDate)}
                      </p>
                    </div>
                    {ev.source === "manual" && (
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                        onClick={() => deleteEvent.mutate({ id: ev.id })}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Block Dialog */}
      <Dialog open={showAddBlock} onOpenChange={setShowAddBlock}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Block Dates</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Label</label>
              <Input
                value={blockForm.title}
                onChange={(e) => setBlockForm({ ...blockForm, title: e.target.value })}
                placeholder="e.g. Owner stay, Maintenance"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Start Date</label>
                <Input type="date" value={blockForm.startDate} onChange={(e) => setBlockForm({ ...blockForm, startDate: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">End Date</label>
                <Input type="date" value={blockForm.endDate} onChange={(e) => setBlockForm({ ...blockForm, endDate: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Type</label>
              <Select value={blockForm.eventType} onValueChange={(v) => setBlockForm({ ...blockForm, eventType: v as "block" | "maintenance" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="block">Block</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddBlock(false)}>Cancel</Button>
            <Button
              onClick={() => addBlock.mutate(blockForm)}
              disabled={!blockForm.startDate || !blockForm.endDate || addBlock.isPending}
            >
              {addBlock.isPending ? "Adding..." : "Add Block"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HostLayout>
  );
}
