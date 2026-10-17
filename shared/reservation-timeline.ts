import { compareStaysByOperationalDate, type OperationalStay } from "./reservation-ordering";

export type ReservationTimelineView = "all" | "current" | "upcoming" | "past";

function dateKey(value: Date | string | null | undefined): string {
  if (!value) return "9999-12-31";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export function isReservationCurrent(
  reservation: OperationalStay,
  today: string,
): boolean {
  return dateKey(reservation.arrivalDate) <= today && dateKey(reservation.departureDate) > today;
}

/**
 * Returns conventional reservation filters. All and Current stays are
 * chronological, Upcoming stays are soonest first, and Past stays are most
 * recent first.
 */
export function getReservationsForTimeline<T extends OperationalStay>(
  reservations: T[],
  view: ReservationTimelineView,
  today: string,
): T[] {
  return reservations
    .filter((reservation) => {
      const arrival = dateKey(reservation.arrivalDate);
      const departure = dateKey(reservation.departureDate);

      if (view === "past") return departure <= today;
      if (view === "current") return isReservationCurrent(reservation, today);
      if (view === "upcoming") return arrival > today;
      return true;
    })
    .sort((left, right) => {
      const chronological = compareStaysByOperationalDate(left, right);
      return view === "past" ? -chronological : chronological;
    });
}
