import { useState } from "react";
import { Link } from "wouter";
import HostLayout from "@/components/HostLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Search, ArrowRight, Calendar, User, DollarSign, Key, Copy, RefreshCw, Link as LinkIcon, Edit2, Check, Trash2 } from "lucide-react";
import { formatDate, formatDateShort } from "@/lib/dateUtils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { compareStaysByOperationalDate } from "@shared/reservation-ordering";
import { getReservationsForTimeline, isReservationCurrent, type ReservationTimelineView } from "@shared/reservation-timeline";
import {
  getCanonicalCalendarEventReservations,
  getReservationPageDisplayRecords,
  sameCalendarEventReference,
  shouldRenderPastImportedReservationInline,
} from "@shared/reservation-display";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  checked_in: "bg-blue-50 text-blue-700 border-blue-200",
  checked_out: "bg-slate-50 text-slate-600 border-slate-200",
  cancelled: "bg-red-50 text-red-600 border-red-200",
};

const SOURCE_STYLES: Record<string, string> = {
  direct: "bg-emerald-50 text-emerald-700 border-emerald-200",
  airbnb: "bg-rose-50 text-rose-700 border-rose-200",
  vrbo: "bg-blue-50 text-blue-700 border-blue-200",
  booking_com: "bg-indigo-50 text-indigo-700 border-indigo-200",
  other: "bg-slate-50 text-slate-600 border-slate-200",
};

function toDateStr(val: unknown): string {
  if (!val) return '';
  if (val instanceof Date) return val.toISOString().split('T')[0];
  const s = String(val);
  if (s.includes('T')) return s.split('T')[0];
  if (s.includes(' ') && s.length > 10) { const d = new Date(s); if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]; }
  return s.slice(0, 10);
}

export default function ReservationsPage() {
  const { data: reservations = [], refetch } = trpc.reservations.list.useQuery();
  const { data: calendarEvents = [], refetch: refetchEvents } = trpc.calendar.events.useQuery();
  const { data: eventCodes = [], refetch: refetchCodes } = trpc.bypassCodes.listForEvents.useQuery();
  const deleteRes = trpc.reservations.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Reservation deleted"); } });
  const upsertCode = trpc.bypassCodes.upsertForEvent.useMutation({ onSuccess: () => { refetchCodes(); toast.success("Guest code created"); } });
  const regenerateCode = trpc.bypassCodes.regenerate.useMutation({ onSuccess: () => { refetchCodes(); toast.success("Code regenerated"); } });
  const updateEvent = trpc.calendar.updateEvent.useMutation({ onSuccess: () => { refetch(); refetchEvents(); setEditingEventId(null); toast.success("Reservation updated"); }, onError: (err) => toast.error(err.message ?? "Failed to save") });
  const updatePastImportedReservation = trpc.reservations.update.useMutation({
    onSuccess: () => {
      refetch();
      setEditingPastImportedReservationId(null);
      toast.success("Reservation updated");
    },
    onError: (err) => toast.error(err.message ?? "Failed to save"),
  });
  const syncAll = trpc.ical.syncAll.useMutation({ onSuccess: (r: any) => { refetchEvents(); toast.success(`Synced ${r?.total ?? 0} events`); } });
  const setCode = trpc.bypassCodes.setCode.useMutation({ onSuccess: () => { refetchCodes(); toast.success("Code updated"); setManualCodeEventId(null); setManualCodeVal(""); } });
  const delCalEvent = trpc.calendar.deleteEvent.useMutation({ onSuccess: () => { refetchEvents(); toast.success("Reservation deleted"); } });
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [eventEditForm, setEventEditForm] = useState({ guestFirstNames: "", guestPhone: "", guestCount: "1", notes: "" });
  const [editingPastImportedReservationId, setEditingPastImportedReservationId] = useState<number | null>(null);
  const [pastImportedReservationEditForm, setPastImportedReservationEditForm] = useState({ guestName: "", guestPhone: "", guestCount: "1", notes: "" });
  const [manualCodeEventId, setManualCodeEventId] = useState<number | null>(null);
  const [manualCodeVal, setManualCodeVal] = useState("");
  const createRes = trpc.reservations.create.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); toast.success("Reservation created"); },
    onError: (err) => toast.error(err.message ?? "Failed to create reservation"),
  });

  const [search, setSearch] = useState("");
  const [reservationView, setReservationView] = useState<ReservationTimelineView>("all");
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    source: "direct" as "direct" | "airbnb" | "vrbo" | "booking_com" | "other",
    status: "confirmed" as "pending" | "confirmed" | "checked_in" | "checked_out" | "cancelled",
    guestName: "", guestEmail: "", guestPhone: "", guestCount: 1,
    arrivalDate: "", departureDate: "", nightlyRate: "", cleaningFee: "", totalAmount: "", notes: "",
  });

  // Merge direct reservations + iCal-synced bookings into one list
  const icalAsRes = getCanonicalCalendarEventReservations(
    calendarEvents
      .filter(ev => ev.eventType === 'booking')
      .map(ev => ({
      id: -(ev.id),
      reservationId: ev.reservationId ?? null,
      externalUid: ev.externalUid ?? null,
      isStale: ev.isStale ?? false,
      hasPortalCode: eventCodes.some((code) => sameCalendarEventReference(code.calendarEventId, ev.id)),
      propertyId: 1,
      source: ev.source as any,
      status: 'confirmed' as any,
      guestName: (ev as any).guestFirstNames ?? ev.title ?? ev.source,
      guestEmail: null,
      guestPhone: (ev as any).guestPhone ?? null,
      guestCount: (ev as any).guestCount ?? null,
      arrivalDate: toDateStr(ev.startDate) as any,
      departureDate: toDateStr(ev.endDate) as any,
      nightlyRate: null,
      cleaningFee: null,
      totalAmount: null,
      notes: (ev as any).notes ?? null,
      // Extra fields from calendar_events
      guestFirstNames: (ev as any).guestFirstNames ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      })),
  );

  // Imported stays stay on their original event-backed edit and portal-code path,
  // including historical events that are linked to a durable reporting row.
  const {
    durableReservations: reservationPageRecords,
    eventReservations: calendarReservationCards,
  } = getReservationPageDisplayRecords(reservations, icalAsRes);
  const allReservations = [
    ...reservationPageRecords,
    ...calendarReservationCards.filter(ev => !reservationPageRecords.some(r => {
      // Don't show iCal event if there's already a matching direct reservation for same dates
      return toDateStr(r.arrivalDate) === toDateStr(ev.arrivalDate) && r.source === ev.source;
    }))
  ].sort(compareStaysByOperationalDate);

  const getPastImportedReservationForm = (res: any) => ({
    guestName: res.guestName ?? "",
    guestPhone: res.guestPhone ?? "",
    guestCount: String(res.guestCount ?? 1),
    notes: res.notes ?? "",
  });
  const updatePastImportedReservationField = (
    res: any,
    patch: Partial<typeof pastImportedReservationEditForm>,
  ) => {
    const initialForm = getPastImportedReservationForm(res);
    setEditingPastImportedReservationId(res.id);
    setPastImportedReservationEditForm((current) => (
      editingPastImportedReservationId === res.id
        ? { ...current, ...patch }
        : { ...initialForm, ...patch }
    ));
  };

  const today = new Date().toISOString().split("T")[0];
  const filtered = getReservationsForTimeline(allReservations, reservationView, today).filter((r) => {
    const matchesSearch = !search || r.guestName?.toLowerCase().includes(search.toLowerCase()) || (r.guestEmail ?? '').toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedReservations = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectReservationView = (view: ReservationTimelineView) => {
    setReservationView(view);
    setPage(1);
  };
  const reservationViewLabel = reservationView === "all" ? "" : `${reservationView} `;

  return (
    <HostLayout title="Reservations">
      <div className="max-w-5xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search by name or email..." className="pl-9" />
          </div>
          <Button variant="outline" size="sm" onClick={() => syncAll.mutate()} disabled={syncAll.isPending} className="gap-1.5 shrink-0">
            <RefreshCw className={`w-3.5 h-3.5 ${syncAll.isPending ? 'animate-spin' : ''}`} />
            {syncAll.isPending ? 'Syncing...' : 'Sync iCal'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowAdd(true)} className="gap-1.5 shrink-0">
            <Plus className="w-3.5 h-3.5" />
            Add
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(["all", "current", "upcoming", "past"] as const).map(view => (
            <Button
              key={view}
              size="sm"
              variant={reservationView === view ? "default" : "outline"}
              onClick={() => selectReservationView(view)}
              className="capitalize"
            >
              {view === "all" ? "All reservations" : view === "current" ? "Current check-ins" : view === "upcoming" ? "Future reservations" : "Past"}
            </Button>
          ))}
          <span className="text-xs text-muted-foreground ml-1">
            {filtered.length} {reservationViewLabel}reservation{filtered.length === 1 ? "" : "s"}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="card-premium p-10 text-center text-muted-foreground space-y-3">
            <Calendar className="w-8 h-8 mx-auto opacity-30" />
            <p>{search ? "No reservations match your search." : reservationView === "all" ? "No reservations yet." : reservationView === "current" ? "No current check-ins." : reservationView === "upcoming" ? "No future reservations." : "No past reservations."}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {paginatedReservations.map((res) => (
              res.id > 0 && !shouldRenderPastImportedReservationInline(res, today) ? (
              <div key={res.id} className="card-premium p-4 space-y-3 hover:shadow-md transition-all">
                <Link href={`/host/reservations/${res.id}`} className="flex items-center gap-4 cursor-pointer">
                  <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{res.guestName ?? "Unknown Guest"}</span>
                      <Badge className={`text-xs border ${STATUS_STYLES[res.status]}`}>
                        {res.status.replace("_", " ")}
                      </Badge>
                      <Badge className={`text-xs border ${SOURCE_STYLES[res.source]}`}>
                        {res.source.replace("_", ".")}
                      </Badge>
                      {isReservationCurrent(res, today) && (
                        <Badge className="text-xs border bg-violet-50 text-violet-700 border-violet-200">Current</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDateShort(res.arrivalDate)}
                        {" → "}
                        {formatDate(res.departureDate, { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                      {res.guestCount && <span>{res.guestCount} guest{res.guestCount > 1 ? "s" : ""}</span>}
                      {res.totalAmount && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="w-3 h-3" />
                          ${parseFloat(res.totalAmount).toFixed(0)}
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </Link>
                <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                  <Link href={`/host/reservations/${res.id}`}>
                    <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
                      <Edit2 className="w-3 h-3" /> Edit
                    </Button>
                  </Link>
                  {res.source === "direct" && (
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => { if (confirm('Delete this reservation?')) deleteRes.mutate({ id: res.id }); }}
                      disabled={deleteRes.isPending}
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </Button>
                  )}
                </div>
              </div>
              ) : (() => {
                const evCode = eventCodes.find((code) => sameCalendarEventReference(code.calendarEventId, res.id));
                const origin = typeof window !== 'undefined' ? window.location.origin : 'https://example.com';
                const portalUrl = evCode ? `${origin}/guest/auto?code=${evCode.code}` : null;
                const isPastImportedReservation = res.id > 0;
                const pastImportedReservationForm = getPastImportedReservationForm(res);
                const isEditing = isPastImportedReservation
                  ? editingPastImportedReservationId === res.id
                  : editingEventId === res.id;
                // Initialize edit form when first opening
                const initEdit = () => {
                  if (isPastImportedReservation && !isEditing) {
                    setEditingPastImportedReservationId(res.id);
                    setPastImportedReservationEditForm(pastImportedReservationForm);
                  } else if (!isPastImportedReservation && !isEditing) {
                    setEditingEventId(res.id);
                    setEventEditForm({
                      guestFirstNames: (res as any).guestFirstNames ?? "",
                      guestPhone: (res as any).guestPhone ?? "",
                      guestCount: String((res as any).guestCount ?? 1),
                      notes: (res as any).notes ?? "",
                    });
                  }
                };
                return (
                <div key={res.id} className="card-premium p-3 space-y-2.5">
                  {/* Header row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`text-xs border ${SOURCE_STYLES[res.source] ?? SOURCE_STYLES.other}`}>
                      {res.source.replace("_", ".")}
                    </Badge>
                    {isReservationCurrent(res, today) && (
                      <Badge className="text-xs border bg-violet-50 text-violet-700 border-violet-200">Current</Badge>
                    )}
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      {toDateStr(res.arrivalDate)} → {toDateStr(res.departureDate)}
                    </span>
                  </div>
                  {/* Editable fields — always visible */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <label className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide block mb-0.5">Guest Names</label>
                      <Input
                        value={isEditing
                          ? (isPastImportedReservation ? pastImportedReservationEditForm.guestName : eventEditForm.guestFirstNames)
                          : (isPastImportedReservation ? pastImportedReservationForm.guestName : ((res as any).guestFirstNames ?? ""))}
                        onChange={e => {
                          if (isPastImportedReservation) {
                            updatePastImportedReservationField(res, { guestName: e.target.value });
                            return;
                          }
                          initEdit();
                          setEventEditForm(f => ({ ...f, guestFirstNames: e.target.value }));
                        }}
                        placeholder="Jessica & John"
                        className="h-7 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide block mb-0.5">Phone</label>
                      <Input
                        value={isEditing
                          ? (isPastImportedReservation ? pastImportedReservationEditForm.guestPhone : eventEditForm.guestPhone)
                          : (isPastImportedReservation ? pastImportedReservationForm.guestPhone : ((res as any).guestPhone ?? ""))}
                        onChange={e => {
                          if (isPastImportedReservation) {
                            updatePastImportedReservationField(res, { guestPhone: e.target.value });
                            return;
                          }
                          initEdit();
                          setEventEditForm(f => ({ ...f, guestPhone: e.target.value }));
                        }}
                        placeholder="+1 555 000 0000"
                        className="h-7 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide block mb-0.5">Guests</label>
                      <Input
                        value={isEditing
                          ? (isPastImportedReservation ? pastImportedReservationEditForm.guestCount : eventEditForm.guestCount)
                          : (isPastImportedReservation ? pastImportedReservationForm.guestCount : String((res as any).guestCount ?? 1))}
                        onChange={e => {
                          if (isPastImportedReservation) {
                            updatePastImportedReservationField(res, { guestCount: e.target.value });
                            return;
                          }
                          initEdit();
                          setEventEditForm(f => ({ ...f, guestCount: e.target.value }));
                        }}
                        type="number" min="1"
                        className="h-7 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide block mb-0.5">Notes</label>
                      <Input
                        value={isEditing
                          ? (isPastImportedReservation ? pastImportedReservationEditForm.notes : eventEditForm.notes)
                          : (isPastImportedReservation ? pastImportedReservationForm.notes : ((res as any).notes ?? ""))}
                        onChange={e => {
                          if (isPastImportedReservation) {
                            updatePastImportedReservationField(res, { notes: e.target.value });
                            return;
                          }
                          initEdit();
                          setEventEditForm(f => ({ ...f, notes: e.target.value }));
                        }}
                        placeholder="Special requests..."
                        className="h-7 text-xs"
                      />
                    </div>
                  </div>
                  {isEditing && (
                    <div className="flex gap-1.5">
                      <Button size="sm" className="h-6 gap-1 text-xs px-2"
                        onClick={() => {
                          if (isPastImportedReservation) {
                            updatePastImportedReservation.mutate({
                              id: res.id,
                              guestName: pastImportedReservationEditForm.guestName,
                              guestPhone: pastImportedReservationEditForm.guestPhone,
                              guestCount: parseInt(pastImportedReservationEditForm.guestCount) || 1,
                              notes: pastImportedReservationEditForm.notes,
                            });
                            return;
                          }
                          updateEvent.mutate({ id: Math.abs(res.id), guestFirstNames: eventEditForm.guestFirstNames || null, guestPhone: eventEditForm.guestPhone || null, guestCount: parseInt(eventEditForm.guestCount) || 1, notes: eventEditForm.notes || null });
                        }}
                        disabled={isPastImportedReservation ? updatePastImportedReservation.isPending : updateEvent.isPending}>
                        <Check className="w-2.5 h-2.5" />{(isPastImportedReservation ? updatePastImportedReservation.isPending : updateEvent.isPending) ? 'Saving...' : 'Save'}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => {
                        if (isPastImportedReservation) {
                          setEditingPastImportedReservationId(null);
                          return;
                        }
                        setEditingEventId(null);
                      }}>Cancel</Button>
                    </div>
                  )}
                  {/* Guest portal code */}
                  {!isPastImportedReservation && <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border">
                    {evCode ? (
                      <>
                        <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1">
                          <Key className="w-3 h-3 text-emerald-600" />
                          <span className="font-mono font-bold text-sm text-emerald-700 tracking-widest">{evCode.code}</span>
                        </div>
                        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
                          onClick={() => { navigator.clipboard.writeText(portalUrl!); toast.success("Link copied!"); }}>
                          <LinkIcon className="w-3 h-3" />Copy Link
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
                          onClick={() => {
                            const name = (res as any).guestFirstNames?.replace(/^Reserved\s*-\s*/i, '').trim();
                            const greeting = name ? `Howdy ${name},` : 'Howdy,';
                            const text = `${greeting}\n\nIf you have any special requests please let us know, and if there's anything else we can do for you, don't hesitate to reach out.\n\nYour Door Code is:\n\n${evCode.code}\n\nYour stay guide can be viewed here: ${portalUrl}\n\nPlease make yourselves at home & have a wonderful stay at the property.\n\nHost`;
                            navigator.clipboard.writeText(text); toast.success("Stay message copied!");
                          }}>
                          <Copy className="w-3 h-3" />Copy Text
                        </Button>
                        {manualCodeEventId === res.id ? (
                          <>
                            <Input value={manualCodeVal} onChange={e => setManualCodeVal(e.target.value.replace(/\D/g,'').slice(0,4))}
                              placeholder="1234" className="h-7 w-16 text-center font-mono text-sm" maxLength={4} autoFocus />
                            <Button size="sm" className="h-7 gap-1 text-xs"
                              onClick={() => { if (manualCodeVal.length !== 4) { toast.error('Enter 4 digits'); return; } setCode.mutate({ id: evCode.id, code: manualCodeVal }); }}
                              disabled={setCode.isPending}>
                              <Check className="w-3 h-3" />Set
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setManualCodeEventId(null); setManualCodeVal(''); }}>✕</Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground"
                              onClick={() => regenerateCode.mutate({ id: evCode.id })} disabled={regenerateCode.isPending}>
                              <RefreshCw className={`w-3 h-3 ${regenerateCode.isPending ? 'animate-spin' : ''}`} />Regenerate
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground"
                              onClick={() => { setManualCodeEventId(res.id); setManualCodeVal(''); }}>
                              Set Code
                            </Button>
                          </>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        {manualCodeEventId === res.id ? (
                          <>
                            <Input
                              value={manualCodeVal}
                              onChange={e => setManualCodeVal(e.target.value.replace(/\D/g, '').slice(0, 4))}
                              placeholder="1234"
                              className="h-7 w-16 text-center font-mono text-sm"
                              maxLength={4}
                              autoFocus
                            />
                            <Button size="sm" className="h-7 gap-1 text-xs"
                              onClick={() => {
                                if (manualCodeVal.length !== 4) { toast.error('Enter a 4-digit code'); return; }
                                upsertCode.mutate({ calendarEventId: res.id, label: (res as any).guestFirstNames || undefined, expiresAt: toDateStr(res.departureDate) + 'T23:59:59' });
                                setManualCodeEventId(null); setManualCodeVal('');
                              }} disabled={upsertCode.isPending}>
                              <Check className="w-3 h-3" />Use
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setManualCodeEventId(null); setManualCodeVal(''); }}>✕</Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
                        onClick={() => upsertCode.mutate({ calendarEventId: res.id, label: (res as any).guestFirstNames || undefined, expiresAt: toDateStr(res.departureDate) + 'T23:59:59' })}
                            disabled={upsertCode.isPending}>
                              <Key className="w-3 h-3" />
                              {upsertCode.isPending ? 'Generating...' : 'Generate Code'}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground"
                              onClick={() => { setManualCodeEventId(res.id); setManualCodeVal(''); }}>
                              Enter Code
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>}
                  {/* Delete button — only for direct bookings */}
                  {res.source === 'direct' && (
                    <div className="flex justify-end pt-1">
                      <Button
                        variant="ghost" size="sm"
                        className="h-6 gap-1 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => { if (confirm('Delete this direct reservation?')) delCalEvent.mutate({ id: Math.abs(res.id) }); }}
                        disabled={delCalEvent.isPending}
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </Button>
                    </div>
                  )}
                </div>
                );
              })()
            ))}
            </div>
        )}

        {filtered.length > 0 && (
          <div className="flex items-center justify-between gap-3 pt-2">
            <span className="text-xs text-muted-foreground">
              Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</Button>
              <span className="self-center text-xs text-muted-foreground">Page {currentPage} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Next</Button>
            </div>
          </div>
        )}

        {/* Add Reservation Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif">New Reservation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Source</label>
                <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v as typeof form.source })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct">Direct</SelectItem>
                    <SelectItem value="airbnb">Airbnb</SelectItem>
                    <SelectItem value="vrbo">Vrbo</SelectItem>
                    <SelectItem value="booking_com">Booking.com</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Status</label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as typeof form.status })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Guest Name</label>
              <Input value={form.guestName} onChange={(e) => setForm({ ...form, guestName: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Email</label>
                <Input type="email" value={form.guestEmail} onChange={(e) => setForm({ ...form, guestEmail: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Phone</label>
                <Input value={form.guestPhone} onChange={(e) => setForm({ ...form, guestPhone: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Arrival</label>
                <Input type="date" value={form.arrivalDate} onChange={(e) => setForm({ ...form, arrivalDate: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Departure</label>
                <Input type="date" value={form.departureDate} onChange={(e) => setForm({ ...form, departureDate: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Guests</label>
                <Input type="number" min={1} value={form.guestCount} onChange={(e) => setForm({ ...form, guestCount: parseInt(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Nightly Rate</label>
                <Input value={form.nightlyRate} onChange={(e) => setForm({ ...form, nightlyRate: e.target.value })} placeholder="0.00" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Cleaning Fee</label>
                <Input value={form.cleaningFee} onChange={(e) => setForm({ ...form, cleaningFee: e.target.value })} placeholder="0.00" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Total</label>
                <Input value={form.totalAmount} onChange={(e) => setForm({ ...form, totalAmount: e.target.value })} placeholder="0.00" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Notes</label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button
              onClick={() => createRes.mutate({
                ...form,
                guestName: form.guestName.trim() || undefined,
                guestEmail: form.guestEmail.trim() || undefined,
                guestPhone: form.guestPhone.trim() || undefined,
                guestCount: isNaN(form.guestCount) || form.guestCount < 1 ? 1 : form.guestCount,
                nightlyRate: form.nightlyRate.trim() || undefined,
                cleaningFee: form.cleaningFee.trim() || undefined,
                totalAmount: form.totalAmount.trim() || undefined,
                notes: form.notes.trim() || undefined,
              })}
              disabled={!form.arrivalDate || !form.departureDate || createRes.isPending}
            >
              {createRes.isPending ? "Creating..." : "Create Reservation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </HostLayout>
  );
}
