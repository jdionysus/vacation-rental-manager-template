import { useState, useMemo } from "react";
import HostLayout from "@/components/HostLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus, Trash2, Edit2, Check, X, ChevronDown, ChevronUp,
  Eye, Users, Zap, GripVertical, FolderPlus, Download
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ─── Types ────────────────────────────────────────────────────────────────────

type ChecklistItem = { section: string; item: string; required: boolean };

type TemplateForm = {
  name: string;
  description: string;
  taskType: "turnover" | "maintenance" | "inspection" | "other";
  items: ChecklistItem[];
  assignedToId?: number;
  autoAssignOn: "checkout" | "checkin" | "manual";
};

const TASK_TYPE_LABELS: Record<string, string> = {
  turnover: "Turnover",
  maintenance: "Maintenance",
  inspection: "Inspection",
  other: "Other",
};

const AUTO_ASSIGN_LABELS: Record<string, string> = {
  checkout: "Auto on checkout",
  checkin: "Auto on check-in",
  manual: "Manual only",
};

const BLANK_FORM: TemplateForm = {
  name: "",
  description: "",
  taskType: "turnover",
  items: [],
  assignedToId: undefined,
  autoAssignOn: "manual",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupBySectionMap(items: ChecklistItem[]): Map<string, ChecklistItem[]> {
  const map = new Map<string, ChecklistItem[]>();
  for (const item of items) {
    const sec = item.section || "General";
    if (!map.has(sec)) map.set(sec, []);
    map.get(sec)!.push(item);
  }
  return map;
}

// ─── Section Editor ───────────────────────────────────────────────────────────

function SectionEditor({
  items,
  onChange,
}: {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
}) {
  const [newSection, setNewSection] = useState("");
  const [newItemText, setNewItemText] = useState<Record<string, string>>({});
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  function handleDragStart(idx: number) { setDragIdx(idx); }
  function handleDragOver(e: React.DragEvent, idx: number) { e.preventDefault(); setDragOverIdx(idx); }
  function handleDrop(idx: number) {
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDragOverIdx(null); return; }
    const updated = [...items];
    const [moved] = updated.splice(dragIdx, 1);
    updated.splice(idx, 0, moved);
    onChange(updated);
    setDragIdx(null); setDragOverIdx(null);
  }
  function handleDragEnd() { setDragIdx(null); setDragOverIdx(null); }

  const sections = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const it of items) {
      const s = it.section || "General";
      if (!seen.has(s)) { seen.add(s); list.push(s); }
    }
    return list;
  }, [items]);

  function addSection() {
    const s = newSection.trim();
    if (!s || sections.includes(s)) return;
    setNewSection("");
    // Add a placeholder item so the section appears
    onChange([...items, { section: s, item: "", required: true }]);
  }

  function addItem(section: string) {
    const text = (newItemText[section] ?? "").trim();
    if (!text) return;
    setNewItemText({ ...newItemText, [section]: "" });
    onChange([...items, { section, item: text, required: true }]);
  }

  function removeItem(idx: number) {
    const updated = items.filter((_, i) => i !== idx);
    onChange(updated);
  }

  function toggleRequired(idx: number) {
    const updated = [...items];
    updated[idx] = { ...updated[idx], required: !updated[idx].required };
    onChange(updated);
  }

  function removeSection(section: string) {
    onChange(items.filter(it => it.section !== section));
  }

  function updateItemText(idx: number, text: string) {
    const updated = [...items];
    updated[idx] = { ...updated[idx], item: text };
    onChange(updated);
  }

  const grouped = groupBySectionMap(items.filter(it => it.item.trim()));

  return (
    <div className="space-y-4">
      {/* Existing sections */}
      {sections.map(section => {
        const sectionItems = grouped.get(section) ?? [];
        const allItems = items.filter(it => it.section === section && it.item.trim());
        return (
          <div key={section} className="rounded-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-secondary/30">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{section}</span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">{allItems.length} items</span>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={() => removeSection(section)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
            <div className="px-3 pb-2 pt-1 space-y-1">
              {allItems.map((it, localIdx) => {
                const globalIdx = items.findIndex(x => x.section === section && x.item === it.item && !items.slice(0, items.indexOf(x)).some(y => y.section === section && y.item === it.item));
                const realIdx = items.indexOf(it);
                return (
                  <div
                    key={realIdx}
                    className={`flex items-center gap-2 group py-0.5 transition-opacity ${dragIdx === realIdx ? 'opacity-40' : ''} ${dragOverIdx === realIdx && dragIdx !== realIdx ? 'border-t-2 border-primary' : ''}`}
                    draggable
                    onDragStart={() => handleDragStart(realIdx)}
                    onDragOver={e => handleDragOver(e, realIdx)}
                    onDrop={() => handleDrop(realIdx)}
                    onDragEnd={handleDragEnd}
                  >
                    <GripVertical className="w-3 h-3 text-muted-foreground/50 shrink-0 cursor-grab active:cursor-grabbing" />
                    <input
                      className="text-sm flex-1 bg-transparent border-0 outline-none focus:bg-accent/30 focus:px-1.5 rounded transition-all min-w-0"
                      value={it.item}
                      onChange={e => updateItemText(realIdx, e.target.value)}
                      placeholder="Item text..."
                    />
                    <button
                      onClick={() => toggleRequired(realIdx)}
                      className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${it.required ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                    >
                      {it.required ? "Required" : "Optional"}
                    </button>
                    <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removeItem(realIdx)}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                );
              })}
              {/* Add item to this section */}
              <div className="flex gap-2 pt-1">
                <Input
                  className="h-7 text-xs"
                  value={newItemText[section] ?? ""}
                  onChange={e => setNewItemText({ ...newItemText, [section]: e.target.value })}
                  placeholder={`Add item to ${section}...`}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addItem(section); } }}
                />
                <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => addItem(section)}>
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Add new section */}
      <div className="flex gap-2">
        <Input
          className="h-8 text-sm"
          value={newSection}
          onChange={e => setNewSection(e.target.value)}
          placeholder="New section name (e.g. Bedroom, Kitchen)..."
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSection(); } }}
        />
        <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1" onClick={addSection}>
          <FolderPlus className="w-3.5 h-3.5" />
          Add Section
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ChecklistTemplatesPage() {
  const { data: templates = [], refetch } = trpc.checklistTemplates.list.useQuery();
  const { data: teamMembers = [] } = trpc.team.list.useQuery();

  const createTemplate = trpc.checklistTemplates.create.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); resetForm(); toast.success("Template created"); },
    onError: (e) => toast.error(`Failed to create: ${e.message}`),
  });
  const updateTemplate = trpc.checklistTemplates.update.useMutation({
    onSuccess: () => { refetch(); setEditingId(null); toast.success("Template saved"); },
    onError: (e) => toast.error(`Failed to save: ${e.message}`),
  });
  const deleteTemplate = trpc.checklistTemplates.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Template deleted"); },
    onError: (e) => toast.error(`Failed to delete: ${e.message}`),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [form, setForm] = useState<TemplateForm>(BLANK_FORM);
  const [editForm, setEditForm] = useState<TemplateForm | null>(null);

  function resetForm() {
    setForm(BLANK_FORM);
  }

  function startEdit(t: typeof templates[0]) {
    setEditingId(t.id);
    setViewingId(null);
    setEditForm({
      name: t.name,
      description: t.description ?? "",
      taskType: t.taskType as TemplateForm["taskType"],
      items: (t.items as ChecklistItem[]).map(i => ({
        section: i.section || "General",
        item: i.item,
        required: i.required,
      })),
      assignedToId: t.assignedToId ?? undefined,
      autoAssignOn: (t.autoAssignOn as TemplateForm["autoAssignOn"]) ?? "manual",
    });
  }

  const viewingTemplate = templates.find(t => t.id === viewingId);

  return (
    <HostLayout title="Checklist Templates">
      <div className="max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{templates.length} template{templates.length !== 1 ? "s" : ""}</p>
          <Button onClick={() => { resetForm(); setShowAdd(true); }} className="gap-1.5">
            <Plus className="w-4 h-4" />
            New Template
          </Button>
        </div>

        {templates.length === 0 && (
          <div className="card-premium p-10 text-center text-muted-foreground">
            <p>No templates yet. Create one to use when adding tasks.</p>
          </div>
        )}

        <div className="space-y-3">
          {templates.map(t => {
            const items = t.items as ChecklistItem[];
            const validItems = items.filter(i => i.item?.trim());
            const sections = Array.from(new Set(validItems.map(i => i.section || "General")));
            const isEditing = editingId === t.id;
            const assignee = teamMembers.find(m => m.id === t.assignedToId);

            return (
              <div key={t.id} className="card-premium overflow-hidden">
                {/* Header */}
                <div className="flex items-center gap-3 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{t.name}</span>
                      {t.isDefault && <Badge variant="secondary" className="text-xs">Default</Badge>}
                      <Badge variant="outline" className="text-xs capitalize">{TASK_TYPE_LABELS[t.taskType]}</Badge>
                      <span className="text-xs text-muted-foreground">{validItems.length} items · {sections.length} section{sections.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {assignee && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Users className="w-3 h-3" />{assignee.name}
                        </span>
                      )}
                      {t.autoAssignOn && t.autoAssignOn !== "manual" && (
                        <span className="text-xs text-emerald-600 flex items-center gap-1">
                          <Zap className="w-3 h-3" />{AUTO_ASSIGN_LABELS[t.autoAssignOn]}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => setViewingId(viewingId === t.id ? null : t.id)}
                      title="View checklist">
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    <a
                      href={`/api/checklist/pdf/${t.id}`}
                      download
                      title="Download printable PDF"
                      className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => startEdit(t)} title="Edit">
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    {!t.isDefault && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => deleteTemplate.mutate({ id: t.id })}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* View mode */}
                {viewingId === t.id && !isEditing && (
                  <div className="border-t border-border px-4 pb-4 pt-3 bg-secondary/10 space-y-3">
                    {sections.map(section => {
                      const sectionItems = validItems.filter(i => (i.section || "General") === section);
                      return (
                        <div key={section}>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{section}</p>
                          <div className="space-y-1">
                            {sectionItems.map((item, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-sm">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.required ? "bg-primary" : "bg-muted-foreground/30"}`} />
                                <span className={item.required ? "text-foreground" : "text-muted-foreground"}>{item.item}</span>
                                {!item.required && <span className="text-[10px] text-muted-foreground/60 ml-auto">optional</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Edit mode */}
                {isEditing && editForm && (
                  <div className="border-t border-border px-4 pb-4 pt-3 bg-secondary/10 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Name</label>
                        <Input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Task Type</label>
                        <Select value={editForm.taskType} onValueChange={v => setEditForm({ ...editForm, taskType: v as TemplateForm["taskType"] })}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="turnover">Turnover</SelectItem>
                            <SelectItem value="maintenance">Maintenance</SelectItem>
                            <SelectItem value="inspection">Inspection</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
                          <Users className="w-3 h-3 inline mr-1" />Assign To
                        </label>
                        <Select
                          value={editForm.assignedToId?.toString() ?? "none"}
                          onValueChange={v => setEditForm({ ...editForm, assignedToId: v === "none" ? undefined : parseInt(v) })}
                        >
                          <SelectTrigger className="h-9"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Unassigned</SelectItem>
                            {teamMembers.map(m => (
                              <SelectItem key={m.id} value={m.id.toString()}>{m.name} ({m.role})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
                          <Zap className="w-3 h-3 inline mr-1" />Auto-Assign
                        </label>
                        <Select value={editForm.autoAssignOn} onValueChange={v => setEditForm({ ...editForm, autoAssignOn: v as TemplateForm["autoAssignOn"] })}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="manual">Manual only</SelectItem>
                            <SelectItem value="checkout">Auto on checkout</SelectItem>
                            <SelectItem value="checkin">Auto on check-in</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">Checklist Sections & Items</label>
                      <SectionEditor
                        items={editForm.items}
                        onChange={items => setEditForm({ ...editForm, items })}
                      />
                    </div>

                    <div className="flex gap-2 justify-end pt-1">
                      <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                      <Button size="sm"
                        onClick={() => updateTemplate.mutate({ id: t.id, ...editForm })}
                        disabled={!editForm.name || updateTemplate.isPending}>
                        <Check className="w-3.5 h-3.5 mr-1" />
                        {updateTemplate.isPending ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Template Dialog */}
      <Dialog open={showAdd} onOpenChange={v => { setShowAdd(v); if (!v) resetForm(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-serif">New Checklist Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Name *</label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Full Turnover Clean" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Task Type</label>
                <Select value={form.taskType} onValueChange={v => setForm({ ...form, taskType: v as TemplateForm["taskType"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="turnover">Turnover</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="inspection">Inspection</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  <Users className="w-3 h-3 inline mr-1" />Assign To
                </label>
                <Select
                  value={form.assignedToId?.toString() ?? "none"}
                  onValueChange={v => setForm({ ...form, assignedToId: v === "none" ? undefined : parseInt(v) })}
                >
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {teamMembers.map(m => (
                      <SelectItem key={m.id} value={m.id.toString()}>{m.name} ({m.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  <Zap className="w-3 h-3 inline mr-1" />Auto-Assign
                </label>
                <Select value={form.autoAssignOn} onValueChange={v => setForm({ ...form, autoAssignOn: v as TemplateForm["autoAssignOn"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual only</SelectItem>
                    <SelectItem value="checkout">Auto on checkout</SelectItem>
                    <SelectItem value="checkin">Auto on check-in</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">Checklist Sections & Items</label>
              <SectionEditor
                items={form.items}
                onChange={items => setForm({ ...form, items })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdd(false); resetForm(); }}>Cancel</Button>
            <Button
              onClick={() => createTemplate.mutate(form)}
              disabled={!form.name || createTemplate.isPending}
            >
              {createTemplate.isPending ? "Creating..." : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HostLayout>
  );
}
