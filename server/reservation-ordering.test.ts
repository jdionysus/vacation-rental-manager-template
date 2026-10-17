import { describe, expect, it } from "vitest";
import { compareStaysByOperationalDate } from "../shared/reservation-ordering";

describe("compareStaysByOperationalDate", () => {
  it("lists every stay in one strict chronological arrival-date order", () => {
    const today = "2026-07-28";
    const stays = [
      { id: "past-old", arrivalDate: "2026-06-03", departureDate: "2026-06-05" },
      { id: "future-late", arrivalDate: "2026-10-02", departureDate: "2026-10-05" },
      { id: "current", arrivalDate: "2026-07-26", departureDate: "2026-07-30" },
      { id: "future-near", arrivalDate: "2026-08-02", departureDate: "2026-08-04" },
      { id: "past-recent", arrivalDate: "2026-07-20", departureDate: "2026-07-22" },
    ];

    const ordered = [...stays].sort((left, right) => compareStaysByOperationalDate(left, right, today));

    expect(ordered.map((stay) => stay.id)).toEqual([
      "past-old",
      "past-recent",
      "current",
      "future-near",
      "future-late",
    ]);
  });
});
