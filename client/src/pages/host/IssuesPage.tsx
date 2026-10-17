import { useState } from "react";
import HostLayout from "@/components/HostLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, Plus, Wrench, Flag, ChevronDown, ChevronUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SEVERITY_STYLES: Record<string, string> = {
  urgent: "border-red-200 bg-red-50",
  attention: "border-amber-200 bg-amber-50",
  minor: "border-blue-100 bg-blue-50/50",
};

const SEVERITY_BADGE: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 border-red-200",
  attention: "bg-amber-100 text-amber-700 border-amber-200",
  minor: "bg-blue-50 text-blue-700 border-blue-200",
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-slate-100 text-slate-700 border-slate-200",
  in_progress: "bg-blue-100 text-blue-700 border-blue-200",
  resolved: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

export default function IssuesPage() {
  const { data: issues = [], refetch } = trpc.issues.list.useQuery();
  const { data: teamMembers = [] } = trpc.team.list.useQuery();
  const updateStatus = trpc.issues.updateStatus.useMutation({ onSuccess: () => { refetch(); toast.success("Status updated"); } });
  const reportIssue = trpc.issues.report.useMutation({ onSuccess: () => { refetch(); setShowAdd(false); toast.success("Issue reported"); } });
  const createTaskMut = trpc.tasks.create.useMutation({ onSuccess: () => { toast.success("Maintenance task created"); setTaskForm(null); } });

  const [filter, setFilter] = useState<"all" | "open" | "in_progress" | "resolved">("all");
  const [showAdd, setShowAdd] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [addForm, setAddForm] = useState({ description: "", severity: "minor" as "minor" | "attention" | "urgent", location: "" });
  const [taskForm, setTaskForm] = useState<{ issueIdx: number; assignedToId: string } | null>(null);

  const filtered = issues.filter((i: any) => filter === "all" || i.issueStatus === filter);
  const openCount = issues.filter((i: any) => i.issueStatus === "open").length;
  const inProgressCount = issues.filter((i: any) => i.issueStatus === "in_progress").length;
  const resolvedCount = issues.filter((i: any) => i.issueStatus === "resolved").length;

  function formatDate(s: string) {
    try { return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
    catch { return s; }
  }

  return (
    <HostLayout title="Property Issues">
      <div className="max-w-3xl space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Open", count: openCount, icon: <AlertTriangle className="w-4 h-4 text-red-500" />, f: "open" },
            { label: "In Progress", count: inProgressCount, icon: <Clock className="w-4 h-4 text-blue-500" />, f: "in_progress" },
            { label: "Resolved", count: resolvedCount, icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />, f: "resolved" },
          ].map(s => (
            <button key={s.f} onClick={() => setFilter(filter === s.f ? "all" : s.f as any)}
              className={`card-premium p-3 text-center transition-all ${filter === s.f ? "ring-2 ring-primary" : ""}`}>
              <div className="flex items-center justify-center gap-1.5 mb-1">{s.icon}<span className="text-xs text-muted-foreground">{s.label}</span></div>
              <p className="font-bold text-2xl">{s.count}</p>
            </button>
          ))}
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg">
            {filter === "all" ? `All Issues (${issues.length})` : `${filter.replace("_", " ")} (${filtered.length})`}
          </h2>
          <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" />Report Issue
          </Button>
        </div>

        {/* Issues list */}
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">
              {filter === "all" ? "No issues reported. Property is in good shape." : `No ${filter.replace("_", " ")} issues.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((issue: any, i: number) => (
              <div key={i} className={`rounded-xl border p-4 space-y-3 ${SEVERITY_STYLES[issue.issueSeverity]}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge className={`text-xs border capitalize ${SEVERITY_BADGE[issue.issueSeverity]}`}>{issue.issueSeverity}</Badge>
                      <Badge className={`text-xs border capitalize ${STATUS_STYLES[issue.issueStatus]}`}>{issue.issueStatus.replace("_", " ")}</Badge>
                    </div>
                    <p className="font-medium text-sm">{issue.issueDescription}</p>
                    {issue.issueLocation && <p className="text-xs text-muted-foreground mt-0.5">📍 {issue.issueLocation}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      Reported by {issue.issueReportedBy} · {formatDate(issue.issueReportedAt)}
                    </p>
                  </div>
                  <button onClick={() => setExpandedIdx(expandedIdx === i ? null : i)} className="text-muted-foreground hover:text-foreground shrink-0">
                    {expandedIdx === i ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                {expandedIdx === i && (
                  <div className="pt-2 border-t border-border/50 space-y-3">
                    {/* Status change */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">Status:</span>
                      {(["open", "in_progress", "resolved"] as const).map(s => (
                        <button key={s} onClick={() => updateStatus.mutate({ taskId: issue.taskId, itemIndex: 0, status: s })}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors capitalize ${
                            issue.issueStatus === s ? STATUS_STYLES[s] : "bg-background border-border text-muted-foreground hover:bg-secondary"
                          }`}>
                          {s.replace("_", " ")}
                        </button>
                      ))}
                    </div>

                    {/* Create maintenance task */}
                    {taskForm?.issueIdx === i ? (
                      <div className="flex items-center gap-2">
                        <Select value={taskForm.assignedToId} onValueChange={v => setTaskForm(f => f ? { ...f, assignedToId: v } : f)}>
                          <SelectTrigger className="h-8 text-xs flex-1">
                            <SelectValue placeholder="Assign to..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Unassigned</SelectItem>
                            {(teamMembers as any[]).map((m: any) => (
                              <SelectItem key={m.id} value={String(m.id)}>{m.name ?? m.email}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => {
                          createTaskMut.mutate({
                            title: `Fix: ${issue.issueDescription.slice(0, 60)}`,
                            type: "maintenance",
                            status: "pending",
                            notes: `Issue reported by ${issue.issueReportedBy}${issue.issueLocation ? ` at ${issue.issueLocation}` : ""}`,
                            assignedToId: (taskForm.assignedToId && taskForm.assignedToId !== 'none') ? parseInt(taskForm.assignedToId) : undefined,
                          } as any);
                        }} disabled={createTaskMut.isPending}>
                          <Wrench className="w-3 h-3" />Create Task
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setTaskForm(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
                        onClick={() => setTaskForm({ issueIdx: i, assignedToId: "" })}>
                        <Wrench className="w-3 h-3" />Create Maintenance Task
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Issue Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="font-serif flex items-center gap-2"><Flag className="w-4 h-4" />Report Issue</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Description</label>
              <textarea value={addForm.description} onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Describe the issue..."
                className="w-full text-sm border border-border rounded-xl p-3 resize-none bg-background focus:outline-none focus:ring-1 focus:ring-primary" rows={3} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Location</label>
              <Input value={addForm.location} onChange={e => setAddForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. bathroom, kitchen" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Severity</label>
              <div className="flex gap-2">
                {(["minor", "attention", "urgent"] as const).map(s => (
                  <button key={s} onClick={() => setAddForm(f => ({ ...f, severity: s }))}
                    className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors capitalize ${
                      addForm.severity === s ? SEVERITY_BADGE[s] : "bg-background border-border text-muted-foreground"
                    }`}>{s}</button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => reportIssue.mutate({ description: addForm.description, severity: addForm.severity, location: addForm.location || undefined, reportedBy: "Host" })}
              disabled={addForm.description.trim().length < 3 || reportIssue.isPending}>
              {reportIssue.isPending ? "Reporting..." : "Report Issue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HostLayout>
  );
}
