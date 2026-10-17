import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import HostLayout from "@/components/HostLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/dateUtils";
import { toast } from "sonner";
import { Banknote, Check, CircleDollarSign, Pencil, Plus, ReceiptText, Trash2, UserRoundPlus, WalletCards } from "lucide-react";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const money = (value: string | number | null | undefined) => currency.format(Number(value ?? 0));
const monthLabel = (month: string) => new Date(`${month}-01T12:00:00`).toLocaleString("en-US", { month: "long", year: "numeric" });
const dateValue = (value: Date | string | null | undefined) => value ? String(value).slice(0, 10) : "";
const COST_CATEGORIES = ["cleaning", "supplies", "repairs", "platform_fee", "utilities", "other"] as const;
const SOURCE_LABELS: Record<string, string> = { airbnb: "Airbnb", vrbo: "Vrbo", booking_com: "Booking.com", direct: "Direct", other: "Other" };

export default function FinancialsPage() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const monthInput = useMemo(() => ({ month }), [month]);
  const utils = trpc.useUtils();
  const { data: ledger, isLoading } = trpc.financials.month.useQuery(monthInput);
  const { data: cohosts = [] } = trpc.financials.cohosts.useQuery();
  const [payoutRow, setPayoutRow] = useState<any>(null);
  const [payoutForm, setPayoutForm] = useState({ grossRevenue: "", platformFees: "", cleaningFeeCollected: "0", netReceived: "", revenueReceivedAt: "", notes: "" });
  const [expenseRow, setExpenseRow] = useState<any>(null);
  const [editingExpense, setEditingExpense] = useState<any>(null);
  const [expenseForm, setExpenseForm] = useState({ category: "cleaning", amount: "", vendor: "", description: "", costDate: new Date().toISOString().slice(0, 10) });
  const [showCohost, setShowCohost] = useState(false);
  const [cohostForm, setCohostForm] = useState({ name: "Host", ratePercent: "25", notes: "" });

  const refresh = () => {
    void utils.financials.month.invalidate(monthInput);
    void utils.financials.cohosts.invalidate();
    void utils.costs.list.invalidate();
  };
  const savePayout = trpc.financials.upsertReservation.useMutation({
    onSuccess: () => { refresh(); setPayoutRow(null); toast.success("Reservation payout saved"); },
    onError: (error) => toast.error(error.message),
  });
  const addExpense = trpc.costs.create.useMutation({
    onSuccess: () => { refresh(); setExpenseRow(null); setEditingExpense(null); toast.success("Stay expense logged"); },
    onError: (error) => toast.error(error.message),
  });
  const updateExpense = trpc.costs.update.useMutation({
    onSuccess: () => { refresh(); setExpenseRow(null); setEditingExpense(null); toast.success("Stay expense updated"); },
    onError: (error) => toast.error(error.message),
  });
  const deleteExpense = trpc.costs.delete.useMutation({
    onSuccess: () => { refresh(); setExpenseRow(null); setEditingExpense(null); toast.success("Stay expense removed"); },
    onError: (error) => toast.error(error.message),
  });
  const addCohost = trpc.financials.createCohost.useMutation({
    onSuccess: () => { refresh(); setShowCohost(false); setCohostForm({ name: "", ratePercent: "25", notes: "" }); toast.success("Co-host added"); },
    onError: (error) => toast.error(error.message),
  });
  const updateCohost = trpc.financials.updateCohost.useMutation({
    onSuccess: () => { refresh(); toast.success("Co-host terms saved for the current and future months"); },
    onError: (error) => toast.error(error.message),
  });

  const openPayout = (row: any) => {
    const financial = row.financial;
    setPayoutRow(row);
    setPayoutForm({
      grossRevenue: financial ? String(financial.grossRevenue ?? "") : String(row.grossRevenue ?? ""),
      platformFees: financial ? String(financial.platformFees ?? "") : "0",
      cleaningFeeCollected: financial ? String(financial.cleaningFeeCollected ?? "0") : "0",
      netReceived: financial?.netReceived !== null && financial?.netReceived !== undefined ? String(financial.netReceived) : String(row.netReceived ?? ""),
      revenueReceivedAt: dateValue(financial?.revenueReceivedAt),
      notes: financial?.notes ?? "",
    });
  };
  const openExpense = (row: any, cost?: any) => {
    setExpenseRow(row);
    setEditingExpense(cost ?? null);
    setExpenseForm(cost ? { category: cost.category, amount: String(cost.amount ?? ""), vendor: cost.vendor ?? "", description: cost.description ?? "", costDate: dateValue(cost.costDate) } : { category: "cleaning", amount: "", vendor: "", description: "", costDate: new Date().toISOString().slice(0, 10) });
  };
  const rows = ledger?.reservations ?? [];
  const cohostAmounts = ledger?.cohostAmounts ?? [];
  const payoutPreviewEligibleRevenue = Math.max(0, (Number.parseFloat(payoutForm.netReceived) || 0) - (Number.parseFloat(payoutForm.cleaningFeeCollected) || 0));

  return <HostLayout title="Financials">
    <div className="max-w-7xl space-y-6">
      <section className="card-premium overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div><h2 className="font-serif text-xl">All reservations</h2><p className="mt-1 text-sm text-muted-foreground">Record the actual payout and direct stay expenses for each reservation. Every active stay stays available here, regardless of its checkout month.</p></div>
          <Badge variant="secondary" className="w-fit">{rows.length} reservations</Badge>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1020px] text-sm"><thead className="bg-muted/45 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Reservation</th><th className="px-4 py-3 font-medium">Actual payout</th><th className="px-4 py-3 font-medium">Stay expenses</th><th className="px-4 py-3 font-medium">Net profit</th><th className="px-5 py-3 text-right font-medium">Actions</th></tr></thead><tbody className="divide-y divide-border">
          {rows.map((row: any) => {
            const hasPayout = !!row.financial?.revenueReceivedAt;
            const expenses = row.expenses ?? [];
            return <tr key={row.reservation.id} className="align-top hover:bg-muted/25"><td className="px-5 py-4"><div className="flex items-center gap-2"><p className="font-medium">{row.reservation.guestName || "Reservation"}</p><Badge variant="outline" className="font-normal">{SOURCE_LABELS[row.reservation.source] ?? row.reservation.source}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{formatDate(row.reservation.arrivalDate)} – {formatDate(row.reservation.departureDate)}</p></td><td className="px-4 py-4">{hasPayout ? <><p className="font-medium">{money(row.netReceived)} received</p><p className="mt-1 text-xs text-muted-foreground">Gross {money(row.grossRevenue)} · Fees {money(row.platformFees)} · Cleaning {money(row.cleaningFeeCollected)} · {formatDate(row.financial.revenueReceivedAt)}</p></> : <span className="text-muted-foreground">Not recorded</span>}</td><td className="px-4 py-4"><p className="font-medium">{money(row.stayExpenses)}</p><p className="mt-1 text-xs text-muted-foreground">{expenses.length} item{expenses.length === 1 ? "" : "s"}</p></td><td className="px-4 py-4 font-medium">{hasPayout ? money(row.netProfit) : "—"}</td><td className="px-5 py-4"><div className="flex justify-end gap-2"><Button size="sm" variant={hasPayout ? "outline" : "default"} onClick={() => openPayout(row)}>{hasPayout ? <Pencil className="mr-1.5 h-3.5 w-3.5" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}{hasPayout ? "Edit payout" : "Add payout"}</Button><Button size="sm" variant="outline" onClick={() => openExpense(row)}>{expenses.length ? "Edit expenses" : "Add expense"}</Button></div></td></tr>;
          })}
          {!isLoading && !rows.length && <tr><td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">No active reservations are available yet.</td></tr>}
        </tbody></table></div>
      </section>

      <section className="card-premium p-5">
        <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-serif text-xl">Monthly summary</h2><p className="mt-1 text-sm text-muted-foreground">Totals are based on the date an actual payout was received, not the checkout date.</p></div><Input aria-label="Financial month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-40" /></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-7"><SummaryCard label="Reservations paid" value={isLoading ? "—" : String(ledger?.monthlyReservations.length ?? 0)} description={monthLabel(month)} icon={<CircleDollarSign className="h-4 w-4 text-primary" />} /><SummaryCard label="Gross revenue" value={isLoading ? "—" : money(ledger?.totalGrossRevenue)} description="Actual payout records" icon={<CircleDollarSign className="h-4 w-4 text-emerald-600" />} /><SummaryCard label="Platform fees" value={isLoading ? "—" : money(ledger?.totalPlatformFees)} description="Reported against stays" icon={<ReceiptText className="h-4 w-4 text-amber-600" />} /><SummaryCard label="Net received" value={isLoading ? "—" : money(ledger?.totalNetReceived)} description="Actual platform transfers" icon={<Banknote className="h-4 w-4 text-primary" />} /><SummaryCard label="Cleaning fees collected" value={isLoading ? "—" : money(ledger?.totalCleaningFeesCollected)} description="Excluded from co-host fees" icon={<ReceiptText className="h-4 w-4 text-amber-600" />} /><SummaryCard label="Co-host eligible" value={isLoading ? "—" : money(ledger?.totalCohostEligibleRevenue)} description="Net received less cleaning" icon={<CircleDollarSign className="h-4 w-4 text-primary" />} /><SummaryCard label="Net profit" value={isLoading ? "—" : money(ledger?.totalNetProfit)} description="Received less stay expenses" icon={<WalletCards className="h-4 w-4 text-emerald-600" />} /></div>
        {!isLoading && !(ledger?.monthlyReservations.length ?? 0) && <p className="mt-5 rounded-xl bg-muted/45 px-4 py-3 text-sm text-muted-foreground">No reservation payouts are dated in {monthLabel(month)} yet. Add a payout to a reservation above when the transfer is received.</p>}
      </section>

      <section className="card-premium overflow-hidden"><div className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-serif text-xl">Co-host fees</h2><p className="mt-1 text-sm text-muted-foreground">Calculated automatically from {monthLabel(month)} net received less cleaning fees collected. The running amount is finalized when the month ends.</p></div><Badge variant="secondary" className="w-fit">Automatic</Badge></div><div className="grid gap-3 p-5 md:grid-cols-2">{cohostAmounts.map((cohost: any) => <div key={cohost.cohostId} className="rounded-xl border border-border p-4"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><p className="font-medium">{cohost.name}</p>{cohost.isFinal && <Badge variant="outline" className="gap-1 border-emerald-600/30 text-emerald-700"><Check className="h-3 w-3" /> Final</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">{cohost.ratePercent}% of {money(ledger?.totalCohostEligibleRevenue)} eligible revenue</p></div><div className="text-right"><p className="font-serif text-2xl">{money(cohost.amountDue)}</p><p className="text-xs text-muted-foreground">{cohost.isFinal ? "Final amount" : "Running amount"}</p></div></div></div>)}{!cohostAmounts.length && <p className="rounded-xl bg-muted/45 p-4 text-sm text-muted-foreground">Add a co-host below to calculate a monthly amount due.</p>}</div></section>

      <section className="card-premium p-5"><div className="mb-4 flex items-start justify-between"><div><h2 className="font-serif text-xl">Co-host settings</h2><p className="mt-1 text-sm text-muted-foreground">Rates apply to the current and future months. Finalized monthly records keep their original percentage and amount.</p></div><Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowCohost(true)}><UserRoundPlus className="h-4 w-4" /> Add co-host</Button></div><div className="space-y-3">{cohosts.map((cohost: any) => <CohostTerms key={cohost.id} cohost={cohost} onSave={(data) => updateCohost.mutate(data)} isSaving={updateCohost.isPending} />)}{!cohosts.length && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Add Host or another co-host to begin automatic monthly fee calculations.</p>}</div></section>
    </div>

    <Dialog open={!!payoutRow} onOpenChange={(open) => !open && setPayoutRow(null)}><DialogContent><DialogHeader><DialogTitle>{payoutRow?.financial ? "Edit reservation payout" : "Add reservation payout"}</DialogTitle></DialogHeader><div className="space-y-4"><p className="text-sm text-muted-foreground">Record the actual platform amount received for this stay. The cleaning fee is collected revenue, not a cleaning expense, and is excluded from the co-host percentage.</p><div className="grid gap-4 sm:grid-cols-2"><Field label="Gross amount (including cleaning)"><Input inputMode="decimal" value={payoutForm.grossRevenue} onChange={(event) => setPayoutForm({ ...payoutForm, grossRevenue: event.target.value })} /></Field><Field label="Platform fees"><Input inputMode="decimal" value={payoutForm.platformFees} onChange={(event) => setPayoutForm({ ...payoutForm, platformFees: event.target.value })} /></Field><Field label="Cleaning fee collected"><Input inputMode="decimal" value={payoutForm.cleaningFeeCollected} onChange={(event) => setPayoutForm({ ...payoutForm, cleaningFeeCollected: event.target.value })} /></Field><Field label="Net received"><Input inputMode="decimal" value={payoutForm.netReceived} onChange={(event) => setPayoutForm({ ...payoutForm, netReceived: event.target.value })} /></Field><Field label="Payout received date"><Input type="date" value={payoutForm.revenueReceivedAt} onChange={(event) => setPayoutForm({ ...payoutForm, revenueReceivedAt: event.target.value })} /></Field></div><div className="rounded-lg bg-muted/45 px-3 py-2 text-sm"><span className="font-medium">Co-host eligible revenue: {money(payoutPreviewEligibleRevenue)}</span><span className="ml-1 text-muted-foreground">(net received less cleaning fee collected)</span></div><Field label="Note"><Textarea value={payoutForm.notes} onChange={(event) => setPayoutForm({ ...payoutForm, notes: event.target.value })} /></Field></div><DialogFooter><Button variant="outline" onClick={() => setPayoutRow(null)}>Cancel</Button><Button disabled={savePayout.isPending || !payoutForm.grossRevenue || !payoutForm.netReceived || !payoutForm.revenueReceivedAt} onClick={() => payoutRow && savePayout.mutate({ reservationId: payoutRow.reservation.id, ...payoutForm, notes: payoutForm.notes || null })}>{payoutRow?.financial ? "Save payout" : "Record payout"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={!!expenseRow} onOpenChange={(open) => !open && (setExpenseRow(null), setEditingExpense(null))}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{editingExpense ? "Edit stay expense" : "Stay expenses"}</DialogTitle></DialogHeader>{!editingExpense ? <div className="space-y-2 rounded-xl border border-border p-3">{expenseRow?.expenses?.length ? expenseRow.expenses.map((cost: any) => <div key={cost.id} className="flex items-center justify-between gap-3 text-sm"><div><p className="font-medium">{money(cost.amount)} · {cost.category.replace(/_/g, " ")}</p><p className="text-xs text-muted-foreground">{dateValue(cost.costDate)}{cost.vendor ? ` · ${cost.vendor}` : ""}</p></div><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => openExpense(expenseRow, cost)}><Pencil className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={deleteExpense.isPending} onClick={() => { if (window.confirm("Remove this stay expense?")) deleteExpense.mutate({ id: cost.id }); }}><Trash2 className="h-3.5 w-3.5" /></Button></div></div>) : <p className="text-sm text-muted-foreground">No stay expenses are linked to this reservation yet.</p>}<Button size="sm" variant="outline" onClick={() => { setEditingExpense({}); setExpenseForm({ category: "cleaning", amount: "", vendor: "", description: "", costDate: new Date().toISOString().slice(0, 10) }); }}><Plus className="mr-1.5 h-3.5 w-3.5" /> Add expense</Button></div> : <div className="space-y-4"><Field label="Category"><Select value={expenseForm.category} onValueChange={(category) => setExpenseForm({ ...expenseForm, category })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{COST_CATEGORIES.map((category) => <SelectItem value={category} key={category}>{category.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select></Field><Field label="Amount"><Input inputMode="decimal" value={expenseForm.amount} onChange={(event) => setExpenseForm({ ...expenseForm, amount: event.target.value })} /></Field><Field label="Vendor"><Input value={expenseForm.vendor} onChange={(event) => setExpenseForm({ ...expenseForm, vendor: event.target.value })} /></Field><Field label="Date"><Input type="date" value={expenseForm.costDate} onChange={(event) => setExpenseForm({ ...expenseForm, costDate: event.target.value })} /></Field><Field label="Description"><Textarea value={expenseForm.description} onChange={(event) => setExpenseForm({ ...expenseForm, description: event.target.value })} /></Field></div>}<DialogFooter>{editingExpense ? <><Button variant="outline" onClick={() => setEditingExpense(null)}>Back</Button><Button disabled={addExpense.isPending || updateExpense.isPending || !expenseForm.amount} onClick={() => { const payload = { category: expenseForm.category as any, amount: expenseForm.amount, vendor: expenseForm.vendor || undefined, description: expenseForm.description || undefined, costDate: expenseForm.costDate }; if (editingExpense.id) updateExpense.mutate({ id: editingExpense.id, ...payload }); else if (expenseRow) addExpense.mutate({ reservationId: expenseRow.reservation.id, ...payload }); }}>{editingExpense.id ? "Save expense" : "Log expense"}</Button></> : <Button variant="outline" onClick={() => { setExpenseRow(null); setEditingExpense(null); }}>Done</Button>}</DialogFooter></DialogContent></Dialog>

    <Dialog open={showCohost} onOpenChange={setShowCohost}><DialogContent><DialogHeader><DialogTitle>Add co-host</DialogTitle></DialogHeader><div className="space-y-4"><Field label="Name"><Input value={cohostForm.name} onChange={(event) => setCohostForm({ ...cohostForm, name: event.target.value })} /></Field><Field label="Fee percentage"><Input inputMode="decimal" value={cohostForm.ratePercent} onChange={(event) => setCohostForm({ ...cohostForm, ratePercent: event.target.value })} /></Field><Field label="Note"><Textarea value={cohostForm.notes} onChange={(event) => setCohostForm({ ...cohostForm, notes: event.target.value })} /></Field></div><DialogFooter><Button variant="outline" onClick={() => setShowCohost(false)}>Cancel</Button><Button disabled={addCohost.isPending || !cohostForm.name || !cohostForm.ratePercent} onClick={() => addCohost.mutate({ ...cohostForm, payoutBasis: "after_platform_fees_less_cleaning", notes: cohostForm.notes || null })}><Plus className="mr-1.5 h-4 w-4" /> Add co-host</Button></DialogFooter></DialogContent></Dialog>
  </HostLayout>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-sm font-medium">{label}</span>{children}</label>;
}

function SummaryCard({ label, value, description, icon }: { label: string; value: string; description: string; icon: ReactNode }) {
  return <div className="rounded-xl border border-border p-4"><div className="flex items-center justify-between gap-2"><span className="text-sm text-muted-foreground">{label}</span>{icon}</div><p className="mt-2 font-serif text-2xl">{value}</p><p className="mt-1 text-xs text-muted-foreground">{description}</p></div>;
}

function CohostTerms({ cohost, onSave, isSaving }: { cohost: any; onSave: (data: any) => void; isSaving: boolean }) {
  const [form, setForm] = useState(() => ({ name: cohost.name, ratePercent: String(cohost.ratePercent), notes: cohost.notes ?? "" }));
  return <div className="rounded-xl border border-border p-4"><div className="grid gap-3 sm:grid-cols-[1.2fr_.65fr_auto]"><Input aria-label="Co-host name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><Input aria-label="Co-host fee percentage" inputMode="decimal" value={form.ratePercent} onChange={(event) => setForm({ ...form, ratePercent: event.target.value })} /><Button size="sm" disabled={isSaving} onClick={() => onSave({ id: cohost.id, ...form, payoutBasis: "after_platform_fees_less_cleaning", notes: form.notes || null })}>Save</Button></div><p className="mt-2 text-xs text-muted-foreground">This percentage applies to net payouts after cleaning fees collected are excluded. Finalized monthly records are not changed by later updates.</p></div>;
}
