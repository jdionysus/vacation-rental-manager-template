import { describe, expect, it } from "vitest";
import { getImportedReservationGuestNameOverride } from "../shared/imported-reservation-overrides";

describe("getImportedReservationGuestNameOverride", () => {
  it("preserves a staff-entered name as the durable imported-booking override", () => {
    expect(getImportedReservationGuestNameOverride("  Jessica & John  ")).toBe("Jessica & John");
  });

  it("does not replace an existing durable name for blank, null, or omitted edits", () => {
    expect(getImportedReservationGuestNameOverride("   ")).toBeNull();
    expect(getImportedReservationGuestNameOverride(null)).toBeNull();
    expect(getImportedReservationGuestNameOverride(undefined)).toBeNull();
  });
});
