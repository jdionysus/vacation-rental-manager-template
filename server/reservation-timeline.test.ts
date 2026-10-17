import { describe, expect, it } from "vitest";
import { getReservationsForTimeline, isReservationCurrent } from "../shared/reservation-timeline";

describe("getReservationsForTimeline", () => {
  const stays = [
    { id: "past-june", arrivalDate: "2026-06-03", departureDate: "2026-06-05" },
    { id: "past-july", arrivalDate: "2026-07-17", departureDate: "2026-07-19" },
    { id: "present", arrivalDate: "2026-07-26", departureDate: "2026-07-30" },
    { id: "future-august", arrivalDate: "2026-08-02", departureDate: "2026-08-04" },
    { id: "future-october", arrivalDate: "2026-10-02", departureDate: "2026-10-05" },
  ];

  it("uses conventional All, Current, Upcoming, and Past filters without hiding any stay", () => {
    const today = "2026-07-28";
    const all = getReservationsForTimeline(stays, "all", today);
    const current = getReservationsForTimeline(stays, "current", today);
    const past = getReservationsForTimeline(stays, "past", today);
    const upcoming = getReservationsForTimeline(stays, "upcoming", today);

    expect(all.map((stay) => stay.id)).toEqual([
      "past-june",
      "past-july",
      "present",
      "future-august",
      "future-october",
    ]);
    expect(past.map((stay) => stay.id)).toEqual(["past-july", "past-june"]);
    expect(current.map((stay) => stay.id)).toEqual(["present"]);
    expect(upcoming.map((stay) => stay.id)).toEqual(["future-august", "future-october"]);
    expect(all).toHaveLength(stays.length);
    expect(isReservationCurrent(stays[2], today)).toBe(true);
    expect(isReservationCurrent(stays[1], today)).toBe(false);
  });
});
