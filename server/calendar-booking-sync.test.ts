import { describe, expect, it } from "vitest";
import {
  getReservationSeedFromCalendarBooking,
  hasReasonableIcalDateSpan,
  type CalendarBookingForReservationSync,
} from "./calendar-booking-sync";

function makeEvent(overrides: Partial<CalendarBookingForReservationSync> = {}): CalendarBookingForReservationSync {
  return {
    id: 53,
    propertyId: 1,
    source: "vrbo",
    externalUid: "vrbo-uid-53",
    title: "Reserved - David",
    guestFirstNames: "David",
    guestPhone: null,
    guestCount: 1,
    notes: null,
    startDate: "2026-07-17",
    endDate: "2026-07-19",
    eventType: "booking",
    reservationId: null,
    isStale: false,
    ...overrides,
  };
}

describe("getReservationSeedFromCalendarBooking", () => {
  it("creates a confirmed reservation seed for an active imported booking", () => {
    expect(getReservationSeedFromCalendarBooking(makeEvent())).toEqual({
      propertyId: 1,
      source: "vrbo",
      status: "confirmed",
      guestName: "David",
      guestPhone: null,
      guestCount: 1,
      arrivalDate: "2026-07-17",
      departureDate: "2026-07-19",
      paymentStatus: "unpaid",
      notes: null,
      externalId: "ical:vrbo-uid-53",
    });
  });

  it("keeps a valid imported booking seed available for historical or linked reconciliation", () => {
    expect(getReservationSeedFromCalendarBooking(makeEvent({ isStale: true }))).toMatchObject({
      guestName: "David",
      externalId: "ical:vrbo-uid-53",
    });
    expect(getReservationSeedFromCalendarBooking(makeEvent({ reservationId: 99 }))).toMatchObject({
      guestName: "David",
      externalId: "ical:vrbo-uid-53",
    });
  });

  it("does not convert blocked or unavailable calendar events", () => {
    expect(getReservationSeedFromCalendarBooking(makeEvent({ eventType: "block" }))).toBeNull();
    expect(getReservationSeedFromCalendarBooking(makeEvent({ title: "CLOSED - Not available" }))).toBeNull();
  });
});

describe("hasReasonableIcalDateSpan", () => {
  it("accepts a completed historical booking within the permitted span", () => {
    expect(hasReasonableIcalDateSpan("2026-06-12", "2026-06-15")).toBe(true);
  });

  it("continues to reject malformed or implausibly long source spans", () => {
    expect(hasReasonableIcalDateSpan("2026-07-20", "2026-07-19")).toBe(false);
    expect(hasReasonableIcalDateSpan("2026-01-01", "2027-01-02")).toBe(false);
  });
});
