export type CalendarBookingForReservationSync = {
  id: number;
  propertyId: number;
  source: "direct" | "airbnb" | "vrbo" | "booking_com" | "manual" | "other";
  externalUid: string | null;
  title: string | null;
  guestFirstNames: string | null;
  guestPhone: string | null;
  guestCount: number | null;
  notes: string | null;
  startDate: Date | string;
  endDate: Date | string;
  eventType: "booking" | "block" | "maintenance";
  reservationId: number | null;
  isStale: boolean | null;
};

export type ReservationSeedFromCalendarBooking = {
  propertyId: number;
  source: "airbnb" | "vrbo" | "booking_com" | "other";
  status: "confirmed";
  guestName: string | null;
  guestPhone: string | null;
  guestCount: number;
  arrivalDate: Date | string;
  departureDate: Date | string;
  paymentStatus: "unpaid";
  notes: string | null;
  externalId: string;
};

const IMPORTED_SOURCES = new Set<CalendarBookingForReservationSync["source"]>([
  "airbnb",
  "vrbo",
  "booking_com",
  "other",
]);

const UNAVAILABLE_TITLES = /^(blocked|not available|airbnb \(not available\)|unavailable|closed(?:\s*-.*)?|hold|owner block|maintenance|owner stay)$/i;

/**
 * Calendar providers can legitimately include completed bookings in an iCal
 * feed. Whether a stay is in the past must not decide whether it is imported;
 * only clearly invalid date spans should be ignored.
 */
export function hasReasonableIcalDateSpan(startDate: string, endDate: string): boolean {
  const startMs = new Date(`${startDate}T00:00:00Z`).getTime();
  const endMs = new Date(`${endDate}T00:00:00Z`).getTime();
  const spanDays = (endMs - startMs) / 86_400_000;
  return Number.isFinite(spanDays) && spanDays >= 0 && spanDays <= 365;
}

function isImportedBookingSource(
  source: CalendarBookingForReservationSync["source"],
): source is ReservationSeedFromCalendarBooking["source"] {
  return IMPORTED_SOURCES.has(source);
}

export function getReservationSeedFromCalendarBooking(
  event: CalendarBookingForReservationSync,
): ReservationSeedFromCalendarBooking | null {
  if (
    event.eventType !== "booking" ||
    !event.externalUid ||
    !isImportedBookingSource(event.source) ||
    UNAVAILABLE_TITLES.test((event.title ?? "").trim())
  ) {
    return null;
  }

  return {
    propertyId: event.propertyId,
    source: event.source,
    status: "confirmed",
    guestName: event.guestFirstNames || null,
    guestPhone: event.guestPhone || null,
    guestCount: event.guestCount && event.guestCount > 0 ? event.guestCount : 1,
    arrivalDate: event.startDate,
    departureDate: event.endDate,
    paymentStatus: "unpaid",
    notes: event.notes || null,
    externalId: `ical:${event.externalUid}`,
  };
}
