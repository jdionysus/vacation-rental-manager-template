export type ImportedReservationLike = {
  id: number;
  externalId?: string | null;
};

export type UpcomingReservationLike = ImportedReservationLike & {
  status?: string | null;
  arrivalDate: Date | string | null | undefined;
};

export type CalendarEventReservationLike = {
  id: number;
  reservationId?: number | null;
  externalUid?: string | null;
  source?: string | null;
  arrivalDate?: Date | string | null;
  departureDate?: Date | string | null;
  isStale?: boolean | null;
  hasPortalCode?: boolean;
};

export type GuestSessionNameLike = {
  guestName?: string | null;
  guestFirstNames?: string | null;
};

const GENERIC_IMPORTED_GUEST_NAMES = new Set([
  "guest",
  "reserved",
  "unknown guest",
  "airbnb",
  "vrbo",
  "booking.com",
  "booking_com",
  "other",
]);

export function toOperationalDateKey(value: Date | string | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/**
 * Legacy calendar imports create durable reservation rows whose identifiers are
 * positive even though they originated from iCal. Past rows without a retained
 * calendar event must use the list's inline durable editor rather than routing
 * the host to a separate reservation detail page.
 */
export function shouldRenderPastImportedReservationInline(
  reservation: ImportedReservationLike & {
    departureDate?: Date | string | null;
  },
  today: string,
): boolean {
  const departureDate = toOperationalDateKey(reservation.departureDate);
  return Boolean(reservation.externalId?.trim().startsWith("ical:"))
    && Boolean(departureDate)
    && departureDate <= today;
}

/**
 * Imported calendar events and their UI-backed bypass codes historically use
 * the negative of the database event ID. Compare the canonical absolute ID so
 * existing codes remain discoverable without modifying their stored values.
 */
export function sameCalendarEventReference(
  left: number | null | undefined,
  right: number | null | undefined,
): boolean {
  return typeof left === "number" && typeof right === "number" && Math.abs(left) === Math.abs(right);
}

/**
 * Calendar-backed cards historically used the negative event ID in the UI.
 * Return both forms so a persisted legacy reference can be found without
 * rewriting its stored value.
 */
export function getCalendarEventReferenceCandidates(eventId: number): number[] {
  return Array.from(new Set([eventId, -eventId]));
}

/**
 * A host-entered name is authoritative. An imported calendar name is used only
 * when the durable row contains an empty or clearly generic platform label.
 */
export function getDisplayedGuestName(
  storedName: string | null | undefined,
  importedName: string | null | undefined,
): string | null | undefined {
  const normalizedStoredName = storedName?.trim();
  const normalizedImportedName = importedName?.trim();
  if (normalizedStoredName && !GENERIC_IMPORTED_GUEST_NAMES.has(normalizedStoredName.toLowerCase())) {
    return storedName;
  }
  return normalizedImportedName || storedName;
}

/**
 * Guest sessions may have been created by older code using either
 * `guestName` or `guestFirstNames`. Preserve the stored name in both cases.
 */
export function getGuestSessionName(
  session: GuestSessionNameLike | null | undefined,
): string | null {
  const name = getDisplayedGuestName(session?.guestName, session?.guestFirstNames);
  return name?.replace(/^Reserved\s*-\s*/i, "").trim() || null;
}

/**
 * A historical import can have duplicate durable rows from an earlier sync.
 * Prefer the row linked by the current calendar event and leave all database
 * records untouched; callers receive only its canonical display/reporting row.
 */
export function getCanonicalImportedReservations<T extends ImportedReservationLike>(
  reservations: readonly T[] | null | undefined,
  linkedReservationIds: ReadonlySet<number> = new Set(),
): T[] {
  const selectedByExternalId = new Map<string, T>();
  for (const reservation of reservations ?? []) {
    const externalId = reservation.externalId?.trim();
    if (!externalId?.startsWith("ical:")) continue;
    const current = selectedByExternalId.get(externalId);
    if (!current) {
      selectedByExternalId.set(externalId, reservation);
      continue;
    }
    const isLinked = linkedReservationIds.has(reservation.id);
    const currentIsLinked = linkedReservationIds.has(current.id);
    if ((isLinked && !currentIsLinked) || (isLinked === currentIsLinked && reservation.id < current.id)) {
      selectedByExternalId.set(externalId, reservation);
    }
  }

  const canonicalIds = new Set(Array.from(selectedByExternalId.values()).map((reservation) => reservation.id));
  return (reservations ?? []).filter((reservation) => {
    const externalId = reservation.externalId?.trim();
    return !externalId?.startsWith("ical:") || canonicalIds.has(reservation.id);
  });
}

function getCalendarEventReservationKey(event: CalendarEventReservationLike): string {
  if (typeof event.reservationId === "number") return `reservation:${event.reservationId}`;
  const externalUid = event.externalUid?.trim();
  if (externalUid) return `external:${event.source ?? ""}:${externalUid}`;
  return `stay:${event.source ?? ""}:${toOperationalDateKey(event.arrivalDate)}:${toOperationalDateKey(event.departureDate)}`;
}

/**
 * Keep one editable calendar-event card per canonical imported stay. Existing
 * portal-code links win, then active events, so historical records remain usable.
 */
export function getCanonicalCalendarEventReservations<T extends CalendarEventReservationLike>(
  events: readonly T[] | null | undefined,
): T[] {
  const selectedByKey = new Map<string, T>();
  for (const event of events ?? []) {
    const key = getCalendarEventReservationKey(event);
    const current = selectedByKey.get(key);
    if (!current) {
      selectedByKey.set(key, event);
      continue;
    }
    const hasPreferredCode = Boolean(event.hasPortalCode) && !current.hasPortalCode;
    const hasSameCodeStatus = Boolean(event.hasPortalCode) === Boolean(current.hasPortalCode);
    const isActiveOverStale = Boolean(current.isStale) && !event.isStale;
    const hasSameStaleStatus = Boolean(event.isStale) === Boolean(current.isStale);
    const isEarlierRecord = Math.abs(event.id) < Math.abs(current.id);
    if (hasPreferredCode || (hasSameCodeStatus && (isActiveOverStale || (hasSameStaleStatus && isEarlierRecord)))) {
      selectedByKey.set(key, event);
    }
  }

  const canonicalIds = new Set(Array.from(selectedByKey.values()).map((event) => event.id));
  return (events ?? []).filter((event) => canonicalIds.has(event.id));
}

/**
 * A linked imported stay is represented by one editable calendar-event card.
 * Remove its durable reporting row only from the Reservations-page display so
 * the event-backed editor remains available and the stay is not shown twice.
 */
export function getReservationPageDisplayRecords<
  R extends ImportedReservationLike,
  E extends CalendarEventReservationLike,
>(
  reservations: readonly R[] | null | undefined,
  calendarEventReservations: readonly E[] | null | undefined,
): { durableReservations: R[]; eventReservations: E[] } {
  const eventReservations = getCanonicalCalendarEventReservations(calendarEventReservations);
  const eventBackedReservationIds = new Set(
    eventReservations
      .map((event) => event.reservationId)
      .filter((reservationId): reservationId is number => typeof reservationId === "number"),
  );

  return {
    durableReservations: (reservations ?? []).filter(
      (reservation) => !eventBackedReservationIds.has(reservation.id),
    ),
    eventReservations,
  };
}

/**
 * Dashboard counts canonical reservation rows only. Calendar events are
 * supporting records for those rows and must not add a second stay.
 */
export function getUpcomingReservations<T extends UpcomingReservationLike>(
  reservations: readonly T[] | null | undefined,
  today: string,
): T[] {
  return getCanonicalImportedReservations(reservations).filter(
    (reservation) => reservation.status !== "cancelled" && toOperationalDateKey(reservation.arrivalDate) >= today,
  );
}
