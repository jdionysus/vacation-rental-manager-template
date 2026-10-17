import { useEffect, useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Sparkles, CheckCircle2, Circle, ChevronLeft, ChevronRight,
  LogOut, Calendar, Clock, Users, ClipboardCheck, AlertCircle, Flag, Home
} from "lucide-react";

function getSession() {
  try {
    const raw = sessionStorage.getItem("inspector_session");
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (Date.now() > s.expiresAt) { sessionStorage.removeItem("inspector_session"); return null; }
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

export default function InspectorPortal() {
  const session = getSession();

  useEffect(() => {
    if (!session) window.location.href = "/inspector";
  }, []);

  const { data: property } = trpc.property.get.useQuery();
  const { data: checkouts = [], isLoading: checkoutsLoading } = trpc.reservations.upcomingCheckouts.useQuery();
  const { data: calendarEvents = [] } = trpc.calendar.events.useQuery();
  const { data: template, isLoading: templateLoading } = trpc.checklistTemplates.inspectionTemplate.useQuery();
  const { data: cleanersList = [] } = trpc.team.cleaners.useQuery();

  function toDateStr(val: unknown): string {
    if (!val) return '';
    if (val instanceof Date) return val.toISOString().split('T')[0];
    const s = String(val);
    if (s.includes('T')) return s.split('T')[0];
    if (s.includes(' ') && s.length > 10) { const d = new Date(s); if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]; }
    return s.slice(0, 10);
  }

  const [checklistState, setChecklistState] = useState<Record<string, boolean[]>>(() => {
    try { return JSON.parse(sessionStorage.getItem("inspector_checklist") ?? "{}"); } catch { return {}; }
  });
  const [acceptedJobs, setAcceptedJobs] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem("inspector_accepted") ?? "[]")); } catch { return new Set(); }
  });
  const [completedJobs, setCompletedJobs] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem("inspector_completed") ?? "[]")); } catch { return new Set(); }
  });

  const [selectedCheckout, setSelectedCheckout] = useState<string | null>(null);
  const [selectedInspector, setSelectedInspector] = useState<string>(() => sessionStorage.getItem("inspector_name") ?? "");
  const [showNamePicker, setShowNamePicker] = useState(false);
  const [pendingAcceptDate, setPendingAcceptDate] = useState<string | null>(null);
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [issueForm, setIssueForm] = useState({ description: "", severity: "minor" as "minor" | "attention" | "urgent", location: "" });
  const reportIssue = trpc.issues.report.useMutation({
    onSuccess: () => { toast.success("Issue reported to host!"); setShowIssueForm(false); setIssueForm({ description: "", severity: "minor", location: "" }); },
    onError: () => toast.error("Failed to report issue. Try again."),
  });
  const recordCompletion = trpc.cleans.recordCompletion.useMutation();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = viewDate.toLocaleString("default", { month: "long", year: "numeric" });

  const checkoutDates = useMemo(() => {
    const dates = new Set(checkouts.map(c => c.checkoutDate));
    for (const ev of calendarEvents) {
      if (ev.eventType !== 'booking' && ev.title !== 'Reserved') continue;
      const dep = toDateStr(ev.endDate);
      if (dep >= todayStr) dates.add(dep);
    }
    return dates;
  }, [checkouts, calendarEvents]);

  function saveState(key: string, value: unknown) {
    sessionStorage.setItem(key, JSON.stringify(value));
  }

  function acceptJob(checkoutDate: string) {
    if (!selectedInspector) { setPendingAcceptDate(checkoutDate); setShowNamePicker(true); return; }
    doAcceptJob(checkoutDate);
  }

  function doAcceptJob(checkoutDate: string) {
    const next = new Set(acceptedJobs);
    next.add(checkoutDate);
    setAcceptedJobs(next);
    saveState("inspector_accepted", Array.from(next));
    if (template && !checklistState[checkoutDate]) {
      const initial = template.items.map(() => false);
      const next2 = { ...checklistState, [checkoutDate]: initial };
      setChecklistState(next2);
      saveState("inspector_checklist", next2);
    }
    setSelectedCheckout(checkoutDate);
    toast.success(`Inspection job accepted by ${selectedInspector}!`);
  }

  function toggleItem(checkoutDate: string, idx: number) {
    const current = checklistState[checkoutDate] ?? (template?.items.map(() => false) ?? []);
    const updated = [...current];
    updated[idx] = !updated[idx];
    const next = { ...checklistState, [checkoutDate]: updated };
    setChecklistState(next);
    saveState("inspector_checklist", next);
  }

  function markComplete(checkoutDate: string) {
    const next = new Set(completedJobs);
    next.add(checkoutDate);
    setCompletedJobs(next);
    saveState("inspector_completed", Array.from(next));
    setSelectedCheckout(null);
    recordCompletion.mutate({ checkoutDate, jobType: 'inspection', checklistProgress: checklistState[checkoutDate] ?? [] });
    toast.success("Inspection complete! ✓");
  }

  const selectedJob = checkouts.find(c => c.checkoutDate === selectedCheckout);
  const selectedItems = template?.items ?? [];
  const selectedChecked = checklistState[selectedCheckout ?? ""] ?? selectedItems.map(() => false);
  const doneCount = selectedChecked.filter(Boolean).length;
  const allDone = selectedItems.length > 0 && doneCount === selectedItems.length;
  const nextInspection = checkouts.find(c => !completedJobs.has(c.checkoutDate) && c.checkoutDate >= todayStr);

  if (!session) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Name Picker Modal */}
      {showNamePicker && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-6">
          <div className="bg-background rounded-2xl border border-border p-6 w-full max-w-sm space-y-4">
            <h2 className="font-serif text-xl">Who are you?</h2>
            <p className="text-sm text-muted-foreground">Select your name to accept this inspection job.</p>
            <div className="space-y-2">
              {cleanersList.map(c => (
                <button key={c.id} onClick={() => {
                  setSelectedInspector(c.name);
                  sessionStorage.setItem("inspector_name", c.name);
                  setShowNamePicker(false);
                  if (pendingAcceptDate) { setPendingAcceptDate(null); doAcceptJob(pendingAcceptDate); }
                }} className="w-full text-left px-4 py-3 rounded-xl border border-border hover:bg-accent transition-colors text-sm font-medium">
                  {c.name}
                </button>
              ))}
            </div>
            <button onClick={() => { setShowNamePicker(false); setPendingAcceptDate(null); }}
              className="text-xs text-muted-foreground hover:text-foreground w-full text-center">Cancel</button>
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
              {selectedInspector && <p className="text-xs text-muted-foreground">{selectedInspector}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {selectedInspector && (
              <button onClick={() => { setSelectedInspector(""); sessionStorage.removeItem("inspector_name"); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors">Switch</button>
            )}
            <button onClick={() => { sessionStorage.removeItem("inspector_session"); window.location.href = "/inspector"; }}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors">
              <LogOut className="w-3.5 h-3.5" />Exit
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
                <h1 className="font-serif text-2xl">Turnover Inspection</h1>
                <p className="text-sm text-muted-foreground">
                  {formatDate(selectedJob.checkoutDate)}
                  {selectedInspector && <span className="ml-2 text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full">{selectedInspector}</span>}
                </p>
              </div>
            </div>

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

            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{template?.name ?? "Inspection Checklist"}</span>
                <span className="text-muted-foreground">{doneCount} / {selectedItems.length}</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-sky-500 rounded-full transition-all"
                  style={{ width: selectedItems.length > 0 ? `${(doneCount / selectedItems.length) * 100}%` : "0%" }} />
              </div>
            </div>

            {templateLoading ? (
              <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 rounded-xl" />)}</div>
            ) : selectedItems.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No inspection checklist found. Ask the host to create a "Full Turnover Inspection" template.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {(() => {
                  const sections: Record<string, { item: string; required: boolean; idx: number }[]> = {};
                  (selectedItems as { section: string; item: string; required: boolean }[]).forEach((it, idx) => {
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
                              saveState("inspector_checklist", next);
                            }}
                            className={`text-[10px] font-medium px-2.5 py-1 rounded-full transition-colors ${
                              allSectionDone ? "bg-sky-100 text-sky-700 hover:bg-sky-200" : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
                            }`}
                          >
                            {allSectionDone ? "✓ All done" : "Check all"}
                          </button>
                        </div>
                        <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
                          {items.map(({ item, required, idx }) => (
                            <div key={idx} className="flex items-center group">
                              <button onClick={() => toggleItem(selectedCheckout, idx)}
                                className="flex items-center gap-3 flex-1 text-left px-4 py-3 hover:bg-accent/30 transition-colors">
                                {selectedChecked[idx]
                                  ? <CheckCircle2 className="w-5 h-5 text-sky-500 shrink-0" />
                                  : <Circle className="w-5 h-5 text-muted-foreground shrink-0" />}
                                <span className={`text-sm flex-1 ${selectedChecked[idx] ? "line-through text-muted-foreground" : ""}`}>
                                  {item}{required && <span className="text-rose-500 ml-1">*</span>}
                                </span>
                              </button>
                              <button
                                                              onClick={(e) => {
                                e.stopPropagation();
                                setShowIssueForm(true);
                                setIssueForm(f => ({ ...f, description: item, location: section }));
                              }}
                              className="px-3 py-3 opacity-30 sm:opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-sky-600 active:text-sky-600"
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

            {selectedItems.length > 0 && (
              <Button
                className={`w-full h-12 gap-2 text-base ${allDone ? "bg-sky-600 hover:bg-sky-700 text-white" : ""}`}
                variant={allDone ? "default" : "outline"}
                onClick={() => markComplete(selectedCheckout)}
              >
                <Sparkles className="w-4 h-4" />
                {allDone ? "Mark Inspection Complete" : `Complete (${doneCount}/${selectedItems.length} done)`}
              </Button>
            )}

            <button onClick={() => setShowIssueForm(true)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto">
              <Flag className="w-3.5 h-3.5" />Report a property issue
            </button>
          </div>

        ) : (
          <>
            {/* Mini calendar — no label, shown first */}
            <div className="rounded-2xl border border-border bg-card p-4">
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
                  <div key={d} className="text-center text-xs text-muted-foreground py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-y-0.5">
                {Array.from({ length: firstDay }, (_, i) => <div key={`e-${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const d = i + 1;
                  const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                  const isToday = dateStr === todayStr;
                  const isCheckout = checkoutDates.has(dateStr);
                  const isCompleted = completedJobs.has(dateStr);
                  return (
                    <div key={d} className={`relative h-9 flex items-center justify-center text-sm rounded-md
                      ${isToday ? "ring-1 ring-primary font-semibold" : ""}
                      ${isCheckout && !isCompleted ? "bg-sky-100 text-sky-800 font-semibold" : ""}
                      ${isCheckout && isCompleted ? "bg-emerald-50 text-emerald-700" : ""}
                    `} title={isCheckout ? (isCompleted ? "Inspected ✓" : "Inspection needed") : ""}>
                      {d}
                      {isCheckout && !isCompleted && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-sky-500" />}
                      {isCheckout && isCompleted && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-3 h-3 rounded bg-sky-100 border border-sky-200" />Inspection needed
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-3 h-3 rounded bg-emerald-50 border border-emerald-200" />Inspected
                </div>
              </div>
            </div>

            {/* Title + subtitle */}
            <div>
              <h1 className="font-serif text-2xl mb-1">Inspection Schedule</h1>
              <p className="text-muted-foreground text-sm">
                {nextInspection
                  ? (() => {
                      const d = daysUntil(nextInspection.checkoutDate);
                      if (d === 0) return "Inspection needed today!";
                      if (d === 1) return "Inspection needed tomorrow.";
                      return `Next inspection in ${d} days.`;
                    })()
                  : "No upcoming inspections scheduled."}
              </p>
            </div>

            {/* Upcoming inspections — today onwards only */}
            <div className="space-y-3">
              {checkoutsLoading ? (
                <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
              ) : checkouts.filter(c => c.checkoutDate >= todayStr).length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
                  <ClipboardCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
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
                        d === 0 ? "border-sky-300 bg-sky-50/50" :
                        d === 1 ? "border-blue-200 bg-blue-50/30" :
                        "border-border"
                      }`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{formatDate(checkout.checkoutDate)}</span>
                            {d === 0 && <span className="text-[10px] bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-medium">Today</span>}
                            {d === 1 && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Tomorrow</span>}
                            {isCompleted && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">✓ Done</span>}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Turnover inspection · {checkout.source?.replace("_", ".")} · {checkout.guestCount ?? 1} guest{(checkout.guestCount ?? 1) !== 1 ? "s" : ""}
                            {isAccepted && selectedInspector && <span className="ml-1">· {selectedInspector}</span>}
                          </p>
                        </div>
                        {!isCompleted && (
                          isAccepted ? (
                            <Button size="sm" className="h-8 text-xs gap-1.5 shrink-0 bg-sky-600 hover:bg-sky-700"
                              onClick={() => setSelectedCheckout(checkout.checkoutDate)}>
                              <ClipboardCheck className="w-3.5 h-3.5" />
                              {done > 0 ? `Continue (${done}/${total})` : "Start Inspection"}
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" className="h-8 text-xs shrink-0"
                              onClick={() => acceptJob(checkout.checkoutDate)}>Accept Job</Button>
                          )
                        )}
                      </div>
                      {isAccepted && !isCompleted && total > 0 && (
                        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-sky-500 rounded-full transition-all" style={{ width: `${(done / total) * 100}%` }} />
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
                <Flag className="w-4 h-4 text-sky-600" />
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
                  reportedBy: selectedInspector || "Inspector",
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
