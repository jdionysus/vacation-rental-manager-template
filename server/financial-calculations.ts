export type PayoutBasis = "gross_revenue" | "after_platform_fees" | "after_platform_fees_less_cleaning" | "after_stay_expenses";

export type FinancialStay = {
  reservationId: number;
  grossRevenue: number;
  platformFees: number;
  cleaningFeeCollected?: number;
  netReceived?: number;
  stayExpenses: number;
};

const money = (value: number) => Math.round(value * 100) / 100;

/**
 * A saved financial row can be intentionally retained with a received date and
 * zeroed amounts. It remains editable and visible in the all-reservations
 * ledger, but it is not an actual payout and must not inflate a month’s paid
 * reservation count, totals, or generated payout snapshot.
 */
export function hasRecordedPayoutValue(stay: Pick<FinancialStay, "grossRevenue" | "platformFees" | "netReceived">) {
  return [stay.grossRevenue, stay.platformFees, stay.netReceived ?? 0]
    .some((value) => Math.abs(Number(value)) > 0);
}

export function calculatePayoutSnapshot(stays: FinancialStay[], ratePercent: number, payoutBasis: PayoutBasis) {
  const items = stays.map((stay) => {
    const netReceived = stay.netReceived ?? stay.grossRevenue - stay.platformFees;
    const cleaningFeeCollected = stay.cleaningFeeCollected ?? 0;
    const eligibleRevenue = payoutBasis === "gross_revenue"
      ? stay.grossRevenue
      : payoutBasis === "after_platform_fees"
        ? netReceived
        : payoutBasis === "after_platform_fees_less_cleaning"
          ? netReceived - cleaningFeeCollected
        : netReceived - stay.stayExpenses;
    return {
      reservationId: stay.reservationId,
      grossRevenue: money(stay.grossRevenue),
      platformFees: money(stay.platformFees),
      cleaningFeeCollected: money(cleaningFeeCollected),
      stayExpenses: money(stay.stayExpenses),
      eligibleRevenue: money(Math.max(0, eligibleRevenue)),
      amountDue: money(Math.max(0, eligibleRevenue) * ratePercent / 100),
    };
  });
  const total = (field: keyof typeof items[number]) => money(items.reduce((sum, item) => sum + Number(item[field]), 0));
  return {
    items,
    totals: {
      grossRevenue: total("grossRevenue"),
      platformFees: total("platformFees"),
      cleaningFeeCollected: total("cleaningFeeCollected"),
      stayExpenses: total("stayExpenses"),
      eligibleRevenue: total("eligibleRevenue"),
      amountDue: total("amountDue"),
    },
  };
}

export function calculateMonthlyReservationSummary(stays: FinancialStay[]) {
  const total = (selector: (stay: FinancialStay) => number) => money(stays.reduce((sum, stay) => sum + selector(stay), 0));
  const grossRevenue = total((stay) => stay.grossRevenue);
  const platformFees = total((stay) => stay.platformFees);
  const netReceived = total((stay) => stay.netReceived ?? stay.grossRevenue - stay.platformFees);
  const cleaningFeeCollected = total((stay) => stay.cleaningFeeCollected ?? 0);
  const stayExpenses = total((stay) => stay.stayExpenses);
  return {
    reservationCount: stays.length,
    grossRevenue,
    platformFees,
    netReceived,
    cleaningFeeCollected,
    cohostEligibleRevenue: money(Math.max(0, netReceived - cleaningFeeCollected)),
    stayExpenses,
    netProfit: money(netReceived - stayExpenses),
  };
}

export function calculatePlatformPayoutReconciliation(netAmount: number, allocatedNetAmounts: number[]) {
  const allocatedNet = money(allocatedNetAmounts.reduce((sum, amount) => sum + Math.max(0, amount), 0));
  const net = money(Math.max(0, netAmount));
  return {
    allocatedNet,
    unallocatedNet: money(net - allocatedNet),
    isOverAllocated: allocatedNet > net,
  };
}

export function calculateMonthlyCohostDue(netPlatformPayouts: number[], ratePercent: number) {
  const eligibleNet = money(netPlatformPayouts.reduce((sum, amount) => sum + Math.max(0, amount), 0));
  return money(eligibleNet * Math.max(0, ratePercent) / 100);
}
