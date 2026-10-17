/**
 * Safe date utilities — DB returns dates as strings or Date objects depending on
 * the MySQL driver and superjson serialization. These helpers normalize everything
 * to a plain YYYY-MM-DD string without ever calling .toISOString() on unknown values.
 */

/** Convert any DB date value to a YYYY-MM-DD string safely */
export function toDateStr(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return "";
    return value.toISOString().split("T")[0];
  }
  const s = String(value);
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.split("T")[0];
  // Try parsing
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().split("T")[0];
  } catch {
    return "";
  }
}

/** Format a DB date value for display */
export function formatDate(value: unknown, opts?: Intl.DateTimeFormatOptions): string {
  const s = toDateStr(value);
  if (!s) return "—";
  try {
    // Parse as noon UTC to avoid off-by-one from timezone
    const d = new Date(s + "T12:00:00Z");
    return d.toLocaleDateString("en-US", opts ?? { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return s;
  }
}

/** Format a DB date value as short (e.g. "May 22") */
export function formatDateShort(value: unknown): string {
  return formatDate(value, { month: "short", day: "numeric" });
}

/** Get the number of nights between two DB date values */
export function getNights(arrival: unknown, departure: unknown): number {
  const a = toDateStr(arrival);
  const d = toDateStr(departure);
  if (!a || !d) return 0;
  try {
    const ms = new Date(d + "T12:00:00Z").getTime() - new Date(a + "T12:00:00Z").getTime();
    return Math.round(ms / 86400000);
  } catch {
    return 0;
  }
}
