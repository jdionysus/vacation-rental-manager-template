import { describe, expect, it } from "vitest";
import { calculateMonthlyCohostDue, calculateMonthlyReservationSummary, calculatePlatformPayoutReconciliation, calculatePayoutSnapshot, hasRecordedPayoutValue } from "./financial-calculations";

describe("calculatePayoutSnapshot", () => {
  const stays = [{ reservationId: 42, grossRevenue: 1000, platformFees: 120, stayExpenses: 180 }];

  it("uses the configured payout basis", () => {
    expect(calculatePayoutSnapshot(stays, 25, "gross_revenue").totals.amountDue).toBe(250);
    expect(calculatePayoutSnapshot(stays, 25, "after_platform_fees").totals.amountDue).toBe(220);
    expect(calculatePayoutSnapshot(stays, 25, "after_stay_expenses").totals.amountDue).toBe(175);
  });

  it("excludes the cleaning fee collected from the co-host percentage basis", () => {
    const airbnbStay = [{ reservationId: 7, grossRevenue: 1150, platformFees: 34.5, netReceived: 1115.5, cleaningFeeCollected: 100, stayExpenses: 0 }];
    const snapshot = calculatePayoutSnapshot(airbnbStay, 25, "after_platform_fees_less_cleaning");

    expect(snapshot.items[0]).toMatchObject({ cleaningFeeCollected: 100, eligibleRevenue: 1015.5, amountDue: 253.88 });
    expect(snapshot.totals).toMatchObject({ cleaningFeeCollected: 100, eligibleRevenue: 1015.5, amountDue: 253.88 });
  });

  it("creates independent snapshots when a future rate changes", () => {
    const recordedPayout = calculatePayoutSnapshot(stays, 25, "after_platform_fees");
    const futurePayout = calculatePayoutSnapshot(stays, 30, "after_platform_fees");

    expect(recordedPayout.totals.amountDue).toBe(220);
    expect(futurePayout.totals.amountDue).toBe(264);
    expect(recordedPayout).not.toBe(futurePayout);
  });

  it("keeps a platform payout reconciliation explicit when a transfer is only partly allocated", () => {
    expect(calculatePlatformPayoutReconciliation(880, [400, 280])).toEqual({
      allocatedNet: 680,
      unallocatedNet: 200,
      isOverAllocated: false,
    });
  });

  it("calculates the current month co-host amount from net platform payouts", () => {
    expect(calculateMonthlyCohostDue([880, 420, -25], 25)).toBe(325);
  });

  it("summarizes actual reservation payouts separately from stay expenses", () => {
    expect(calculateMonthlyReservationSummary([
      { reservationId: 1, grossRevenue: 1000, platformFees: 120, netReceived: 880, stayExpenses: 180 },
      { reservationId: 2, grossRevenue: 600, platformFees: 90, netReceived: 510, cleaningFeeCollected: 100, stayExpenses: 60 },
    ])).toEqual({
      reservationCount: 2,
      grossRevenue: 1600,
      platformFees: 210,
      netReceived: 1390,
      cleaningFeeCollected: 100,
      cohostEligibleRevenue: 1290,
      stayExpenses: 240,
      netProfit: 1150,
    });
  });

  it("does not treat a preserved zero-value financial row as a paid reservation", () => {
    expect(hasRecordedPayoutValue({ grossRevenue: 0, platformFees: 0, netReceived: 0 })).toBe(false);
    expect(hasRecordedPayoutValue({ grossRevenue: 250, platformFees: 25, netReceived: 225 })).toBe(true);
    expect(hasRecordedPayoutValue({ grossRevenue: 50, platformFees: 50, netReceived: 0 })).toBe(true);
  });
});
