import { useState } from "react";
import HostLayout from "@/components/HostLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, CheckCircle2, Circle, Trash2, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { formatDateShort } from "@/lib/dateUtils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-slate-50 text-slate-600 border-slate-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  complete: "bg-emerald-50 text-emerald-700 border-emerald-200",
  skipped: "bg-slate-50 text-slate-400 border-slate-200",
};

export default function TasksPage() {
  const { data: tasks = [], refetch } = trpc.tasks.list.useQuery();
  const { data: users = [] } = trpc.team.list.useQuery();
  const { data: reservations = [] } = trpc.reservations.list.useQuery();
  const createTask = trpc.tasks.create.useMutation({ onSuccess: () => { refetch(); setShowAdd(false); toast.success("Task created"); } });
  const updateTask = trpc.tasks.update.useMutation({ onSuccess: () => refetch() });
  const deleteTask = trpc.tasks.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Task deleted"); } });

  const [showAdd, setShowAdd] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [form, setForm] = useState({
    type: "turnover" as "turnover" | "maintenance" | "inspection" | "other",
    title: "", notes: "", dueDate: "", arrivalWindow: "", departureWindow: "",
    assignedToId: undefined as number | undefined,
    reservationId: undefined as number | undefined,
    checklist: [] as { item: string; done: boolean }[],
  });
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const { data: templates = [] } = trpc.checklistTemplates.list.useQuery();

  const CLEANING_CHECKLIST = [
    // Bedroom
    "Strip and replace all bed linens",
    "Fluff and arrange pillows",
    "Dust all surfaces and nightstands",
    "Vacuum bedroom floor",
    "Empty bedroom trash",
    "Wipe down light switches and door handles",
    // Bathroom
    "Scrub toilet inside and out",
    "Clean sink and faucet",
    "Clean shower/tub and glass doors",
    "Wipe down mirror",
    "Mop bathroom floor",
    "Replace towels with fresh set",
    "Restock toilet paper (min 4 rolls)",
    "Restock soap, shampoo, conditioner",
    "Empty bathroom trash",
    // Kitchen
    "Wipe down all countertops",
    "Clean stovetop and oven exterior",
    "Wipe down microwave inside and out",
    "Clean refrigerator — remove old food, wipe shelves",
    "Run and empty dishwasher",
    "Wipe down cabinet fronts",
    "Clean kitchen sink",
    "Restock dish soap, sponge, paper towels",
    "Empty kitchen trash and replace liner",
    // Living areas
    "Vacuum all rugs and upholstered furniture",
    "Dust all surfaces, shelves, and decor",
    "Wipe down TV and remotes",
    "Clean windows and glass doors (smudges)",
    "Mop all hard floors",
    "Wipe down light switches and door handles",
    // Final checks
    "Check all closets and drawers — remove any left items",
    "Set thermostat to 68°F",
    "Lock all windows",
    "Stage welcome items on counter",
    "Take photos of completed clean",
  ].map(item => ({ item, done: false }));

  const COHOST_CHECKLIST = [
    // Property condition
    "Confirm cleaning is complete — do a full walkthrough",
    "Check all linens are fresh and properly made",
    "Verify towels are staged in bathroom",
    "Check kitchen is fully stocked (coffee, paper towels, dish soap)",
    "Confirm toilet paper stocked (min 4 rolls)",
    "Check all appliances are working (TV, microwave, coffee maker)",
    "Test WiFi — confirm network and password are correct",
    "Check thermostat is set to 68°F",
    "Verify all lights are working",
    // Access
    "Confirm front door keypad code is active and working",
    "Test door code at least once",
    "Confirm parking space is clear",
    // Guest readiness
    "Check welcome card or printed instructions are visible",
    "Confirm WiFi password is posted on refrigerator",
    "Verify check-in instructions are accurate for this reservation",
    "Check that no previous guest items remain",
    // Safety
    "Test smoke detector",
    "Test carbon monoxide detector",
    "Confirm fire extinguisher is accessible",
    "Check all windows and doors lock properly",
    // Final
    "Take walkthrough photos for records",
    "Confirm reservation dates match calendar",
    "Send guest check-in message with access code",
  ].map(item => ({ item, done: false }));

  const cleaners = users.filter((u) => u.role === "cleaner" || u.role === "property_manager" || u.role === "host" || u.role === "admin");

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleChecklistItem(task: typeof tasks[0], idx: number) {
    const checklist = [...(task.checklist as { item: string; done: boolean }[] ?? [])];
    checklist[idx] = { ...checklist[idx], done: !checklist[idx].done };
    updateTask.mutate({ id: task.id, checklist });
  }

  const activeTasks = tasks.filter((t) => t.status !== "complete" && t.status !== "skipped");
  const doneTasks = tasks.filter((t) => t.status === "complete" || t.status === "skipped");

  return (
    <HostLayout title="Tasks">
      <div className="max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{activeTasks.length} open · {doneTasks.length} completed</p>
          <Button onClick={() => setShowAdd(true)} className="gap-1.5">
            <Plus className="w-4 h-4" />
            Add Task
          </Button>
        </div>

        {/* Active Tasks */}
        {activeTasks.length === 0 && doneTasks.length === 0 ? (
          <div className="card-premium p-10 text-center text-muted-foreground space-y-3">
            <CheckCircle2 className="w-8 h-8 mx-auto opacity-30" />
            <p>No tasks yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeTasks.map((task) => {
              const checklist = (task.checklist as { item: string; done: boolean }[] ?? []);
              const doneCount = checklist.filter((c) => c.done).length;
              const isExpanded = expanded.has(task.id);

              return (
                <div key={task.id} className="card-premium overflow-hidden">
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer hover:bg-secondary/30 transition-colors"
                    onClick={() => toggleExpand(task.id)}
                  >
                    <button
                      className="shrink-0"
                      onClick={(e) => { e.stopPropagation(); updateTask.mutate({ id: task.id, status: "complete" }); }}
                    >
                      <Circle className="w-5 h-5 text-muted-foreground hover:text-primary transition-colors" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{task.title}</span>
                        <Badge className={`text-xs border ${STATUS_STYLES[task.status]}`}>{task.status.replace("_", " ")}</Badge>
                        <Badge variant="secondary" className="text-xs capitalize">{task.type}</Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        {task.dueDate && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDateShort(task.dueDate)}
                          </span>
                        )}
                        {task.arrivalWindow && <span>Arrival: {task.arrivalWindow}</span>}
                        {task.departureWindow && <span>Departure: {task.departureWindow}</span>}
                        {checklist.length > 0 && <span>{doneCount}/{checklist.length} items</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Select
                        value={task.status}
                        onValueChange={(v) => updateTask.mutate({ id: task.id, status: v as typeof task.status })}
                      >
                        <SelectTrigger className="h-7 w-28 text-xs" onClick={(e) => e.stopPropagation()}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="complete">Complete</SelectItem>
                          <SelectItem value="skipped">Skipped</SelectItem>
                        </SelectContent>
                      </Select>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border px-4 pb-4 pt-3 space-y-3 bg-secondary/20">
                      {task.notes && <p className="text-sm text-muted-foreground">{task.notes}</p>}
                      {checklist.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Checklist</p>
                          {checklist.map((item, idx) => (
                            <label key={idx} className="flex items-center gap-2.5 cursor-pointer group">
                              <button onClick={() => toggleChecklistItem(task, idx)} className="shrink-0">
                                {item.done
                                  ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                  : <Circle className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                }
                              </button>
                              <span className={`text-sm ${item.done ? "line-through text-muted-foreground" : ""}`}>{item.item}</span>
                            </label>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <Button
                          variant="ghost" size="sm" className="text-xs text-destructive hover:text-destructive h-7"
                          onClick={() => deleteTask.mutate({ id: task.id })}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Completed */}
            {doneTasks.length > 0 && (
              <div className="pt-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Completed ({doneTasks.length})</p>
                {doneTasks.slice(0, 5).map((task) => (
                  <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg opacity-50">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="text-sm line-through text-muted-foreground">{task.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Task Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif">New Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Title</label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Turnover cleaning" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Type</label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as typeof form.type })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="turnover">Turnover</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="inspection">Inspection</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Due Date</label>
                <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Arrival Window</label>
                <Input value={form.arrivalWindow} onChange={(e) => setForm({ ...form, arrivalWindow: e.target.value })} placeholder="e.g. After 11am" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Departure Window</label>
                <Input value={form.departureWindow} onChange={(e) => setForm({ ...form, departureWindow: e.target.value })} placeholder="e.g. Before 3pm" />
              </div>
            </div>
            {reservations.length > 0 && (
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Linked Reservation</label>
                <Select value={form.reservationId?.toString() ?? "none"} onValueChange={(v) => setForm({ ...form, reservationId: v === "none" ? undefined : parseInt(v) })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {reservations.slice(0, 20).map((r) => (
                      <SelectItem key={r.id} value={r.id.toString()}>
                        {r.guestName ?? "Guest"} — {String(r.arrivalDate).split("T")[0]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {cleaners.length > 0 && (
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Assign To</label>
                <Select value={form.assignedToId?.toString() ?? "unassigned"} onValueChange={(v) => setForm({ ...form, assignedToId: v === "unassigned" ? undefined : parseInt(v) })}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {cleaners.map((u) => (
                      <SelectItem key={u.id} value={u.id.toString()}>{u.name ?? u.email ?? `User ${u.id}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Notes</label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="resize-none" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Checklist Items</label>
                <div className="flex flex-wrap gap-1.5">
                  {templates.map(t => (
                    <Button
                      key={t.id}
                      type="button" variant="outline" size="sm"
                      className="text-xs h-6 px-2"
                      onClick={() => setForm({ ...form, checklist: (t.items as {item:string;required:boolean}[]).map(i => ({ item: i.item, done: false })) })}
                    >
                      {t.name}
                    </Button>
                  ))}
                  {/* Fallback hardcoded if DB empty */}
                  {templates.length === 0 && (
                    <>
                      <Button type="button" variant="outline" size="sm" className="text-xs h-6 px-2" onClick={() => setForm({ ...form, checklist: [...CLEANING_CHECKLIST] })}>🧹 Cleaning</Button>
                      <Button type="button" variant="outline" size="sm" className="text-xs h-6 px-2" onClick={() => setForm({ ...form, checklist: [...COHOST_CHECKLIST] })}>✅ Property Manager</Button>
                    </>
                  )}
                  {form.checklist.length > 0 && (
                    <Button type="button" variant="ghost" size="sm" className="text-xs h-6 px-2 text-muted-foreground" onClick={() => setForm({ ...form, checklist: [] })}>Clear</Button>
                  )}
                </div>
              </div>
              <div className="space-y-1.5 mb-2">
                {form.checklist.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-sm flex-1">{item.item}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setForm({ ...form, checklist: form.checklist.filter((_, i) => i !== idx) })}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newChecklistItem}
                  onChange={(e) => setNewChecklistItem(e.target.value)}
                  placeholder="Add checklist item..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newChecklistItem.trim()) {
                      setForm({ ...form, checklist: [...form.checklist, { item: newChecklistItem.trim(), done: false }] });
                      setNewChecklistItem("");
                    }
                  }}
                />
                <Button
                  variant="outline" size="sm"
                  onClick={() => {
                    if (newChecklistItem.trim()) {
                      setForm({ ...form, checklist: [...form.checklist, { item: newChecklistItem.trim(), done: false }] });
                      setNewChecklistItem("");
                    }
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => createTask.mutate(form)} disabled={!form.title || createTask.isPending}>
              {createTask.isPending ? "Creating..." : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HostLayout>
  );
}
