import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import HostLayout from "@/components/HostLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, Key, Copy, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { formatDate } from "@/lib/dateUtils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  checked_in: "bg-blue-50 text-blue-700 border-blue-200",
  checked_out: "bg-slate-50 text-slate-600 border-slate-200",
  cancelled: "bg-red-50 text-red-600 border-red-200",
};

type ReservationForm = {
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  guestCount: number;
  arrivalDate: string;
  departureDate: string;
  notes: string;
};

const emptyReservationForm: ReservationForm = {
  guestName: "",
  guestEmail: "",
  guestPhone: "",
  guestCount: 1,
  arrivalDate: "",
  departureDate: "",
  notes: "",
};

function toDateInput(value: Date | string | null | undefined) {
  if (!value) return "";
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

export default function ReservationDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const id = parseInt(params.id ?? "0");

  const { data: res, isLoading, refetch } = trpc.reservations.get.useQuery({ id });
  const { data: codes = [], refetch: refetchCodes } = trpc.reservations.getCodes.useQuery({ reservationId: id });
  const [isEditing, setIsEditing] = useState(false);
  const [originalForm, setOriginalForm] = useState<ReservationForm>(emptyReservationForm);
  const [form, setForm] = useState<ReservationForm>(emptyReservationForm);
  const updateRes = trpc.reservations.update.useMutation({ onSuccess: () => { setIsEditing(false); refetch(); toast.success("Updated"); } });
  const deleteRes = trpc.reservations.delete.useMutation({ onSuccess: () => { navigate("/host/reservations"); toast.success("Deleted"); } });
  const genCode = trpc.reservations.generateCode.useMutation({ onSuccess: (r) => { refetchCodes(); toast.success(`Code generated: ${r.code}`); } });
  const revokeCode = trpc.reservations.revokeCode.useMutation({ onSuccess: () => { refetchCodes(); toast.success("Code revoked"); } });

  useEffect(() => {
    if (!res) return;
    const nextForm = {
      guestName: res.guestName ?? "",
      guestEmail: res.guestEmail ?? "",
      guestPhone: res.guestPhone ?? "",
      guestCount: res.guestCount ?? 1,
      arrivalDate: toDateInput(res.arrivalDate),
      departureDate: toDateInput(res.departureDate),
      notes: res.notes ?? "",
    };
    setOriginalForm(nextForm);
    setForm(nextForm);
  }, [res]);

  const saveEdits = () => {
    const changes: {
      id: number;
      guestName?: string;
      guestEmail?: string;
      guestPhone?: string;
      guestCount?: number;
      arrivalDate?: string;
      departureDate?: string;
      notes?: string;
    } = { id };

    if (form.guestName !== originalForm.guestName) changes.guestName = form.guestName;
    if (form.guestEmail !== originalForm.guestEmail) changes.guestEmail = form.guestEmail;
    if (form.guestPhone !== originalForm.guestPhone) changes.guestPhone = form.guestPhone;
    if (form.guestCount !== originalForm.guestCount) changes.guestCount = form.guestCount;
    if (form.arrivalDate !== originalForm.arrivalDate) changes.arrivalDate = form.arrivalDate;
    if (form.departureDate !== originalForm.departureDate) changes.departureDate = form.departureDate;
    if (form.notes !== originalForm.notes) changes.notes = form.notes;

    if (Object.keys(changes).length === 1) {
      setIsEditing(false);
      return;
    }
    updateRes.mutate(changes);
  };

  if (isLoading) {
    return (
      <HostLayout title="Reservation">
        <div className="max-w-2xl space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </HostLayout>
    );
  }

  if (!res) {
    return (
      <HostLayout title="Not Found">
        <div className="text-center py-16 text-muted-foreground">
          <p>Reservation not found.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/host/reservations")}>
            Back to reservations
          </Button>
        </div>
      </HostLayout>
    );
  }

  return (
    <HostLayout title={res.guestName ?? "Reservation"}>
      <div className="max-w-2xl space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/host/reservations")} className="gap-1.5 -ml-2">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>

        {/* Main Details */}
        <div className="card-premium p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-serif text-2xl">{res.guestName ?? "Unknown Guest"}</h2>
              {res.guestEmail && <p className="text-sm text-muted-foreground mt-0.5">{res.guestEmail}</p>}
              {res.guestPhone && <p className="text-sm text-muted-foreground">{res.guestPhone}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!isEditing && <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>Edit details</Button>}
              <Badge className={`text-xs border ${STATUS_STYLES[res.status]}`}>{res.status.replace("_", " ")}</Badge>
            </div>
          </div>

          <div className="divider" />

          {isEditing ? (
            <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); saveEdits(); }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="space-y-1.5 text-sm font-medium">Guest name
                  <Input value={form.guestName} onChange={(event) => setForm({ ...form, guestName: event.target.value })} />
                </label>
                <label className="space-y-1.5 text-sm font-medium">Guest email
                  <Input type="email" value={form.guestEmail} onChange={(event) => setForm({ ...form, guestEmail: event.target.value })} />
                </label>
                <label className="space-y-1.5 text-sm font-medium">Phone
                  <Input value={form.guestPhone} onChange={(event) => setForm({ ...form, guestPhone: event.target.value })} />
                </label>
                <label className="space-y-1.5 text-sm font-medium">Guests
                  <Input type="number" min="1" value={form.guestCount} onChange={(event) => setForm({ ...form, guestCount: Math.max(1, Number(event.target.value) || 1) })} />
                </label>
                <label className="space-y-1.5 text-sm font-medium">Arrival
                  <Input type="date" value={form.arrivalDate} onChange={(event) => setForm({ ...form, arrivalDate: event.target.value })} />
                </label>
                <label className="space-y-1.5 text-sm font-medium">Departure
                  <Input type="date" value={form.departureDate} onChange={(event) => setForm({ ...form, departureDate: event.target.value })} />
                </label>
              </div>
              <label className="block space-y-1.5 text-sm font-medium">Notes
                <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
              </label>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => { setForm(originalForm); setIsEditing(false); }}>Cancel</Button>
                <Button type="submit" disabled={updateRes.isPending}>{updateRes.isPending ? "Saving…" : "Save changes"}</Button>
              </div>
            </form>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Arrival</p>
                  <p className="font-medium">{formatDate(res.arrivalDate, { weekday: "short", month: "long", day: "numeric", year: "numeric" })}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Departure</p>
                  <p className="font-medium">{formatDate(res.departureDate, { weekday: "short", month: "long", day: "numeric", year: "numeric" })}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Guests</p>
                  <p className="font-medium">{res.guestCount ?? 1}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Source</p>
                  <p className="font-medium capitalize">{res.source.replace("_", ".")}</p>
                </div>
                {res.totalAmount && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total</p>
                    <p className="font-medium">${parseFloat(res.totalAmount).toFixed(2)}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Payment</p>
                  <p className="font-medium capitalize">{res.paymentStatus ?? "unpaid"}</p>
                </div>
              </div>

              {res.notes && (
                <>
                  <div className="divider" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                    <p className="text-sm">{res.notes}</p>
                  </div>
                </>
              )}
            </>
          )}

          <div className="divider" />

          {/* Status Update */}
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium">Status</p>
            <Select
              value={res.status}
              onValueChange={(v) => updateRes.mutate({ id, status: v as typeof res.status })}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="checked_in">Checked In</SelectItem>
                <SelectItem value="checked_out">Checked Out</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Guest Portal Access Codes */}
        <div className="card-premium p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-lg">Guest Portal Codes</h3>
            {codes.length === 0 && (
              <Button size="sm" onClick={() => genCode.mutate({ reservationId: id })} disabled={genCode.isPending} className="gap-1.5">
                <Key className="w-3.5 h-3.5" />
                Generate Code
              </Button>
            )}
          </div>

          {codes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No access codes yet. Generate one to share with your guest.</p>
          ) : (
            <div className="space-y-2">
              {codes.map((code) => (
                <div key={`${code.origin}-${code.id}`} className={`flex items-center gap-3 p-3 rounded-lg border ${code.isRevoked ? "opacity-50 bg-secondary/30 border-border" : "bg-secondary/50 border-border"}`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-lg tracking-widest">{code.code}</span>
                      {code.isRevoked ? (
                        <Badge variant="outline" className="text-xs text-red-600 border-red-200">Revoked</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200">Active</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Valid: {new Date(code.validFrom).toLocaleDateString()} → {new Date(code.validUntil).toLocaleDateString()}
                      {code.useCount ? ` · Used ${code.useCount}×` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => { navigator.clipboard.writeText(code.code); toast.success("Copied!"); }}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    {!code.isRevoked && code.origin === "reservation" && (
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => revokeCode.mutate({ codeId: code.id })}
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {res.source === "direct" && (
          <div className="card-premium p-5 border-red-100">
            <h3 className="text-sm font-medium text-red-700 mb-3">Danger Zone</h3>
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => { if (confirm("Delete this reservation?")) deleteRes.mutate({ id }); }}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Delete Reservation
            </Button>
          </div>
        )}
      </div>
    </HostLayout>
  );
}
