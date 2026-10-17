import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, CheckCircle2, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarEvent {
  startDate: Date | string;
  endDate: Date | string;
}

interface OtaLink {
  label: string;
  url: string;
  color: string;
}

interface BookingForm {
  arrivalDate: string;
  departureDate: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  guestCount: number;
  message: string;
}

interface Props {
  events: CalendarEvent[];
  rateMap: Map<string, number | null>;
  otaLinks: OtaLink[];
  nightlyRate: number;
  cleaningFee: number;
  maxGuests: number;
  availabilityResult: { available: boolean; checked: boolean };
  checkAvailLoading: boolean;
  onFormChange: (form: BookingForm) => void;
  onCheckout: () => void;
  checkoutPending: boolean;
  form: BookingForm;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function evDateStr(val: unknown): string {
  if (!val) return '';
  if (val instanceof Date) return val.toISOString().split('T')[0];
  const s = String(val);
  if (s.includes('T')) return s.split('T')[0];
  if (s.includes(' ') && s.length > 10) { const d = new Date(s); if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]; }
  return s.slice(0, 10);
}

function isBlocked(date: Date, events: CalendarEvent[]): boolean {
  const d = toDateStr(date);
  for (const ev of events) {
    const start = evDateStr(ev.startDate);
    const end = evDateStr(ev.endDate);
    if (!start || !end) continue;
    if (d >= start && d < end) return true;
  }
  return false;
}

function hasBlockedInRange(start: string, end: string, events: CalendarEvent[]): boolean {
  const s = new Date(start + "T12:00:00Z");
  const e = new Date(end + "T12:00:00Z");
  let d = new Date(s.getTime() + 86400000);
  while (d < e) {
    if (isBlocked(d, events)) return true;
    d = new Date(d.getTime() + 86400000);
  }
  return false;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BookingCard({
  events, rateMap, otaLinks, nightlyRate, cleaningFee, maxGuests,
  availabilityResult, checkAvailLoading, onFormChange, onCheckout, checkoutPending, form,
}: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selecting, setSelecting] = useState<"arrival" | "departure">("arrival");
  const [hoverDate, setHoverDate] = useState("");
  const [showDirectBooking, setShowDirectBooking] = useState(false);
  const [step, setStep] = useState<"dates" | "details">("dates");

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = viewDate.toLocaleString("default", { month: "long", year: "numeric" });

  // Fetch rates for visible month directly from DB
  const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const { data: monthRates = [] } = trpc.dailyRates.list.useQuery({ startDate, endDate });

  // Build local rate map for this month (overrides parent rateMap for visible month)
  const localRateMap = useMemo(() => {
    const m = new Map<string, number | null>(rateMap);
    for (const r of monthRates) {
      const effective = r.overrideRate
        ? parseFloat(r.overrideRate)
        : r.competitorRate
        ? Math.round(parseFloat(r.competitorRate) * parseFloat(r.multiplier))
        : null;
      m.set(r.date, effective);
    }
    return m;
  }, [monthRates, rateMap]);

  // Default display price = today's rate
  const todayStr = toDateStr(today);
  const todayRate = localRateMap.get(todayStr) ?? nightlyRate;

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  // Computed price from selected dates
  const computedPrice = useMemo(() => {
    if (!form.arrivalDate || !form.departureDate || form.arrivalDate >= form.departureDate) return null;
    const arrival = new Date(form.arrivalDate + "T12:00:00Z");
    const departure = new Date(form.departureDate + "T12:00:00Z");
    const nights = Math.round((departure.getTime() - arrival.getTime()) / 86400000);
    if (nights <= 0) return null;
    let subtotal = 0;
    for (let i = 0; i < nights; i++) {
      const d = new Date(arrival.getTime() + i * 86400000);
      const ds = toDateStr(d);
      const mapped = localRateMap.get(ds);
      subtotal += mapped != null ? mapped : nightlyRate;
    }
    return { nights, subtotal, cleaningFee, total: subtotal + cleaningFee, avg: Math.round(subtotal / nights) };
  }, [form.arrivalDate, form.departureDate, localRateMap, nightlyRate, cleaningFee]);

  function handleDayClick(date: Date) {
    const ds = toDateStr(date);
    if (selecting === "arrival") {
      onFormChange({ ...form, arrivalDate: ds, departureDate: "" });
      setSelecting("departure");
    } else {
      if (ds <= form.arrivalDate || hasBlockedInRange(form.arrivalDate, ds, events)) {
        onFormChange({ ...form, arrivalDate: ds, departureDate: "" });
        setSelecting("departure");
      } else {
        onFormChange({ ...form, departureDate: ds });
        setSelecting("arrival");
      }
    }
  }

  function clearDates() {
    onFormChange({ ...form, arrivalDate: "", departureDate: "" });
    setSelecting("arrival");
    setHoverDate("");
  }

  const displayPrice = computedPrice ? computedPrice.avg : todayRate;

  return (
    <div className="border border-gray-200 rounded-2xl shadow-lg bg-white overflow-hidden">
      {/* Price header */}
      <div className="px-5 pt-5 pb-3 flex items-baseline justify-between">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-semibold text-gray-900">${displayPrice}</span>
          <span className="text-gray-500 text-sm">/ night</span>
        </div>
        <span className="text-xs text-gray-400">+${cleaningFee} cleaning</span>
      </div>

      {/* Selected dates bar */}
      {(form.arrivalDate || form.departureDate) && (
        <div className="mx-5 mb-3 flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2 text-sm">
          <span className="text-gray-700">
            {form.arrivalDate ? form.arrivalDate : "Check-in"}
            <span className="text-gray-400 mx-2">→</span>
            {form.departureDate ? form.departureDate : "Check-out"}
          </span>
          <button onClick={clearDates} className="text-gray-400 hover:text-gray-600 ml-2">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Calendar */}
      <div className="px-4 pb-3">
        {/* Month nav */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setViewDate(new Date(year, month - 1, 1))}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <span className="text-sm font-medium text-gray-800">{monthName}</span>
          <button
            onClick={() => setViewDate(new Date(year, month + 1, 1))}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
            <div key={d} className="text-center text-[10px] font-medium text-gray-400 py-0.5">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-y-0.5">
          {cells.map((date, i) => {
            if (!date) return <div key={`e-${i}`} />;
            const ds = toDateStr(date);
            const isPast = date < today;
            const blocked = !isPast && isBlocked(date, events);
            const isArrival = ds === form.arrivalDate;
            const isDeparture = ds === form.departureDate;
            const isToday = date.toDateString() === today.toDateString();
            const mappedRate = localRateMap.get(ds);
            const rate = mappedRate != null ? mappedRate : nightlyRate;

            // Range highlight
            const inRange = form.arrivalDate && (form.departureDate || hoverDate) &&
              ds > form.arrivalDate && ds < (form.departureDate || hoverDate);

            const disabled = isPast || blocked;

            return (
              <div
                key={ds}
                onMouseEnter={() => !disabled && setHoverDate(ds)}
                onMouseLeave={() => setHoverDate("")}
                onClick={() => !disabled && handleDayClick(date)}
                className={`
                  relative flex flex-col items-center justify-center min-h-[46px] rounded-lg text-xs transition-all
                  ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}
                  ${isArrival || isDeparture ? "bg-gray-900 text-white z-10" : ""}
                  ${inRange ? "bg-gray-100 rounded-none" : ""}
                  ${isArrival ? "rounded-r-none" : ""}
                  ${isDeparture ? "rounded-l-none" : ""}
                  ${!disabled && !isArrival && !isDeparture && !inRange ? "hover:bg-gray-100" : ""}
                  ${isToday && !isArrival && !isDeparture ? "ring-1 ring-gray-400" : ""}
                `}
              >
                <span className={`font-medium text-[11px] ${blocked ? "line-through text-red-300" : ""}`}>
                  {date.getDate()}
                </span>
                {!disabled && !blocked && (
                  <span className={`text-[9px] leading-none mt-0.5 ${isArrival || isDeparture ? "text-gray-300" : "text-gray-400"}`}>
                    ${rate}
                  </span>
                )}
                {blocked && !isPast && (
                  <span className="text-[8px] text-red-300 leading-none mt-0.5">Booked</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Selection hint */}
        <p className="text-center text-[10px] text-gray-400 mt-2">
          {!form.arrivalDate ? "Select check-in date" :
           !form.departureDate ? "Select check-out date" :
           `${computedPrice?.nights ?? 0} night${(computedPrice?.nights ?? 0) !== 1 ? "s" : ""} selected`}
        </p>
      </div>

      {/* Price breakdown */}
      {computedPrice && (
        <div className="mx-5 mb-4 space-y-1.5 pt-3 border-t border-gray-100 text-sm">
          <div className="flex justify-between text-gray-700">
            <span>${computedPrice.avg} × {computedPrice.nights} night{computedPrice.nights !== 1 ? "s" : ""}</span>
            <span>${computedPrice.subtotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-gray-700">
            <span>Cleaning fee</span>
            <span>${computedPrice.cleaningFee}</span>
          </div>
          <div className="flex justify-between font-semibold text-gray-900 pt-1.5 border-t border-gray-100">
            <span>Total</span>
            <span>${computedPrice.total.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Availability check removed — guests can always proceed to book */}

      {/* OTA Buttons */}
      <div className="px-5 pb-3 space-y-2">
        {otaLinks.map(link => (
          <a
            key={link.label}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center justify-between w-full px-4 py-3 rounded-xl text-sm font-semibold transition-all ${link.color}`}
          >
            <span>{link.label}</span>
            <ExternalLink className="w-4 h-4 opacity-80" />
          </a>
        ))}
      </div>

      {/* Direct booking removed for now — OTA buttons above */}
    </div>
  );
}
