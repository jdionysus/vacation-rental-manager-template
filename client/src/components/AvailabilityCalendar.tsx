import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

interface CalendarEvent {
  startDate: Date | string;
  endDate: Date | string;
}

interface Props {
  events: CalendarEvent[];
  onDateHover?: (rate: number | null) => void;
}

const FALLBACK_RATE = 150; // shown when no daily_rates entry exists

function isBlocked(date: Date, events: CalendarEvent[]): boolean {
  const d = date.toISOString().split("T")[0];
  for (const ev of events) {
    const start = String(ev.startDate).split("T")[0];
    const end = String(ev.endDate).split("T")[0];
    if (d >= start && d < end) return true;
  }
  return false;
}

export default function AvailabilityCalendar({ events, onDateHover }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = viewDate.toLocaleString("default", { month: "long", year: "numeric" });

  const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const { data: dailyRates = [] } = trpc.dailyRates.list.useQuery({ startDate, endDate });

  const rateMap = new Map(dailyRates.map(r => {
    const effective = r.overrideRate
      ? parseFloat(r.overrideRate)
      : r.competitorRate
      ? Math.round(parseFloat(r.competitorRate) * parseFloat(r.multiplier))
      : null;
    return [r.date, effective];
  }));

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <Button variant="ghost" size="icon" onClick={() => setViewDate(new Date(year, month - 1, 1))} className="h-8 w-8">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="font-serif text-lg text-gray-900">{monthName}</span>
        <Button variant="ghost" size="icon" onClick={() => setViewDate(new Date(year, month + 1, 1))} className="h-8 w-8">
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 mb-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((date, i) => {
          if (!date) return <div key={`empty-${i}`} />;
          const isPast = date < today;
          const blocked = !isPast && isBlocked(date, events);
          const isToday = date.toDateString() === today.toDateString();
          const dateStr = date.toISOString().split("T")[0];

          // Get rate: use daily_rates entry if available, otherwise fallback
          const mappedRate = rateMap.get(dateStr);
          const rate = mappedRate != null ? mappedRate : FALLBACK_RATE;

          return (
            <div
              key={dateStr}
              title={
                isPast ? "" :
                blocked ? "Not available" :
                `$${rate}/night — Available`
              }
              onMouseEnter={() => !isPast && !blocked && onDateHover?.(rate)}
              onMouseLeave={() => onDateHover?.(null)}
              className={`
                relative flex flex-col items-center justify-center py-1 rounded-md text-xs transition-all select-none min-h-[46px]
                ${isPast ? "opacity-30 cursor-default" : ""}
                ${isToday ? "ring-1 ring-gray-900" : ""}
                ${blocked ? "bg-red-50 cursor-not-allowed" : ""}
                ${!blocked && !isPast ? "hover:bg-gray-50 cursor-pointer" : ""}
              `}
            >
              <span className={`font-medium text-[11px] ${blocked ? "text-red-400 line-through" : isPast ? "text-gray-300" : "text-gray-800"}`}>
                {date.getDate()}
              </span>
              {!isPast && !blocked && (
                <span className="text-[9px] text-gray-400 leading-none mt-0.5">${rate}</span>
              )}
              {!isPast && blocked && (
                <span className="text-[9px] text-red-300 leading-none mt-0.5">Booked</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-4 border-t border-gray-100 flex gap-5">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="w-3 h-3 rounded bg-white border border-gray-300" />
          Available
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="w-3 h-3 rounded bg-red-50 border border-red-200" />
          Booked
        </div>
      </div>
    </div>
  );
}
