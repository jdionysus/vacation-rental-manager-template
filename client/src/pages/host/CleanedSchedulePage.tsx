import { useState, useMemo } from "react";
import HostLayout from "@/components/HostLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Brush, ClipboardCheck, Calendar, Users, CheckCircle2, Circle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

function toDateStr(val: unknown): string {
  if (!val) return "";
  if (val instanceof Date) return val.toISOString().split("T")[0];
  const s = String(val);
  if (s.includes("T")) return s.split("T")[0];
  if (s.includes(" ") && s.length > 10) { const d = new Date(s); if (!isNaN(d.getTime())) return d.toISOString().split("T")[0]; }
  return s.slice(0, 10);
}

function formatDate(dateStr: string): string {
  if (!dateStr || dateStr.length < 10) return dateStr;
  return new Date(dateStr + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}

function formatDateTime(val: unknown): string {
  if (!val) return "";
  const d = val instanceof Date ? val : new Date(String(val));
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600",
  accepted: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  complete: "bg-emerald-100 text-emerald-700",
  skipped: "bg-gray-100 text-gray-400",
};

export default function CleanedSchedulePage() {
  const { data: jobs = [], isLoading, refetch } = trpc.cleans.list.useQuery();
  const { data: templates = [] } = trpc.checklistTemplates.list.useQuery();
  const syncJobs = trpc.cleans.syncFromReservations.useMutation({
    onSuccess: (r) => { refetch(); toast.success(`${r.created} job${r.created !== 1 ? "s" : ""} synced`); },
  });

  const [filter, setFilter] = useState<"all" | "complete" | "pending">("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const filtered = useMemo(() => {
    return jobs
      .map(j => ({ ...j, checkoutDateStr: toDateStr(j.checkoutDate) }))
      .filter(j => {
        if (filter === "complete") return j.status === "complete";
        if (filter === "pending") return j.status !== "complete" && j.status !== "skipped";
        return true;
      })
      .sort((a, b) => b.checkoutDateStr.localeCompare(a.checkoutDateStr));
  }, [jobs, filter]);

  const completedCount = jobs.filter(j => j.status === "complete").length;
  const pendingCount = jobs.filter(j => j.status !== "complete" && j.status !== "skipped").length;

  return (
    <HostLayout title="Cleaned Schedule">
      <div className="max-w-3xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              {completedCount} completed
            </span>
            <span className="flex items-center gap-1.5">
              <Circle className="w-4 h-4 text-amber-500" />
              {pendingCount} pending
            </span>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5"
            onClick={() => syncJobs.mutate()}
            disabled={syncJobs.isPending}>
            <RefreshCw className={`w-3.5 h-3.5 ${syncJobs.isPending ? "animate-spin" : ""}`} />
            Sync from Reservations
          </Button>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 bg-secondary/50 rounded-xl p-1 w-fit">
          {(["all", "complete", "pending"] as const).map(v => (
            <button key={v} onClick={() => setFilter(v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${filter === v ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {v}
            </button>
          ))}
        </div>

        {/* Jobs list */}
        {isLoading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-secondary animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="card-premium p-10 text-center text-muted-foreground space-y-3">
            <Brush className="w-8 h-8 mx-auto opacity-30" />
            <p>No cleaning records yet.</p>
            <p className="text-xs">Click "Sync from Reservations" to create jobs from upcoming checkouts.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(job => {
              const isExpanded = expandedId === job.id;
              const progress = Array.isArray(job.checklistProgress) ? job.checklistProgress as boolean[] : [];
              const doneCount = progress.filter(Boolean).length;
              const template = templates.find(t => t.id === job.checklistTemplateId);
              const totalItems = template ? (template.items as any[]).length : progress.length;

              // Parse job type from notes
              const isInspection = job.notes?.includes("[Inspection]");
              const completedBy = job.notes?.match(/Completed by: ([^—]+)/)?.[1]?.trim();

              return (
                <div key={job.id} className="card-premium overflow-hidden">
                  <div className="p-4 flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isInspection ? "bg-sky-50" : "bg-amber-50"
                    }`}>
                      {isInspection
                        ? <ClipboardCheck className="w-5 h-5 text-sky-600" />
                        : <Brush className="w-5 h-5 text-amber-600" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{formatDate(job.checkoutDateStr)}</span>
                        <Badge className={`text-[10px] px-2 py-0.5 ${STATUS_STYLES[job.status] ?? STATUS_STYLES.pending}`}>
                          {job.status === "complete" ? (isInspection ? "Inspected" : "Cleaned") : job.status.replace("_", " ")}
                        </Badge>
                        {isInspection && <Badge className="text-[10px] px-2 py-0.5 bg-sky-50 text-sky-700">Inspection</Badge>}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        {job.completedAt && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDateTime(job.completedAt)}
                          </span>
                        )}
                        {completedBy && (
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {completedBy}
                          </span>
                        )}
                        {totalItems > 0 && (
                          <span>{doneCount}/{totalItems} items</span>
                        )}
                      </div>
                      {totalItems > 0 && (
                        <div className="mt-1.5 h-1 bg-secondary rounded-full overflow-hidden w-32">
                          <div
                            className={`h-full rounded-full ${isInspection ? "bg-sky-500" : "bg-emerald-500"}`}
                            style={{ width: `${totalItems > 0 ? (doneCount / totalItems) * 100 : 0}%` }}
                          />
                        </div>
                      )}
                    </div>
                    {totalItems > 0 && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : job.id)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-1"
                      >
                        {isExpanded ? "Hide" : "Details"}
                      </button>
                    )}
                  </div>

                  {isExpanded && template && (
                    <div className="border-t border-border px-4 pb-4 pt-3 bg-secondary/10 space-y-3">
                      <p className="text-xs font-medium text-muted-foreground">{template.name}</p>
                      <div className="space-y-1">
                        {(template.items as { section: string; item: string; required: boolean }[]).map((it, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs">
                            {progress[idx]
                              ? <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${isInspection ? "text-sky-500" : "text-emerald-500"}`} />
                              : <Circle className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                            }
                            <span className={progress[idx] ? "text-muted-foreground line-through" : ""}>{it.item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </HostLayout>
  );
}
