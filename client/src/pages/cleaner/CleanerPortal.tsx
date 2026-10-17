import { useEffect, useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Sparkles, CheckCircle2, Circle, ChevronLeft, ChevronRight,
  LogOut, Calendar, Clock, Users, Brush, AlertCircle, Flag, Home
} from "lucide-react";

function getSession() {
  try {
    const raw = sessionStorage.getItem("cleaner_session");
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (Date.now() > s.expiresAt) { sessionStorage.removeItem("cleaner_session"); return null; }
    return s;
  } catch { return null; }
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric"
  });
}

export default function CleanerPortal() {
  const session = getSession();

  useEffect(() => {
    if (!session) window.location.href = "/cleaner";
  }, []);

  const { data: property } = trpc.property.get.useQuery();
  const { data: checkouts = [], isLoading: checkoutsLoading } = trpc.reservations.upcomingCheckouts.useQuery();
  const { data: operationalCalendar = [] } = trpc.cleans.operationalCalendar.useQuery();
  const { data: template, isLoading: templateLoading } = trpc.checklistTemplates.turnoverTemplate.useQuery();
  const { data: cleanersList = [] } = trpc.team.cleaners.useQuery();

  // Helper: safely convert Date object or string to YYYY-MM-DD
  function toDateStr(val: unknown): string {
    if (!val) return '';
    if (val instanceof Date) return val.toISOString().split('T')[0];
    const s = String(val);
    if (s.includes('T')) return s.split('T')[0];
    if (s.includes(' ') && s.length > 10) { const d = new Date(s); if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]; }
    return s.slice(0, 10);
  }

  // Per-checkout checklist state (stored in sessionStorage so it persists on refresh)
  const [checklistState, setChecklistState] = useState<Record<string, boolean[]>>(() => {
    try {
      return JSON.parse(sessionStorage.getItem("cleaner_checklist") ?? "{}");
    } catch { return {}; }
  });
  const [acceptedJobs, setAcceptedJobs] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(sessionStorage.getItem("cleaner_accepted") ?? "[]"));
    } catch { return new Set(); }
  });
  const [completedJobs, setCompletedJobs] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(sessionStorage.getItem("cleaner_completed") ?? "[]"));
    } catch { return new Set(); }
  });

  const [selectedCheckout, setSelectedCheckout] = useState<string | null>(null);
  const [selectedCleaner, setSelectedCleaner] = useState<string>(() => sessionStorage.getItem("cleaner_name") ?? "");
  const [showNamePicker, setShowNamePicker] = useState(false);
  const [pendingAcceptDate, setPendingAcceptDate] = useState<string | null>(null);
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [issueForm, setIssueForm] = useState({ description: "", severity: "minor" as "minor" | "attention" | "urgent", location: "" });
  const reportIssue = trpc.issues.report.useMutation({
    onSuccess: () => {
      toast.success("Issue reported to host!");
      setShowIssueForm(false);
      setIssueForm({ description: "", severity: "minor", location: "" });
    },
    onError: () => toast.error("Failed to report issue. Try again."),
  });
  const recordCompletion = trpc.cleans.recordCompletion.useMutation();

  // Calendar state
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = viewDate.toLocaleString("default", { month: "long", year: "numeric" });

  const operationalDays = useMemo(() => {
    const byDate = new Map<string, Array<(typeof operationalCalendar)[number]>>();
    for (const entry of operationalCalendar) {
      const start = new Date(`${entry.startDate}T12:00:00Z`);
      const end = new Date(`${entry.endDate}T12:00:00Z`);
      // Bookings and blocks use an exclusive end date; cleaning is a one-day work item.
      const finalDay = entry.category === "cleaning"
        ? end
        : new Date(end.getTime() - 86400000);
      for (let cursor = new Date(start); cursor <= finalDay; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
        const date = cursor.toISOString().split("T")[0];
        const items = byDate.get(date) ?? [];
        items.push(entry);
        byDate.set(date, items);
      }
    }
    return byDate;
  }, [operationalCalendar]);

  function saveState(key: string, value: unknown) {
    sessionStorage.setItem(key, JSON.stringify(value));
  }

  function acceptJob(checkoutDate: string) {
    // If no name selected yet, show name picker first
    if (!selectedCleaner) {
      setPendingAcceptDate(checkoutDate);
      setShowNamePicker(true);
      return;
    }
    doAcceptJob(checkoutDate);
  }

  function doAcceptJob(checkoutDate: string) {
    const next = new Set(acceptedJobs);
    next.add(checkoutDate);
    setAcceptedJobs(next);
    saveState("cleaner_accepted", Array.from(next));
    // Init checklist state
    if (template && !checklistState[checkoutDate]) {
      const initial = template.items.map(() => false);
      const next2 = { ...checklistState, [checkoutDate]: initial };
      setChecklistState(next2);
      saveState("cleaner_checklist", next2);
    }
    setSelectedCheckout(checkoutDate);
    toast.success(`Cleaning job accepted by ${selectedCleaner}!`);
  }

  function toggleItem(checkoutDate: string, idx: number) {
    const current = checklistState[checkoutDate] ?? (template?.items.map(() => false) ?? []);
    const updated = [...current];
    updated[idx] = !updated[idx];
    const next = { ...checklistState, [checkoutDate]: updated };
    setChecklistState(next);
    saveState("cleaner_checklist", next);
  }

  function markComplete(checkoutDate: string) {
    const next = new Set(completedJobs);
    next.add(checkoutDate);
    setCompletedJobs(next);
    saveState("cleaner_completed", Array.from(next));
    setSelectedCheckout(null);
    // Save completion to DB
    recordCompletion.mutate({
      checkoutDate,
      jobType: 'cleaning',
      completedBy: selectedCleaner || undefined,
      checklistProgress: checklistState[checkoutDate] ?? [],
    });
    toast.success("Cleaning marked complete! Great work 🧹");
  }

  const selectedJob = checkouts.find(c => c.checkoutDate === selectedCheckout);
  const selectedItems = template?.items ?? [];
  const selectedChecked = checklistState[selectedCheckout ?? ""] ?? selectedItems.map(() => false);
  const doneCount = selectedChecked.filter(Boolean).length;
  const allDone = selectedItems.length > 0 && doneCount === selectedItems.length;

  // Next upcoming cleaning
  const nextCleaning = checkouts.find(c => !completedJobs.has(c.checkoutDate));

  if (!session) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Name Picker Modal */}
      {showNamePicker && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-6">
          <div className="bg-background rounded-2xl border border-border p-6 w-full max-w-sm space-y-4">
            <h2 className="font-serif text-xl">Who are you?</h2>
            <p className="text-sm text-muted-foreground">Select your name to accept this cleaning job.</p>
            <div className="space-y-2">
              {cleanersList.map(c => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedCleaner(c.name);
                    sessionStorage.setItem("cleaner_name", c.name);
                    setShowNamePicker(false);
                    if (pendingAcceptDate) {
                      setPendingAcceptDate(null);
                      doAcceptJob(pendingAcceptDate);
                    }
                  }}
                  className="w-full text-left px-4 py-3 rounded-xl border border-border hover:bg-accent transition-colors text-sm font-medium"
                >
                  {c.name}
                </button>
              ))}
            </div>
            <button onClick={() => { setShowNamePicker(false); setPendingAcceptDate(null); }}
              className="text-xs text-muted-foreground hover:text-foreground w-full text-center">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-sm border-b border-border/50">
        <div className="max-w-2xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Home className="w-6 h-6 text-primary" />
            <div>
              <span className="font-serif text-lg">{property?.name ?? "Vacation Rental Manager"}</span>
              {selectedCleaner && <p className="text-xs text-muted-foreground">{selectedCleaner}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {selectedCleaner && (
              <button onClick={() => { setSelectedCleaner(""); sessionStorage.removeItem("cleaner_name"); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Switch
              </button>
            )}
            <button
              onClick={() => { sessionStorage.removeItem("cleaner_session"); window.location.href = "/cleaner"; }}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Exit
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-8">

        {/* Active job view */}
        {selectedCheckout && selectedJob ? (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <button onClick={() => setSelectedCheckout(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="font-serif text-2xl">Turnover Clean</h1>
                <p className="text-sm text-muted-foreground">
                  {formatDate(selectedJob.checkoutDate)}
                  {selectedCleaner && <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{selectedCleaner}</span>}
                </p>
              </div>
            </div>

            {/* Job info */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span>Checkout: <strong>{formatDate(selectedJob.checkoutDate)}</strong></span>
              </div>
              {selectedJob.checkinDate && selectedJob.checkinDate !== selectedJob.checkoutDate && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>Next check-in: {formatDate(selectedJob.checkinDate)}</span>
                </div>
              )}
              {selectedJob.guestCount && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="w-4 h-4" />
                  <span>{selectedJob.guestCount} guest{selectedJob.guestCount !== 1 ? "s" : ""}</span>
                </div>
              )}
            </div>

            {/* Progress */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{template?.name ?? "Turnover Checklist"}</span>
                <span className="text-muted-foreground">{doneCount} / {selectedItems.length}</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: selectedItems.length > 0 ? `${(doneCount / selectedItems.length) * 100}%` : "0%" }}
                />
              </div>
            </div>

            {/* Checklist by section */}
            {templateLoading ? (
              <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 rounded-xl" />)}</div>
            ) : selectedItems.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No checklist template found. Ask the host to set up a "Full Turnover Clean" template.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {(() => {
                  // Group by section
                  const sections: Record<string, { item: string; required: boolean; idx: number }[]> = {};
                  selectedItems.forEach((it, idx) => {
                    const sec = it.section || "General";
                    if (!sections[sec]) sections[sec] = [];
                    sections[sec].push({ ...it, idx });
                  });
                  return Object.entries(sections).map(([section, items]) => {
                    const allSectionDone = items.every(({ idx }) => selectedChecked[idx]);
                    return (
                    <div key={section} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{section}</p>
                        <button
                          onClick={() => {
                            const current = checklistState[selectedCheckout] ?? selectedItems.map(() => false);
                            const updated = [...current];
                            items.forEach(({ idx }) => { updated[idx] = !allSectionDone; });
                            const next = { ...checklistState, [selectedCheckout]: updated };
                            setChecklistState(next);
                            saveState("cleaner_checklist", next);
                          }}
                          className={`text-[10px] font-medium px-2.5 py-1 rounded-full transition-colors ${
                            allSectionDone
                              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                              : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
                          }`}
                        >
                          {allSectionDone ? "✓ All done" : "Check all"}
                        </button>
                      </div>
                      <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
                        {items.map(({ item, required, idx }) => (
                          <div key={idx} className="flex items-center group">
                            <button
                              onClick={() => toggleItem(selectedCheckout, idx)}
                              className="flex items-center gap-3 flex-1 text-left px-4 py-3 hover:bg-accent/30 transition-colors"
                            >
                              {selectedChecked[idx]
                                ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                                : <Circle className="w-5 h-5 text-muted-foreground shrink-0" />
                              }
                              <span className={`text-sm flex-1 ${selectedChecked[idx] ? "line-through text-muted-foreground" : ""}`}>
                                {item}
                                {required && <span className="text-rose-500 ml-1">*</span>}
                              </span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowIssueForm(true);
                                setIssueForm(f => ({ ...f, description: item, location: section }));
                              }}
                              className="px-3 py-3 opacity-30 sm:opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-amber-600 active:text-amber-600"
                              title="Report issue with this item"
                            >
                              <Flag className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                    );
                  });
                })()}
              </div>
            )}

            {/* Complete button */}
            {selectedItems.length > 0 && (
              <Button
                className={`w-full h-12 gap-2 text-base ${allDone ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}`}
                variant={allDone ? "default" : "outline"}
                onClick={() => markComplete(selectedCheckout)}
              >
                <Sparkles className="w-4 h-4" />
                {allDone ? "Mark Cleaning Complete" : `Complete (${doneCount}/${selectedItems.length} done)`}
              </Button>
            )}

            {/* Report Issue button */}
            <button
              onClick={() => setShowIssueForm(true)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto"
            >
              <Flag className="w-3.5 h-3.5" />
              Report a property issue
            </button>
          </div>

        ) : (
          /* Main view */
          <>
            {/* Mini calendar — no label, shown first */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <Button variant="ghost" size="icon" className="h-7 w-7"
                  onClick={() => setViewDate(new Date(year, month - 1, 1))}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm font-semibold">{monthName}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7"
                  onClick={() => setViewDate(new Date(year, month + 1, 1))}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              <div className="grid grid-cols-7 mb-1">
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
                  <div key={d} className="text-center text-xs text-muted-foreground py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-y-0.5">
                {Array.from({ length: firstDay }, (_, i) => <div key={`e-${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const d = i + 1;
                  const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                  const isToday = dateStr === todayStr;
                  const dayItems = operationalDays.get(dateStr) ?? [];
                  const categories = new Set(dayItems.map(item => item.category));
                  const isCleaning = categories.has("cleaning");
                  const isCompleted = completedJobs.has(dateStr);
                  const isAvailable = dayItems.length === 0;
                  const dayTitle = isAvailable
                    ? "Vacant / available"
                    : Array.from(new Set(dayItems.map(item => item.label))).join(" · ");
                  const dayStyle = isCleaning
                    ? (isCompleted ? "bg-emerald-50 text-emerald-700" : "bg-amber-100 text-amber-800 font-semibold")
                    : categories.has("maintenance")
                      ? "bg-red-50 text-red-700"
                      : categories.has("break") || categories.has("blocked")
                        ? "bg-violet-50 text-violet-800"
                        : categories.has("occupied")
                          ? "bg-slate-100 text-slate-700"
                          : "bg-emerald-50/70 text-emerald-700";
                  return (
                    <div key={d} className={`relative h-9 flex items-center justify-center text-sm rounded-md ${dayStyle}
                      ${isToday ? "ring-1 ring-primary font-semibold" : ""}
                    `} title={dayTitle}>
                      {d}
                      {isCleaning && !isCompleted && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500" />}
                      {isCleaning && isCompleted && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><div className="w-3 h-3 rounded bg-emerald-50 border border-emerald-200" />Vacant / available</div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><div className="w-3 h-3 rounded bg-slate-100 border border-slate-200" />Occupied</div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><div className="w-3 h-3 rounded bg-amber-100 border border-amber-200" />Cleaning</div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><div className="w-3 h-3 rounded bg-violet-50 border border-violet-200" />Break / blocked</div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><div className="w-3 h-3 rounded bg-red-50 border border-red-200" />Maintenance</div>
              </div>
            </div>

            {/* Title + subtitle */}
            <div>
              <h1 className="font-serif text-2xl mb-1">Cleaning Schedule</h1>
              <p className="text-muted-foreground text-sm">
                {nextCleaning
                  ? (() => {
                      const d = daysUntil(nextCleaning.checkoutDate);
                      if (d === 0) return "Cleaning needed today!";
                      if (d === 1) return "Cleaning needed tomorrow.";
                      return `Next cleaning in ${d} days.`;
                    })()
                  : "No upcoming cleanings scheduled."}
              </p>
            </div>

            {/* Cleaning jobs for current & upcoming — filtered to today onwards */}
            <div className="space-y-3">

              {checkoutsLoading ? (
                <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
              ) : checkouts.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
                  <Brush className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No upcoming checkouts scheduled.</p>
                </div>
              ) : (
                checkouts.filter(c => c.checkoutDate >= todayStr).map(checkout => {
                  const d = daysUntil(checkout.checkoutDate);
                  const isAccepted = acceptedJobs.has(checkout.checkoutDate);
                  const isCompleted = completedJobs.has(checkout.checkoutDate);
                  const checked = checklistState[checkout.checkoutDate] ?? [];
                  const done = checked.filter(Boolean).length;
                  const total = template?.items.length ?? 0;

                  return (
                    <div key={checkout.id}
                      className={`rounded-2xl border bg-card p-4 space-y-3 ${
                        isCompleted ? "opacity-50 border-border" :
                        d === 0 ? "border-amber-300 bg-amber-50/50" :
                        d === 1 ? "border-blue-200 bg-blue-50/30" :
                        "border-border"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{formatDate(checkout.checkoutDate)}</span>
                            {d === 0 && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Today</span>}
                            {d === 1 && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Tomorrow</span>}
                            {isCompleted && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">✓ Done</span>}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Turnover clean
                            {isAccepted && selectedCleaner && <span className="ml-1">· {selectedCleaner}</span>}
                          </p>
                        </div>
                        {!isCompleted && (
                          isAccepted ? (
                            <Button size="sm" className="h-8 text-xs gap-1.5 shrink-0"
                              onClick={() => setSelectedCheckout(checkout.checkoutDate)}>
                              <Brush className="w-3.5 h-3.5" />
                              {done > 0 ? `Continue (${done}/${total})` : "Start Cleaning"}
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" className="h-8 text-xs shrink-0"
                              onClick={() => acceptJob(checkout.checkoutDate)}>
                              Accept Job
                            </Button>
                          )
                        )}
                      </div>

                      {isAccepted && !isCompleted && total > 0 && (
                        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all"
                            style={{ width: `${(done / total) * 100}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

          </>
        )}
      </main>

      {/* Report Issue Modal */}
      {showIssueForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-6">
          <div className="bg-background rounded-2xl border border-border p-6 w-full max-w-sm space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl flex items-center gap-2">
                <Flag className="w-4 h-4 text-amber-600" />
                Report Issue
              </h2>
              <button onClick={() => setShowIssueForm(false)} className="text-muted-foreground hover:text-foreground">
                <span className="text-lg">×</span>
              </button>
            </div>
            <textarea
              value={issueForm.description}
              onChange={e => setIssueForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Describe the issue (e.g. broken towel rail in bathroom)"
              className="w-full text-sm border border-border rounded-xl p-3 resize-none bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              rows={3}
              autoFocus
            />
            <input
              value={issueForm.location}
              onChange={e => setIssueForm(f => ({ ...f, location: e.target.value }))}
              placeholder="Location (optional — e.g. bathroom, kitchen)"
              className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="flex gap-2">
              {(["minor", "attention", "urgent"] as const).map(s => (
                <button key={s} onClick={() => setIssueForm(f => ({ ...f, severity: s }))}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors capitalize ${
                    issueForm.severity === s
                      ? s === "urgent" ? "bg-red-100 border-red-300 text-red-700"
                      : s === "attention" ? "bg-amber-100 border-amber-300 text-amber-700"
                      : "bg-blue-50 border-blue-200 text-blue-700"
                      : "bg-background border-border text-muted-foreground"
                  }`}>
                  {s}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowIssueForm(false)}>Cancel</Button>
              <Button
                className="flex-1"
                disabled={issueForm.description.trim().length < 3 || reportIssue.isPending}
                onClick={() => reportIssue.mutate({
                  description: issueForm.description.trim(),
                  severity: issueForm.severity,
                  location: issueForm.location.trim() || undefined,
                  reportedBy: selectedCleaner || "Cleaner",
                })}
              >
                {reportIssue.isPending ? "Sending..." : "Send to Host"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
