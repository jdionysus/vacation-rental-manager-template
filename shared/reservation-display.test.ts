import { describe, expect, it } from "vitest";
import {
  getCalendarEventReferenceCandidates,
  getCanonicalCalendarEventReservations,
  getCanonicalImportedReservations,
  getDisplayedGuestName,
  getGuestSessionName,
  getReservationPageDisplayRecords,
  getUpcomingReservations,
  sameCalendarEventReference,
  shouldRenderPastImportedReservationInline,
} from "./reservation-display";

describe("reservation display reconciliation", () => {
  it("counts each canonical upcoming reservation once and excludes cancelled or past rows", () => {
    const upcoming = getUpcomingReservations([
      { id: 1, status: "confirmed", arrivalDate: "2026-07-29" },
      { id: 2, status: "cancelled", arrivalDate: "2026-07-29" },
      { id: 3, status: "confirmed", arrivalDate: "2026-07-17" },
    ], "2026-07-28");

    expect(upcoming.map((reservation) => reservation.id)).toEqual([1]);
  });

  it("counts duplicate linked imported stays once in dashboard-style upcoming aggregation", () => {
    const upcoming = getUpcomingReservations([
      { id: 31, externalId: "ical:vrbo-88", status: "confirmed", arrivalDate: "2026-07-29" },
      { id: 52, externalId: "ical:vrbo-88", status: "confirmed", arrivalDate: "2026-07-29" },
      { id: 9, externalId: null, status: "confirmed", arrivalDate: "2026-08-01" },
    ], "2026-07-28");

    expect(upcoming.map((reservation) => reservation.id)).toEqual([31, 9]);
  });

  it("matches existing calendar-backed portal codes regardless of the legacy ID sign", () => {
    expect(sameCalendarEventReference(-63, 63)).toBe(true);
    expect(sameCalendarEventReference(63, -63)).toBe(true);
    expect(sameCalendarEventReference(-63, 52)).toBe(false);
    expect(sameCalendarEventReference(null, 63)).toBe(false);
    expect(getCalendarEventReferenceCandidates(63)).toEqual([63, -63]);
  });

  it("preserves a stored guest name and only replaces generic imported placeholders", () => {
    expect(getDisplayedGuestName("Danette", "Danielle")).toBe("Danette");
    expect(getDisplayedGuestName("Guest", "Danette")).toBe("Danette");
    expect(getDisplayedGuestName("Reserved", "Jessica & John")).toBe("Jessica & John");
    expect(getDisplayedGuestName(null, null)).toBeNull();
  });

  it("keeps an existing session name regardless of the historical session field used", () => {
    expect(getGuestSessionName({ guestName: "Danette" })).toBe("Danette");
    expect(getGuestSessionName({ guestFirstNames: "Reserved - Jessica" })).toBe("Jessica");
    expect(getGuestSessionName({ guestName: "Guest", guestFirstNames: "Maya" })).toBe("Maya");
  });

  it("uses the same stored guest name for manual, QR, and Wi-Fi session payloads", () => {
    const entrySessions = [
      { entry: "manual", session: { guestName: "Danette", guestFirstNames: "Danette" } },
      { entry: "QR", session: { guestName: "Jessica", guestFirstNames: "Jessica" } },
      { entry: "Wi-Fi", session: { guestName: "Maya", guestFirstNames: "Maya" } },
    ];

    expect(entrySessions.map(({ session }) => getGuestSessionName(session))).toEqual(["Danette", "Jessica", "Maya"]);
  });

  it("returns only the calendar-linked durable row for duplicate imported reservations", () => {
    const canonical = getCanonicalImportedReservations([
      { id: 31, externalId: "ical:vrbo-88" },
      { id: 52, externalId: "ical:vrbo-88" },
      { id: 9, externalId: null },
    ], new Set([52]));

    expect(canonical.map((reservation) => reservation.id)).toEqual([52, 9]);
  });

  it("keeps one editable imported-event card and prefers the event with its existing portal code", () => {
    const canonical = getCanonicalCalendarEventReservations([
      { id: -41, reservationId: 52, externalUid: "vrbo-88", source: "vrbo", isStale: false },
      { id: -42, reservationId: 52, externalUid: "vrbo-88", source: "vrbo", isStale: true, hasPortalCode: true },
    ]);

    expect(canonical.map((event) => event.id)).toEqual([-42]);
  });

  it("shows one editable event-backed card instead of a duplicate durable row for a linked historical stay", () => {
    const display = getReservationPageDisplayRecords(
      [
        { id: 52, externalId: "ical:vrbo-88" },
        { id: 9, externalId: null },
      ],
      [
        { id: -42, reservationId: 52, externalUid: "vrbo-88", source: "vrbo", hasPortalCode: true },
      ],
    );

    expect(display.durableReservations.map((reservation) => reservation.id)).toEqual([9]);
    expect(display.eventReservations.map((event) => event.id)).toEqual([-42]);
    expect(display.eventReservations[0]?.reservationId).toBe(52);
  });

  it("uses the inline list editor for a past durable iCal import without routing to details", () => {
    expect(shouldRenderPastImportedReservationInline(
      { id: 52, externalId: "ical:vrbo-88", departureDate: "2026-07-19" },
      "2026-07-28",
    )).toBe(true);
    expect(shouldRenderPastImportedReservationInline(
      { id: 53, externalId: "ical:vrbo-89", departureDate: "2026-07-29" },
      "2026-07-28",
    )).toBe(false);
    expect(shouldRenderPastImportedReservationInline(
      { id: 9, externalId: null, departureDate: "2026-07-19" },
      "2026-07-28",
    )).toBe(false);
  });
});
