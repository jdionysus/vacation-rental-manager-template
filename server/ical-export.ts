import { Request, Response } from "express";
import { getDb, getProperty } from "./db";
import { reservations, calendarEvents } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export async function icalExportHandler(req: Request, res: Response) {
  try {
    const db = await getDb();
    if (!db) return void res.status(503).send("Database unavailable");
    const propertyId = 1;
    const [propertyInfo, bookings, blocks] = await Promise.all([
      getProperty(propertyId),
      db.select().from(reservations).where(eq(reservations.propertyId, propertyId)),
      db.select().from(calendarEvents).where(eq(calendarEvents.propertyId, propertyId)),
    ]);
    const propertyName = propertyInfo?.name || "Vacation Rental";
    const uidHost = (req.get("host") || "local").replace(/[^a-zA-Z0-9.-]/g, "");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const now = new Date();
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Vacation Rental Manager//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escapeIcal(`${propertyName} Availability`)}`, `X-WR-CALDESC:${escapeIcal(`Bookings and blocked dates for ${propertyName}`)}`];
    for (const booking of bookings) {
      if (!booking.arrivalDate || !booking.departureDate || ["cancelled", "pending"].includes(booking.status)) continue;
      const start = toDate(booking.arrivalDate), end = toDate(booking.departureDate);
      if (end <= today) continue;
      addEvent(lines, `booking-${booking.id}@${uidHost}`, start, end, `Reserved - ${propertyName}`, booking.createdAt || now);
    }
    for (const block of blocks) {
      if (!block.startDate || !block.endDate || block.reservationId) continue;
      const start = toDate(block.startDate), end = toDate(block.endDate);
      if (end <= today || (end.getTime() - start.getTime()) / 86400000 > 365) continue;
      addEvent(lines, `block-${block.id}@${uidHost}`, start, end, block.title || `Blocked - ${propertyName}`, block.createdAt || now);
    }
    lines.push("END:VCALENDAR");
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="availability.ics"');
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(`${lines.join("\r\n")}\r\n`);
  } catch (error) { console.error("[iCal Export] Error:", error); res.status(500).send("Error generating calendar"); }
}
function toDate(value: Date | string) { return value instanceof Date ? value : new Date(`${value}T00:00:00Z`); }
function date(value: Date) { return `${value.getUTCFullYear()}${String(value.getUTCMonth() + 1).padStart(2, "0")}${String(value.getUTCDate()).padStart(2, "0")}`; }
function dateTime(value: Date) { return `${date(value)}T${String(value.getUTCHours()).padStart(2, "0")}${String(value.getUTCMinutes()).padStart(2, "0")}${String(value.getUTCSeconds()).padStart(2, "0")}Z`; }
function escapeIcal(value: string) { return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }
function addEvent(lines: string[], uid: string, start: Date, end: Date, summary: string, created: Date) { lines.push("BEGIN:VEVENT", `UID:${uid}`, `DTSTART;VALUE=DATE:${date(start)}`, `DTEND;VALUE=DATE:${date(end)}`, `SUMMARY:${escapeIcal(summary)}`, `CREATED:${dateTime(created)}`, `LAST-MODIFIED:${dateTime(created)}`, "STATUS:CONFIRMED", "TRANSP:OPAQUE", "END:VEVENT"); }
