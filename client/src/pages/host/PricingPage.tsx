import { useState } from "react";
import HostLayout from "@/components/HostLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, DollarSign, Calendar, TrendingUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

export default function PricingPage() {
  const { data: property } = trpc.property.get.useQuery();
  const { data: rules = [], refetch } = trpc.pricing.list.useQuery();
  const createRule = trpc.pricing.create.useMutation({ onSuccess: () => { refetch(); setShowAdd(false); toast.success("Pricing rule added"); } });
  const updateRule = trpc.pricing.update.useMutation({ onSuccess: () => { refetch(); toast.success("Updated"); } });
  const deleteRule = trpc.pricing.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Deleted"); } });
  const updateProperty = trpc.property.update.useMutation({
    onSuccess: () => toast.success("Base rate saved"),
    onError: (err) => toast.error(err.message ?? "Failed to save base rate"),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [baseRate, setBaseRate] = useState("");
  const [cleaningFee, setCleaningFee] = useState("");

  // Sync state when property data loads
  if (property?.nightlyRate && !baseRate) setBaseRate(String(property.nightlyRate));
  if (property?.cleaningFee && !cleaningFee) setCleaningFee(String(property.cleaningFee));
  const [form, setForm] = useState({ name: "", startDate: "", endDate: "", nightlyRate: "", minNights: 1, priority: 0 });

  return (
    <HostLayout title="Pricing">
      <div className="max-w-3xl space-y-8">
        {/* Base Rate */}
        <div className="card-premium p-6 space-y-4">
          <h2 className="font-serif text-xl flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-muted-foreground" />
            Base Pricing
          </h2>
          <p className="text-sm text-muted-foreground">Default rates applied when no seasonal rule matches.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Base Nightly Rate ($)</label>
              <Input
                type="number" step="0.01"
                value={baseRate}
                onChange={(e) => setBaseRate(e.target.value)}
                placeholder="150.00"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Cleaning Fee ($)</label>
              <Input
                type="number" step="0.01"
                value={cleaningFee}
                onChange={(e) => setCleaningFee(e.target.value)}
                placeholder="75.00"
              />
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => updateProperty.mutate({ nightlyRate: baseRate, cleaningFee })}
            disabled={updateProperty.isPending}
          >
            Save Base Rates
          </Button>
        </div>

        {/* Seasonal Rules */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-serif text-xl flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-muted-foreground" />
                Seasonal Pricing Rules
              </h2>
              <p className="text-sm text-muted-foreground mt-1">Override the base rate for specific date ranges. Higher priority rules take precedence.</p>
            </div>
            <Button onClick={() => setShowAdd(true)} className="gap-1.5">
              <Plus className="w-4 h-4" />
              Add Rule
            </Button>
          </div>

          {rules.length === 0 ? (
            <div className="card-premium p-10 text-center text-muted-foreground space-y-3">
              <Calendar className="w-8 h-8 mx-auto opacity-30" />
              <p>No seasonal rules yet. Add rules for holidays, peak seasons, or special events.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => (
                <div key={rule.id} className={`card-premium p-4 flex items-center gap-4 ${!rule.isActive ? "opacity-50" : ""}`}>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{rule.name}</span>
                      {!rule.isActive && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                      {(rule.priority ?? 0) > 0 && <Badge variant="secondary" className="text-xs">Priority {rule.priority}</Badge>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {String(rule.startDate).split("T")[0]} → {String(rule.endDate).split("T")[0]}
                      </span>
                      {rule.minNights && rule.minNights > 1 && <span>Min {rule.minNights} nights</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-lg font-semibold">${parseFloat(rule.nightlyRate).toFixed(0)}<span className="text-xs text-muted-foreground font-normal">/night</span></span>
                    <Switch
                      checked={rule.isActive ?? true}
                      onCheckedChange={(v) => updateRule.mutate({ id: rule.id, isActive: v })}
                    />
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => deleteRule.mutate({ id: rule.id })}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Rule Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Add Pricing Rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Rule Name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Summer Peak, Christmas Week" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Start Date</label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">End Date</label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Nightly Rate ($)</label>
                <Input type="number" step="0.01" value={form.nightlyRate} onChange={(e) => setForm({ ...form, nightlyRate: e.target.value })} placeholder="200.00" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Min Nights</label>
                <Input type="number" min={1} value={form.minNights} onChange={(e) => setForm({ ...form, minNights: parseInt(e.target.value) })} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Priority (higher = takes precedence)</label>
              <Input type="number" min={0} value={form.priority} onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button
              onClick={() => createRule.mutate(form)}
              disabled={!form.name || !form.startDate || !form.endDate || !form.nightlyRate || createRule.isPending}
            >
              {createRule.isPending ? "Adding..." : "Add Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HostLayout>
  );
}
