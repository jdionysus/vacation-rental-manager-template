import { useState } from "react";
import HostLayout from "@/components/HostLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CreditCard, AlertTriangle, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/dateUtils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  charged: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-red-50 text-red-600 border-red-200",
  refunded: "bg-slate-50 text-slate-600 border-slate-200",
};

export default function DamageChargePage() {
  const { data: customers = [], isLoading } = trpc.damage.allCustomers.useQuery();
  const { data: charges = [], refetch: refetchCharges } = trpc.damage.list.useQuery({});
  const chargeMutation = trpc.damage.charge.useMutation({
    onSuccess: () => {
      refetchCharges();
      setShowCharge(null);
      toast.success("Damage charge processed successfully");
    },
    onError: (err) => {
      toast.error(err.message ?? "Charge failed. Check that the guest has a saved card.");
    },
  });

  const [showCharge, setShowCharge] = useState<number | null>(null); // stripeCustomerRecordId
  const [chargeForm, setChargeForm] = useState({ amount: "", description: "" });

  const customersWithCards = customers.filter((c) => c.stripePaymentMethodId);

  return (
    <HostLayout title="Damage Charges">
      <div className="max-w-3xl space-y-8">
        {/* Info Banner */}
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-medium mb-1">Charge guests for post-stay damage</p>
            <p>Guests who booked directly and accepted the damage policy have a card saved on file. You can charge any amount up to the agreed terms. Always document damage with photos before charging.</p>
          </div>
        </div>

        {/* Guests with saved cards */}
        <div className="space-y-4">
          <h2 className="font-serif text-xl">Guests with Saved Cards</h2>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </div>
          ) : customersWithCards.length === 0 ? (
            <div className="card-premium p-10 text-center text-muted-foreground space-y-3">
              <CreditCard className="w-8 h-8 mx-auto opacity-30" />
              <p>No guests with saved cards yet. Cards are saved when guests complete direct booking checkout.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {customersWithCards.map((customer) => (
                <div key={customer.id} className="card-premium p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <CreditCard className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="font-medium text-sm">{customer.guestName ?? "Guest"}</p>
                    <p className="text-xs text-muted-foreground">{customer.guestEmail}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {customer.cardBrand && (
                        <Badge variant="secondary" className="text-xs capitalize">{customer.cardBrand}</Badge>
                      )}
                      {customer.cardLast4 && (
                        <span className="text-xs text-muted-foreground">•••• {customer.cardLast4}</span>
                      )}
                      {customer.cardExpMonth && customer.cardExpYear && (
                        <span className="text-xs text-muted-foreground">Exp {customer.cardExpMonth}/{customer.cardExpYear}</span>
                      )}
                      {customer.damageChargeConsent && (
                        <Badge className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Damage consent
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-red-200 text-red-700 hover:bg-red-50"
                    onClick={() => { setShowCharge(customer.id); setChargeForm({ amount: "", description: "" }); }}
                  >
                    Charge Card
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Charge History */}
        {charges.length > 0 && (
          <div className="space-y-4">
            <h2 className="font-serif text-xl">Charge History</h2>
            <div className="space-y-2">
              {charges.map((charge) => (
                <div key={charge.id} className="card-premium p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-sm font-medium">{charge.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(charge.createdAt, { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-semibold">${parseFloat(charge.amount).toFixed(2)}</span>
                    <Badge className={`text-xs border ${STATUS_STYLES[charge.status]}`}>
                      {charge.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Charge Dialog */}
      <Dialog open={showCharge !== null} onOpenChange={(open) => !open && setShowCharge(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Charge Guest Card</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>This will immediately charge the guest's saved card. Ensure you have documented the damage before proceeding.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Amount ($)</label>
              <Input
                type="number" step="0.01" min="0.50"
                value={chargeForm.amount}
                onChange={(e) => setChargeForm({ ...chargeForm, amount: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Description (shown to guest)</label>
              <Textarea
                value={chargeForm.description}
                onChange={(e) => setChargeForm({ ...chargeForm, description: e.target.value })}
                placeholder="e.g. Broken window in bedroom, replacement cost $150"
                rows={3}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCharge(null)}>Cancel</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white gap-1.5"
              disabled={!chargeForm.amount || !chargeForm.description || chargeMutation.isPending || parseFloat(chargeForm.amount) < 0.5}
              onClick={() => {
                if (showCharge !== null) {
                  chargeMutation.mutate({
                    stripeCustomerRecordId: showCharge,
                    amount: parseFloat(chargeForm.amount),
                    description: chargeForm.description,
                  });
                }
              }}
            >
              {chargeMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
              ) : (
                <><CreditCard className="w-4 h-4" /> Charge ${chargeForm.amount || "0.00"}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HostLayout>
  );
}
