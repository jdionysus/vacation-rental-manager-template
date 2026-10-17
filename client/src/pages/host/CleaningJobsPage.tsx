import { useState, useMemo } from "react";
import HostLayout from "@/components/HostLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus, RefreshCw, Brush, Calendar, ChevronDown, ChevronUp,
  CheckCircle2, Circle, Users, Clock, Trash2, AlertCircle, ExternalLink
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600",
  accepted: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  complete: "bg-emerald-100 text-emerald-700",
  skipped: "bg-gray-100 text-gray-400",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  in_progress: "In Progress",
  complete: "Complete",
  skipped: "Skipped",
};

function toDateStr(val: unknown): string {
  if (!val) return "";
  if (val instanceof Date) return val.toISOString().split("T")[0];
  const s = String(val);
  if (s.includes("T")) return s.split("T")[0];
  if (s.includes(" ") && s.length > 10) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  return s.slice(0, 10);
}

function formatDate(dateStr: string): string {
  if (!dateStr || dateStr.length < 10) return dateStr;
  return new Date(dateStr + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export default function CleaningJobsPage() {
  const { data: jobs = [], refetch, isLoading } = trpc.cleans.list.useQuery();
  const { data: reservations = [] } = trpc.reservations.list.useQuery();
  const { data: teamMembers = [] } = trpc.team.list.useQuery();
  const { data: templates = [] } = trpc.checklistTemplates.list.useQuery();
  const { data: property } = trpc.property.get.useQuery();

  const syncJobs = trpc.cleans.syncFromReservations.useMutation({
    onSuccess: (r) => { refetch(); toast.success(`${r.created} cleaning job${r.created !== 1 ? "s" : ""} synced`); },
    onError: (e) => toast.error(e.message),
  });
  const updateJob = trpc.cleans.update.useMutation({
    onSuccess: () => { refetch(); toast.success("Updated"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteJob = trpc.cleans.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Deleted"); },
    onError: (e) => toast.error(e.message),
  });
  const createJob = trpc.cleans.create.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); toast.success("Cleaning job created"); },
    onError: (e) => toast.error(e.message),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ checkoutDate: "", checkinDate: "", reservationId: "" });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "upcoming" | "past">("upcoming");

  const today = new Date().toISOString().split("T")[0];

  const turnoverTemplates = templates.filter(t => t.taskType === "turnover");

  const filteredJobs = useMemo(() => {
    return jobs
      .map(j => ({ ...j, checkoutDateStr: toDateStr(j.checkoutDate) }))
      .filter(j => {
        if (filter === "upcoming") return j.checkoutDateStr >= today;
        if (filter === "past") return j.checkoutDateStr < today;
        return true;
      })
      .sort((a, b) => {
        if (filter === "past") return b.checkoutDateStr.localeCompare(a.checkoutDateStr);
        return a.checkoutDateStr.localeCompare(b.checkoutDateStr);
      });
  }, [jobs, filter, today]);

  const upcomingCount = jobs.filter(j => toDateStr(j.checkoutDate) >= today && j.status !== "complete").length;

  return (
    <HostLayout title="Cleans">
      <div className="max-w-3xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              {upcomingCount > 0 ? `${upcomingCount} upcoming clean${upcomingCount !== 1 ? "s" : ""} pending` : "All upcoming cleans scheduled"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5"
              onClick={() => syncJobs.mutate()}
              disabled={syncJobs.isPending}>
              <RefreshCw className={`w-3.5 h-3.5 ${syncJobs.isPending ? "animate-spin" : ""}`} />
              Sync from Reservations
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
              <Plus className="w-3.5 h-3.5" />
              Add Clean
            </Button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 bg-secondary/50 rounded-xl p-1 w-fit">
          {(["upcoming", "all", "past"] as const).map(v => (
            <button key={v} onClick={() => setFilter(v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${filter === v ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {v}
            </button>
          ))}
        </div>

        {/* Jobs list */}
        {isLoading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-secondary animate-pulse" />)}</div>
        ) : filteredJobs.length === 0 ? (
          <div className="card-premium p-10 text-center text-muted-foreground space-y-3">
            <Brush className="w-8 h-8 mx-auto opacity-30" />
            <p>No cleaning jobs {filter === "upcoming" ? "upcoming" : filter === "past" ? "in the past" : "yet"}.</p>
            <p className="text-xs">Click "Sync from Reservations" to auto-create jobs from upcoming checkouts.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredJobs.map(job => {
              const d = daysUntil(job.checkoutDateStr);
              const isExpanded = expandedId === job.id;
              const checkinStr = toDateStr(job.checkinDate);
              const assignee = teamMembers.find(m => m.id === job.assignedToId);
              const template = templates.find(t => t.id === job.checklistTemplateId);

              return (
                <div key={job.id} className="card-premium overflow-hidden">
                  <div className="p-4 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                      <Brush className="w-5 h-5 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{formatDate(job.checkoutDateStr)}</span>
                        {d === 0 && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Today</span>}
                        {d === 1 && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Tomorrow</span>}
                        {d < 0 && <span className="text-[10px] text-muted-foreground">{Math.abs(d)}d ago</span>}
                        <Badge className={`text-[10px] px-2 py-0.5 ${STATUS_STYLES[job.status] ?? STATUS_STYLES.pending}`}>
                          {STATUS_LABELS[job.status] ?? job.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        {checkinStr && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Next check-in: {formatDate(checkinStr)}</span>}
                        {assignee && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{assignee.name}</span>}
                        {template && <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3" />{template.name}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => setExpandedId(isExpanded ? null : job.id)}>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => deleteJob.mutate({ id: job.id })}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border px-4 pb-4 pt-3 space-y-3 bg-secondary/20">
                      {/* Status */}
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-muted-foreground w-20">Status</span>
                        <Select value={job.status} onValueChange={v => updateJob.mutate({ id: job.id, status: v as any })}>
                          <SelectTrigger className="h-8 text-xs w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["pending", "accepted", "in_progress", "complete", "skipped"].map(s => (
                              <SelectItem key={s} value={s} className="text-xs capitalize">{STATUS_LABELS[s]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Assign to */}
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-muted-foreground w-20">Assign to</span>
                        <Select
                          value={job.assignedToId?.toString() ?? "none"}
                          onValueChange={v => updateJob.mutate({ id: job.id, assignedToId: v === "none" ? undefined : parseInt(v) })}>
                          <SelectTrigger className="h-8 text-xs w-48">
                            <SelectValue placeholder="Unassigned" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none" className="text-xs">Unassigned</SelectItem>
                            {teamMembers.map(m => (
                              <SelectItem key={m.id} value={m.id.toString()} className="text-xs">{m.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Checklist template */}
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-muted-foreground w-20">Checklist</span>
                        <Select
                          value={job.checklistTemplateId?.toString() ?? "none"}
                          onValueChange={v => updateJob.mutate({ id: job.id, checklistTemplateId: v === "none" ? undefined : parseInt(v) })}>
                          <SelectTrigger className="h-8 text-xs w-48">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none" className="text-xs">None</SelectItem>
                            {turnoverTemplates.map(t => (
                              <SelectItem key={t.id} value={t.id.toString()} className="text-xs">{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Portal links */}
                      <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
                        <a href="/cleaner/portal" target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline" className="text-xs gap-1.5 h-7">
                            <Brush className="w-3 h-3" />
                            Cleaner Portal
                            <ExternalLink className="w-3 h-3" />
                          </Button>
                        </a>
                        <a href="/inspector/portal" target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline" className="text-xs gap-1.5 h-7">
                            <CheckCircle2 className="w-3 h-3" />
                            Inspector Portal
                            <ExternalLink className="w-3 h-3" />
                          </Button>
                        </a>
                      </div>

                      {/* Portal links */}
                      <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
                        <a href="/cleaner/portal" target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline" className="text-xs gap-1.5 h-7">
                            <Brush className="w-3 h-3" />Cleaner Portal<ExternalLink className="w-3 h-3" />
                          </Button>
                        </a>
                        <a href="/inspector/portal" target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline" className="text-xs gap-1.5 h-7">
                            <CheckCircle2 className="w-3 h-3" />Inspector Portal<ExternalLink className="w-3 h-3" />
                          </Button>
                        </a>
                      </div>

                      {/* Mark complete shortcut */}
                      {job.status !== "complete" && (
                        <Button size="sm" variant="outline" className="text-xs gap-1.5 text-emerald-700 border-emerald-200"
                          onClick={() => updateJob.mutate({ id: job.id, status: "complete", completedAt: new Date().toISOString() })}>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Mark Complete
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Clean Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Add Cleaning Job</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Checkout Date *</label>
              <Input type="date" value={addForm.checkoutDate}
                onChange={e => setAddForm(f => ({ ...f, checkoutDate: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Next Check-in Date</label>
              <Input type="date" value={addForm.checkinDate}
                onChange={e => setAddForm(f => ({ ...f, checkinDate: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Link to Reservation (optional)</label>
              <Select value={addForm.reservationId || "none"}
                onValueChange={v => setAddForm(f => ({ ...f, reservationId: v === "none" ? "" : v }))}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">None</SelectItem>
                  {reservations.map(r => (
                    <SelectItem key={r.id} value={r.id.toString()} className="text-xs">
                      {r.guestName ?? "Guest"} · {String(r.departureDate).split("T")[0]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button
              disabled={!addForm.checkoutDate || createJob.isPending}
              onClick={() => createJob.mutate({
                checkoutDate: addForm.checkoutDate,
                checkinDate: addForm.checkinDate || undefined,
                reservationId: addForm.reservationId ? parseInt(addForm.reservationId) : undefined,
              })}>
              {createJob.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HostLayout>
  );
}
