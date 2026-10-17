import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CalendarEvent {
  startDate: Date | string;
  endDate: Date | string;
}

interface Props {
  arrivalDate: string;
  departureDate: string;
  onSelect: (arrival: string, departure: string) => void;
  events?: CalendarEvent[];
  maxGuests?: number;
  rateMap?: Map<string, number | null>;
}

function toDateStr(date: Date): string {
  return date.toISOString().split("T")[0];
}

function isBlocked(date: Date, events: CalendarEvent[]): boolean {
  const d = toDateStr(date);
  for (const ev of events) {
    const start = String(ev.startDate).split("T")[0];
    const end = String(ev.endDate).split("T")[0];
    if (d >= start && d < end) return true;
  }
  return false;
}

function hasBlockedDateInRange(start: string, end: string, events: CalendarEvent[]): boolean {
  const s = new Date(start);
  const e = new Date(end);
  const d = new Date(s);
  while (d < e) {
    if (isBlocked(d, events)) return true;
    d.setDate(d.getDate() + 1);
  }
  return false;
}

export default function DateRangePicker({ arrivalDate, departureDate, onSelect, events = [], rateMap = new Map() }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selecting, setSelecting] = useState<"arrival" | "departure">("arrival");
  const [hoverDate, setHoverDate] = useState<string>("");

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = viewDate.toLocaleString("default", { month: "long", year: "numeric" });

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  function handleDayClick(date: Date) {
    const d = toDateStr(date);
    if (selecting === "arrival") {
      onSelect(d, "");
      setSelecting("departure");
    } else {
      // Ensure departure is after arrival
      if (arrivalDate && d <= arrivalDate) {
        // Clicked before arrival — restart
        onSelect(d, "");
        setSelecting("departure");
        return;
      }
      // Check no blocked dates in range
      if (arrivalDate && hasBlockedDateInRange(arrivalDate, d, events)) {
        // Can't span blocked dates — restart from this date
        onSelect(d, "");
        setSelecting("departure");
        return;
      }
      onSelect(arrivalDate, d);
      setSelecting("arrival");
    }
  }

  function getDayState(date: Date) {
    const d = toDateStr(date);
    const isPast = date < today;
    const blocked = isBlocked(date, events);
    const isArrival = d === arrivalDate;
    const isDeparture = d === departureDate;
    const isToday = d === toDateStr(today);

    // In range
    let inRange = false;
    const rangeEnd = departureDate || (selecting === "departure" && hoverDate ? hoverDate : "");
    if (arrivalDate && rangeEnd && d > arrivalDate && d < rangeEnd) {
      inRange = true;
    }

    // Check if this date would cross a blocked date (for hover preview)
    const wouldCrossBlocked = selecting === "departure" && arrivalDate && hoverDate && d > arrivalDate && d <= hoverDate
      ? hasBlockedDateInRange(arrivalDate, hoverDate, events)
      : false;

    return { isPast, blocked, isArrival, isDeparture, inRange, isToday, wouldCrossBlocked };
  }

  const nightCount = arrivalDate && departureDate
    ? Math.round((new Date(departureDate).getTime() - new Date(arrivalDate).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <div className="select-none">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <Button
          variant="ghost" size="icon"
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
          className="h-7 w-7"
          disabled={new Date(year, month, 1) <= new Date(today.getFullYear(), today.getMonth(), 1)}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-semibold text-gray-900">{monthName}</span>
        <Button variant="ghost" size="icon" onClick={() => setViewDate(new Date(year, month + 1, 1))} className="h-7 w-7">
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((date, i) => {
          if (!date) return <div key={`e-${i}`} />;
          const { isPast, blocked, isArrival, isDeparture, inRange, isToday } = getDayState(date);
          const disabled = isPast || blocked;

          return (
            <div
              key={toDateStr(date)}
              onMouseEnter={() => !disabled && setHoverDate(toDateStr(date))}
              onMouseLeave={() => setHoverDate("")}
              onClick={() => !disabled && handleDayClick(date)}
              className={`
                relative flex flex-col items-center justify-center min-h-[44px] text-sm transition-all
                ${disabled ? "cursor-not-allowed" : "cursor-pointer"}
                ${isArrival || isDeparture
                  ? "bg-gray-900 text-white rounded-lg font-semibold z-10"
                  : inRange
                  ? "bg-gray-100 text-gray-900"
                  : disabled
                  ? "text-gray-300"
                  : isToday
                  ? "font-semibold text-gray-900 hover:bg-gray-100 rounded-lg"
                  : "text-gray-700 hover:bg-gray-100 rounded-lg"
                }
                ${isArrival && departureDate ? "rounded-r-none" : ""}
                ${isDeparture && arrivalDate ? "rounded-l-none" : ""}
                ${inRange && !isArrival && !isDeparture ? "rounded-none" : ""}
              `}
            >
              <span>{date.getDate()}</span>
              {!blocked && !isPast && rateMap.get(toDateStr(date)) && (
                <span className="text-[9px] text-gray-400 leading-none">${rateMap.get(toDateStr(date))}</span>
              )}
              {blocked && !isPast && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-gray-300" />
              )}
            </div>
          );
        })}
      </div>

      {/* Selection status */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        {!arrivalDate && !departureDate && (
          <p className="text-xs text-gray-400 text-center">Select your check-in date</p>
        )}
        {arrivalDate && !departureDate && (
          <p className="text-xs text-gray-500 text-center">
            Check-in: <strong>{new Date(arrivalDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</strong>
            {" · "}Now select check-out
          </p>
        )}
        {arrivalDate && departureDate && nightCount > 0 && (
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>
              {new Date(arrivalDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              {" → "}
              {new Date(departureDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
            <span className="font-medium">{nightCount} night{nightCount > 1 ? "s" : ""}</span>
          </div>
        )}
      </div>

      {/* Clear */}
      {(arrivalDate || departureDate) && (
        <button
          onClick={() => { onSelect("", ""); setSelecting("arrival"); }}
          className="mt-2 text-xs text-gray-400 hover:text-gray-600 transition-colors w-full text-center"
        >
          Clear dates
        </button>
      )}
    </div>
  );
}
