import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import HostLayout from "@/components/HostLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Trash2, DollarSign, TrendingDown } from "lucide-react";
import { formatDate } from "@/lib/dateUtils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CATEGORY_LABELS: Record<string, string> = {
  cleaning: "Cleaning",
  supplies: "Supplies",
  repairs: "Repairs",
  property_manager_fee: "Co-host Fee",
  platform_fee: "Platform Fee",
  utilities: "Utilities",
  other: "Other",
};

const CATEGORY_COLORS: Record<string, string> = {
  cleaning: "bg-blue-50 text-blue-700 border-blue-200",
  supplies: "bg-violet-50 text-violet-700 border-violet-200",
  repairs: "bg-orange-50 text-orange-700 border-orange-200",
  property_manager_fee: "bg-pink-50 text-pink-700 border-pink-200",
  platform_fee: "bg-slate-50 text-slate-600 border-slate-200",
  utilities: "bg-amber-50 text-amber-700 border-amber-200",
  other: "bg-secondary text-muted-foreground border-border",
};

export default function CostsPage() {
  const { user } = useAuth();
  const isReadOnly = user?.role === "accountant";
  const { data: costs = [], refetch } = trpc.costs.list.useQuery();
  const createCost = trpc.costs.create.useMutation({ onSuccess: () => { refetch(); setShowAdd(false); toast.success("Cost logged"); } });
  const deleteCost = trpc.costs.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Deleted"); } });

  const [showAdd, setShowAdd] = useState(false);
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [form, setForm] = useState({
    category: "cleaning" as "cleaning" | "supplies" | "repairs" | "property_manager_fee" | "platform_fee" | "utilities" | "other",
    amount: "", vendor: "", description: "", costDate: new Date().toISOString().split("T")[0],
  });

  const filtered = costs.filter((c) => {
    // costDate may be a Date object or a string depending on the DB driver
    const d = c.costDate instanceof Date
      ? c.costDate.toISOString().slice(0, 7)
      : String(c.costDate).slice(0, 7);
    return d === filterMonth;
  });

  const summary = useMemo(() => {
    const total = filtered.reduce((sum, c) => sum + parseFloat(c.amount ?? "0"), 0);
    const byCategory: Record<string, number> = {};
    for (const c of filtered) {
      byCategory[c.category] = (byCategory[c.category] ?? 0) + parseFloat(c.amount ?? "0");
    }
    return { total, byCategory };
  }, [filtered]);

  // Generate month options (last 12 months)
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return d.toISOString().slice(0, 7);
  });

  return (
    <HostLayout title="Cost Log">
      <div className="max-w-3xl space-y-6">
        {/* Month filter + Add */}
        <div className="flex items-center gap-3">
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m}>
                  {new Date(m + "-01").toLocaleString("default", { month: "long", year: "numeric" })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isReadOnly && (
            <Button onClick={() => setShowAdd(true)} className="gap-1.5 ml-auto">
              <Plus className="w-4 h-4" />
              Log Cost
            </Button>
          )}
        </div>

        {/* Monthly Summary */}
        <div className="card-premium p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-xl">
              {new Date(filterMonth + "-01").toLocaleString("default", { month: "long", year: "numeric" })}
            </h2>
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-muted-foreground" />
              <span className="text-2xl font-semibold">${summary.total.toFixed(2)}</span>
            </div>
          </div>

          {Object.keys(summary.byCategory).length > 0 && (
            <>
              <div className="divider" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.entries(summary.byCategory).map(([cat, amount]) => (
                  <div key={cat} className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/50">
                    <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[cat]}</span>
                    <span className="text-sm font-medium">${amount.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Cost List */}
        {filtered.length === 0 ? (
          <div className="card-premium p-10 text-center text-muted-foreground space-y-3">
            <DollarSign className="w-8 h-8 mx-auto opacity-30" />
            <p>No costs logged for this month.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((cost) => (
              <div key={cost.id} className="card-premium p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`text-xs border ${CATEGORY_COLORS[cost.category]}`}>
                      {CATEGORY_LABELS[cost.category]}
                    </Badge>
                    {cost.vendor && <span className="text-sm font-medium">{cost.vendor}</span>}
                  </div>
                  {cost.description && <p className="text-sm text-muted-foreground truncate">{cost.description}</p>}
                  <p className="text-xs text-muted-foreground">
                     {formatDate(cost.costDate, { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-semibold">${parseFloat(cost.amount).toFixed(2)}</span>
                  {!isReadOnly && (
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => deleteCost.mutate({ id: cost.id })}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Cost Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Log Cost</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Category</label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as typeof form.category })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Amount ($)</label>
                <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Vendor / Payee</label>
              <Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="e.g. Maria's Cleaning" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Description</label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="resize-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Date</label>
              <Input type="date" value={form.costDate} onChange={(e) => setForm({ ...form, costDate: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => createCost.mutate(form)} disabled={!form.amount || createCost.isPending}>
              {createCost.isPending ? "Saving..." : "Log Cost"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HostLayout>
  );
}
