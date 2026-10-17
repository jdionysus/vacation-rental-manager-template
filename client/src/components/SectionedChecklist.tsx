/**
 * SectionedChecklist — renders a grouped checklist with issue reporting.
 * Used in cleaner portal, co-host portal, and task detail views.
 */
import { useState } from "react";
import { CheckCircle2, Circle, AlertTriangle, ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type ChecklistItemWithIssue = {
  section: string;
  item: string;
  required: boolean;
  done?: boolean;
  issue?: {
    description: string;
    severity: "minor" | "attention" | "urgent";
    reportedAt: string;
    reportedBy?: string;
  } | null;
};

const SEVERITY_STYLES = {
  minor: "bg-yellow-50 text-yellow-700 border-yellow-200",
  attention: "bg-orange-50 text-orange-700 border-orange-200",
  urgent: "bg-red-50 text-red-700 border-red-200",
};

const SEVERITY_LABELS = {
  minor: "Minor",
  attention: "Needs Attention",
  urgent: "Urgent",
};

interface Props {
  items: ChecklistItemWithIssue[];
  reportedBy?: string;
  onChange: (items: ChecklistItemWithIssue[]) => void;
  readOnly?: boolean;
}

export default function SectionedChecklist({ items, reportedBy, onChange, readOnly = false }: Props) {
  const [reportingIdx, setReportingIdx] = useState<number | null>(null);
  const [issueForm, setIssueForm] = useState({ description: "", severity: "minor" as "minor" | "attention" | "urgent" });
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // Group items by section
  const sections: string[] = [];
  const sectionMap = new Map<string, { item: ChecklistItemWithIssue; idx: number }[]>();
  items.forEach((item, idx) => {
    const sec = item.section || "General";
    if (!sectionMap.has(sec)) { sectionMap.set(sec, []); sections.push(sec); }
    sectionMap.get(sec)!.push({ item, idx });
  });

  function toggleDone(idx: number) {
    if (readOnly) return;
    const updated = [...items];
    updated[idx] = { ...updated[idx], done: !updated[idx].done };
    onChange(updated);
  }

  function submitIssue(idx: number) {
    if (!issueForm.description.trim()) return;
    const updated = [...items];
    updated[idx] = {
      ...updated[idx],
      issue: {
        description: issueForm.description.trim(),
        severity: issueForm.severity,
        reportedAt: new Date().toISOString(),
        reportedBy: reportedBy,
      },
    };
    onChange(updated);
    setReportingIdx(null);
    setIssueForm({ description: "", severity: "minor" });
  }

  function clearIssue(idx: number) {
    const updated = [...items];
    updated[idx] = { ...updated[idx], issue: null };
    onChange(updated);
  }

  function toggleSection(section: string) {
    setCollapsedSections(prev => {
      const n = new Set(prev);
      n.has(section) ? n.delete(section) : n.add(section);
      return n;
    });
  }

  // Stats
  const doneCount = items.filter(i => i.done).length;
  const issueCount = items.filter(i => i.issue).length;
  const total = items.filter(i => i.item?.trim()).length;

  return (
    <div className="space-y-1">
      {/* Progress bar */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground">{doneCount}/{total} complete</span>
        {issueCount > 0 && (
          <span className="text-xs text-orange-600 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />{issueCount} issue{issueCount !== 1 ? "s" : ""} flagged
          </span>
        )}
      </div>
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all"
          style={{ width: total > 0 ? `${(doneCount / total) * 100}%` : "0%" }}
        />
      </div>

      {sections.map(section => {
        const sectionEntries = sectionMap.get(section) ?? [];
        const validEntries = sectionEntries.filter(e => e.item.item?.trim());
        const sectionDone = validEntries.filter(e => e.item.done).length;
        const isCollapsed = collapsedSections.has(section);

        return (
          <div key={section} className="rounded-xl border border-border overflow-hidden">
            {/* Section header */}
            <button
              className="w-full flex items-center justify-between px-4 py-2.5 bg-secondary/20 hover:bg-secondary/40 transition-colors"
              onClick={() => toggleSection(section)}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{section}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${sectionDone === validEntries.length && validEntries.length > 0 ? "bg-emerald-100 text-emerald-700" : "bg-secondary text-muted-foreground"}`}>
                  {sectionDone}/{validEntries.length}
                </span>
              </div>
              {isCollapsed ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>

            {/* Section items */}
            {!isCollapsed && (
              <div className="divide-y divide-border/50">
                {validEntries.map(({ item, idx }) => (
                  <div key={idx}>
                    {/* Item row */}
                    <div className="flex items-start gap-3 px-4 py-3">
                      <button
                        className="shrink-0 mt-0.5"
                        onClick={() => toggleDone(idx)}
                        disabled={readOnly}
                      >
                        {item.done
                          ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                          : <Circle className="w-5 h-5 text-muted-foreground hover:text-primary transition-colors" />
                        }
                      </button>
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm leading-relaxed ${item.done ? "line-through text-muted-foreground" : ""}`}>
                          {item.item}
                        </span>
                        {!item.required && (
                          <span className="ml-2 text-[10px] text-muted-foreground/60">optional</span>
                        )}
                        {/* Existing issue */}
                        {item.issue && (
                          <div className={`mt-2 flex items-start gap-2 p-2 rounded-lg border text-xs ${SEVERITY_STYLES[item.issue.severity]}`}>
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <span className="font-medium">{SEVERITY_LABELS[item.issue.severity]}: </span>
                              {item.issue.description}
                              {item.issue.reportedBy && <span className="opacity-60"> — {item.issue.reportedBy}</span>}
                            </div>
                            {!readOnly && (
                              <button onClick={() => clearIssue(idx)} className="shrink-0 opacity-60 hover:opacity-100">
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      {/* Report issue button */}
                      {!readOnly && !item.issue && (
                        <button
                          className="shrink-0 text-[10px] text-muted-foreground hover:text-orange-600 transition-colors mt-1 whitespace-nowrap"
                          onClick={() => { setReportingIdx(reportingIdx === idx ? null : idx); setIssueForm({ description: "", severity: "minor" }); }}
                        >
                          {reportingIdx === idx ? "Cancel" : "Flag issue"}
                        </button>
                      )}
                    </div>

                    {/* Issue form */}
                    {reportingIdx === idx && !readOnly && (
                      <div className="px-4 pb-3 pt-0 space-y-2 bg-orange-50/50">
                        <Textarea
                          className="text-xs resize-none"
                          rows={2}
                          placeholder="Describe the issue..."
                          value={issueForm.description}
                          onChange={e => setIssueForm({ ...issueForm, description: e.target.value })}
                          autoFocus
                        />
                        <div className="flex items-center gap-2">
                          <Select value={issueForm.severity} onValueChange={v => setIssueForm({ ...issueForm, severity: v as typeof issueForm.severity })}>
                            <SelectTrigger className="h-7 text-xs w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="minor">Minor</SelectItem>
                              <SelectItem value="attention">Needs Attention</SelectItem>
                              <SelectItem value="urgent">Urgent</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button size="sm" className="h-7 text-xs" onClick={() => submitIssue(idx)}
                            disabled={!issueForm.description.trim()}>
                            Report
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
