export type OperationalStay = {
  arrivalDate: Date | string | null | undefined;
  departureDate?: Date | string | null | undefined;
};

function dateKey(value: Date | string | null | undefined): string {
  if (!value) return "9999-12-31";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/**
 * Keeps operational lists in one strict chronological sequence by arrival
 * date. Records without an arrival date follow dated records.
 */
export function compareStaysByOperationalDate(
  left: OperationalStay,
  right: OperationalStay,
  _today?: string,
): number {
  const leftArrival = dateKey(left.arrivalDate);
  const rightArrival = dateKey(right.arrivalDate);
  const arrivalComparison = leftArrival.localeCompare(rightArrival);
  if (arrivalComparison !== 0) return arrivalComparison;
  return dateKey(left.departureDate).localeCompare(dateKey(right.departureDate));
}
