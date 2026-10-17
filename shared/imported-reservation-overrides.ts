/**
 * Converts an optional staff-entered imported-booking name into a durable
 * reservation override. Whitespace-only values intentionally leave the
 * existing durable name unchanged.
 */
export function getImportedReservationGuestNameOverride(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}
