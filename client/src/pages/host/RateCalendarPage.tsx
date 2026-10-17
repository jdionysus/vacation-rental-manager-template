import { useState, useMemo } from "react";
import HostLayout from "@/components/HostLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, TrendingUp, DollarSign, Edit2, Check, X,
  RefreshCw, Plus, Trash2, Info, ChevronDown, ChevronUp
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

function toDateStr(date: Date): string {
  return date.toISOString().split("T")[0];
}

function fmtMoney(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "—";
  return `$${n.toFixed(0)}`;
}

interface Comp { name: string; rate: number; }

export default function RateCalendarPage() {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showMultiplierDialog, setShowMultiplierDialog] = useState(false);
  const [newMultiplier, setNewMultiplier] = useState("1.000");
  const [showApplyRule, setShowApplyRule] = useState(false);
  const [ruleForm, setRuleForm] = useState({ startDate: "", endDate: "", overrideRate: "", cleaningFee: "", minNights: "", multiplier: "" });

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = viewDate.toLocaleString("default", { month: "long", year: "numeric" });

  const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  const { data: rates = [], refetch } = trpc.dailyRates.list.useQuery({ startDate, endDate });
  const updateRate = trpc.dailyRates.update.useMutation({ onSuccess: () => { refetch(); toast.success("Rate updated"); } });
  const upsertRate = trpc.dailyRates.upsert.useMutation({ onSuccess: () => { refetch(); toast.success("Rate saved"); } });
  const setGlobalMultiplier = trpc.dailyRates.setGlobalMultiplier.useMutation({
    onSuccess: () => { refetch(); setShowMultiplierDialog(false); toast.success("Global multiplier updated"); }
  });

  const rateMap = useMemo(() => new Map(rates.map(r => [r.date, r])), [rates]);

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  function getEffectiveRate(row: typeof rates[0] | undefined): number | null {
    if (!row) return null;
    if (row.overrideRate) return parseFloat(row.overrideRate);
    if (row.competitorRate) return Math.round(parseFloat(row.competitorRate) * parseFloat(row.multiplier));
    return null;
  }

  function getTotal(row: typeof rates[0] | undefined, nights = 1): number | null {
    const base = getEffectiveRate(row);
    if (base == null) return null;
    const fee = row?.cleaningFee ? parseFloat(row.cleaningFee) : 100;
    return base * nights + fee;
  }

  // Selected day data
  const selectedRow = selectedDate ? rateMap.get(selectedDate) : undefined;
  const [editForm, setEditForm] = useState<{
    overrideRate: string; cleaningFee: string; minNights: string;
    airbnbLow: string; airbnbHigh: string; competitorRate: string;
    comps: Comp[]; notes: string; multiplier: string;
  }>({ overrideRate: "", cleaningFee: "", minNights: "", airbnbLow: "", airbnbHigh: "", competitorRate: "", comps: [], notes: "", multiplier: "" });
  const [showCompAdd, setShowCompAdd] = useState(false);
  const [newComp, setNewComp] = useState({ name: "", rate: "" });

  function openDay(dateStr: string) {
    const row = rateMap.get(dateStr);
    setSelectedDate(dateStr);
    setEditForm({
      overrideRate: row?.overrideRate ? parseFloat(row.overrideRate).toFixed(0) : "",
      cleaningFee: row?.cleaningFee ? parseFloat(row.cleaningFee).toFixed(0) : "100",
      minNights: row?.minNights?.toString() ?? "1",
      airbnbLow: row?.airbnbLow ? parseFloat(row.airbnbLow).toFixed(0) : "",
      airbnbHigh: row?.airbnbHigh ? parseFloat(row.airbnbHigh).toFixed(0) : "",
      competitorRate: row?.competitorRate ? parseFloat(row.competitorRate).toFixed(0) : "",
      comps: (row?.comps as Comp[] | null) ?? [],
      notes: row?.notes ?? "",
      multiplier: row?.multiplier ? parseFloat(row.multiplier).toFixed(3) : "1.000",
    });
  }

  function saveDay() {
    if (!selectedDate) return;
    const row = rateMap.get(selectedDate);
    const payload = {
      overrideRate: editForm.overrideRate || null,
      cleaningFee: editForm.cleaningFee || "100",
      minNights: parseInt(editForm.minNights) || 1,
      airbnbLow: editForm.airbnbLow || null,
      airbnbHigh: editForm.airbnbHigh || null,
      competitorRate: editForm.competitorRate || null,
      comps: editForm.comps.length > 0 ? editForm.comps : null,
      notes: editForm.notes || null,
      multiplier: editForm.multiplier || "1.000",
    };
    if (row) {
      updateRate.mutate({ id: row.id, ...payload });
    } else {
      upsertRate.mutate({ date: selectedDate, ...payload });
    }
    setSelectedDate(null);
  }

  function applyRule() {
    if (!ruleForm.startDate || !ruleForm.endDate) { toast.error("Select a date range"); return; }
    const start = new Date(ruleForm.startDate + "T12:00:00");
    const end = new Date(ruleForm.endDate + "T12:00:00");
    const dates: string[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(toDateStr(new Date(d)));
    }
    const payload: Record<string, string | number | null> = {};
    if (ruleForm.overrideRate) payload.overrideRate = ruleForm.overrideRate;
    if (ruleForm.cleaningFee) payload.cleaningFee = ruleForm.cleaningFee;
    if (ruleForm.minNights) payload.minNights = parseInt(ruleForm.minNights);
    if (ruleForm.multiplier) payload.multiplier = ruleForm.multiplier;
    Promise.all(dates.map(date => upsertRate.mutateAsync({ date, ...payload } as any)))
      .then(() => { refetch(); setShowApplyRule(false); toast.success(`Applied to ${dates.length} dates`); })
      .catch(() => toast.error("Some dates failed to update"));
  }

  // Stats
  const priced = rates.filter(r => r.competitorRate || r.overrideRate);
  const effectiveRates = priced.map(r => getEffectiveRate(r)).filter(Boolean) as number[];
  const avgRate = effectiveRates.length ? Math.round(effectiveRates.reduce((a, b) => a + b, 0) / effectiveRates.length) : 0;
  const maxRate = effectiveRates.length ? Math.max(...effectiveRates) : 0;
  const currentMultiplier = rates[0]?.multiplier ? parseFloat(rates[0].multiplier) : 1.0;

  const effective = selectedRow ? getEffectiveRate(selectedRow) : (editForm.overrideRate ? parseInt(editForm.overrideRate) : null);
  const cleaningFeeNum = parseFloat(editForm.cleaningFee) || 100;
  const totalPreview = effective != null ? effective + cleaningFeeNum : null;

  return (
    <HostLayout title="Rate Calendar">
      <div className="max-w-5xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setViewDate(new Date(year, month - 1, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="font-serif text-xl w-48 text-center">{monthName}</span>
            <Button variant="ghost" size="icon" onClick={() => setViewDate(new Date(year, month + 1, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setShowApplyRule(true)} className="gap-1.5">
              <Edit2 className="w-3.5 h-3.5" />
              Apply Rule
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setNewMultiplier(currentMultiplier.toFixed(3)); setShowMultiplierDialog(true); }} className="gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              Multiplier: {(currentMultiplier * 100).toFixed(0)}%
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Avg Rate", value: avgRate ? `$${avgRate}` : "—" },
            { label: "Peak Rate", value: maxRate ? `$${maxRate}` : "—" },
            { label: "Dates Priced", value: `${priced.length}/${daysInMonth}` },
            { label: "Avg Total (1 night)", value: avgRate ? `$${avgRate + 100}` : "—" },
          ].map(s => (
            <div key={s.label} className="card-premium p-3 text-center">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="font-semibold text-lg">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-4">
          {/* Calendar grid */}
          <div className="flex-1 min-w-0 card-premium overflow-hidden">
            <div className="grid grid-cols-7 border-b border-border">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((date, i) => {
                if (!date) return <div key={`e-${i}`} className="border-b border-r border-border/40 min-h-[72px]" />;
                const dateStr = toDateStr(date);
                const row = rateMap.get(dateStr);
                const eff = getEffectiveRate(row);
                const comp = row?.competitorRate ? parseFloat(row.competitorRate) : null;
                const hasOverride = !!row?.overrideRate;
                const isPast = date < new Date(today.getFullYear(), today.getMonth(), today.getDate());
                const isToday = dateStr === toDateStr(today);
                const isSelected = selectedDate === dateStr;
                const total = getTotal(row);
                const airbnbLow = row?.airbnbLow ? parseFloat(row.airbnbLow) : null;
                const airbnbHigh = row?.airbnbHigh ? parseFloat(row.airbnbHigh) : null;

                return (
                  <div
                    key={dateStr}
                    className={`border-b border-r border-border/40 min-h-[72px] p-1.5 transition-colors cursor-pointer
                      ${isSelected ? "bg-primary/10 ring-1 ring-inset ring-primary/30" : ""}
                      ${isToday && !isSelected ? "bg-primary/5" : ""}
                      ${isPast ? "opacity-40" : "hover:bg-secondary/30"}
                    `}
                    onClick={() => !isPast && openDay(dateStr)}
                  >
                    <div className={`text-xs font-medium mb-0.5 w-5 h-5 flex items-center justify-center rounded-full
                      ${isToday ? "bg-primary text-primary-foreground" : "text-foreground"}
                    `}>
                      {date.getDate()}
                    </div>
                    {eff !== null && (
                      <div className={`text-xs font-semibold ${hasOverride ? "text-amber-600" : "text-foreground"}`}>
                        {fmtMoney(eff)}{hasOverride && <span className="ml-0.5 text-[9px]">✎</span>}
                      </div>
                    )}
                    {total !== null && (
                      <div className="text-[9px] text-muted-foreground/70">tot: {fmtMoney(total)}</div>
                    )}
                    {comp !== null && !hasOverride && (
                      <div className="text-[9px] text-muted-foreground/50">🏨 {fmtMoney(comp)}</div>
                    )}
                    {airbnbLow !== null && (
                      <div className="text-[9px] text-rose-500/70">
                        ✈ {fmtMoney(airbnbLow)}{airbnbHigh ? `–${fmtMoney(airbnbHigh)}` : ""}
                      </div>
                    )}
                    {!eff && !isPast && (
                      <div className="text-[9px] text-muted-foreground/30">no rate</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Day editor panel */}
          {selectedDate && (
            <div className="w-72 shrink-0 card-premium p-4 space-y-4 self-start sticky top-20">
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-base">
                  {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </h3>
                <button onClick={() => setSelectedDate(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Total preview */}
              {totalPreview !== null && (
                <div className="rounded-lg bg-primary/5 border border-primary/10 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total (1 night)</p>
                  <p className="font-bold text-xl">{fmtMoney(totalPreview)}</p>
                  <p className="text-xs text-muted-foreground">{fmtMoney(effective)} + {fmtMoney(cleaningFeeNum)} cleaning</p>
                </div>
              )}

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Override Rate</label>
                    <Input value={editForm.overrideRate} onChange={e => setEditForm(f => ({ ...f, overrideRate: e.target.value }))}
                      placeholder="e.g. 250" className="h-8 text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Cleaning Fee</label>
                    <Input value={editForm.cleaningFee} onChange={e => setEditForm(f => ({ ...f, cleaningFee: e.target.value }))}
                      placeholder="100" className="h-8 text-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Min Nights</label>
                    <Input value={editForm.minNights} onChange={e => setEditForm(f => ({ ...f, minNights: e.target.value }))}
                      placeholder="1" className="h-8 text-sm" type="number" min="1" />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Multiplier</label>
                    <Input value={editForm.multiplier} onChange={e => setEditForm(f => ({ ...f, multiplier: e.target.value }))}
                      placeholder="1.000" className="h-8 text-sm" />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Comparable Property Rate</label>
                  <Input value={editForm.competitorRate} onChange={e => setEditForm(f => ({ ...f, competitorRate: e.target.value }))}
                    placeholder="comp rate" className="h-8 text-sm" />
                </div>

                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Airbnb Comps (low – high)</label>
                  <div className="flex gap-1.5">
                    <Input value={editForm.airbnbLow} onChange={e => setEditForm(f => ({ ...f, airbnbLow: e.target.value }))}
                      placeholder="low" className="h-8 text-sm" />
                    <Input value={editForm.airbnbHigh} onChange={e => setEditForm(f => ({ ...f, airbnbHigh: e.target.value }))}
                      placeholder="high" className="h-8 text-sm" />
                  </div>
                </div>

                {/* Additional comps */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Other Comps</label>
                    <button onClick={() => setShowCompAdd(!showCompAdd)} className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                      <Plus className="w-2.5 h-2.5" />Add
                    </button>
                  </div>
                  {showCompAdd && (
                    <div className="flex gap-1.5 mb-1.5">
                      <Input value={newComp.name} onChange={e => setNewComp(c => ({ ...c, name: e.target.value }))}
                        placeholder="Hotel name" className="h-7 text-xs" />
                      <Input value={newComp.rate} onChange={e => setNewComp(c => ({ ...c, rate: e.target.value }))}
                        placeholder="$" className="h-7 text-xs w-16" type="number" />
                      <button onClick={() => {
                        if (!newComp.name || !newComp.rate) return;
                        setEditForm(f => ({ ...f, comps: [...f.comps, { name: newComp.name, rate: parseFloat(newComp.rate) }] }));
                        setNewComp({ name: "", rate: "" }); setShowCompAdd(false);
                      }} className="text-emerald-600 hover:text-emerald-700 shrink-0">
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  {editForm.comps.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-0.5">
                      <span className="text-muted-foreground">{c.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{fmtMoney(c.rate)}</span>
                        <button onClick={() => setEditForm(f => ({ ...f, comps: f.comps.filter((_, j) => j !== i) }))}
                          className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Notes</label>
                  <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="e.g. Holiday weekend, event in town..."
                    className="w-full text-xs border border-border rounded-lg p-2 resize-none bg-background focus:outline-none focus:ring-1 focus:ring-primary" rows={2} />
                </div>
              </div>

              <div className="flex gap-2">
                <Button size="sm" className="flex-1 gap-1.5" onClick={saveDay} disabled={updateRate.isPending || upsertRate.isPending}>
                  <Check className="w-3.5 h-3.5" />
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSelectedDate(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span><span className="font-semibold text-foreground">$250</span> Nightly rate</span>
          <span><span className="font-semibold text-foreground">tot: $350</span> Total (rate + cleaning)</span>
          <span><span className="font-semibold text-amber-600">$250 ✎</span> Manual override</span>
          <span><span className="text-muted-foreground/60">🏨 $220</span> Comparable Property comp</span>
          <span><span className="text-rose-500/70">✈ $180–$280</span> Airbnb comp range</span>
        </div>
      </div>

      {/* Global Multiplier Dialog */}
      <Dialog open={showMultiplierDialog} onOpenChange={setShowMultiplierDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="font-serif">Set Global Multiplier</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Applied to Comparable Property comp rate to calculate your nightly rate.</p>
            <div className="grid grid-cols-3 gap-2">
              {[["Match (1.0×)", "1.000"], ["+10% (1.1×)", "1.100"], ["+15% (1.15×)", "1.150"],
                ["+20% (1.2×)", "1.200"], ["+25% (1.25×)", "1.250"], ["+30% (1.3×)", "1.300"]].map(([label, value]) => (
                <Button key={value} variant={newMultiplier === value ? "default" : "outline"} size="sm" className="text-xs"
                  onClick={() => setNewMultiplier(value)}>{label}</Button>
              ))}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Custom</label>
              <Input value={newMultiplier} onChange={e => setNewMultiplier(e.target.value)} placeholder="e.g. 1.150" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMultiplierDialog(false)}>Cancel</Button>
            <Button onClick={() => setGlobalMultiplier.mutate({ multiplier: newMultiplier })} disabled={setGlobalMultiplier.isPending} className="gap-1.5">
              {setGlobalMultiplier.isPending ? <><RefreshCw className="w-4 h-4 animate-spin" />Updating...</> : "Apply to All Dates"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply Rule Dialog (replaces Pricing Rules page) */}
      <Dialog open={showApplyRule} onOpenChange={setShowApplyRule}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="font-serif">Apply Rule to Date Range</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Set pricing fields for all dates in a range at once.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Start Date</label>
                <Input type="date" value={ruleForm.startDate} onChange={e => setRuleForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">End Date</label>
                <Input type="date" value={ruleForm.endDate} onChange={e => setRuleForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Override Rate</label>
                <Input value={ruleForm.overrideRate} onChange={e => setRuleForm(f => ({ ...f, overrideRate: e.target.value }))} placeholder="leave blank to skip" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Cleaning Fee</label>
                <Input value={ruleForm.cleaningFee} onChange={e => setRuleForm(f => ({ ...f, cleaningFee: e.target.value }))} placeholder="leave blank to skip" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Min Nights</label>
                <Input value={ruleForm.minNights} onChange={e => setRuleForm(f => ({ ...f, minNights: e.target.value }))} placeholder="leave blank to skip" type="number" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Multiplier</label>
                <Input value={ruleForm.multiplier} onChange={e => setRuleForm(f => ({ ...f, multiplier: e.target.value }))} placeholder="e.g. 1.200" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Only fields with values will be updated. Blank fields are skipped.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApplyRule(false)}>Cancel</Button>
            <Button onClick={applyRule} disabled={upsertRate.isPending} className="gap-1.5">
              {upsertRate.isPending ? <><RefreshCw className="w-4 h-4 animate-spin" />Applying...</> : "Apply Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HostLayout>
  );
}
