/**
 * Auto-task creation handler — runs every hour via Heartbeat cron.
 * Finds reservations that checked out within the last 2 hours and
 * creates Cleaning + Property Manager Pre Check-In tasks if they don't exist yet.
 * Fully idempotent: checks for existing tasks before creating.
 */
import { Request, Response } from "express";
import { getDb } from "./db";
import { reservations, tasks, checklistTemplates } from "../drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { sdk } from "./_core/sdk";

export async function autoTasksHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: "cron-only" });
    }

    const db = await getDb();
    if (!db) return res.json({ ok: true, skipped: "no-db" });

    // Find reservations that checked out today or yesterday (UTC)
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const yesterdayStr = new Date(now.getTime() - 86400000).toISOString().split("T")[0];

    const checkouts = await db.select().from(reservations).where(
      and(
        eq(reservations.propertyId, 1),
        sql`DATE(${reservations.departureDate}) >= ${yesterdayStr}`,
        sql`DATE(${reservations.departureDate}) <= ${todayStr}`,
      )
    );

    if (checkouts.length === 0) {
      return res.json({ ok: true, processed: 0, message: "No checkouts in window" });
    }

    // Load checklist templates
    const templateRows = await db.select().from(checklistTemplates).where(eq(checklistTemplates.propertyId, 1));
    const cleaningTemplate = templateRows.find(t => t.name.toLowerCase().includes("cleaning"));
    const propertymanagerTemplate = templateRows.find(t => t.name.toLowerCase().includes("property-manager") || t.name.toLowerCase().includes("propertymanager") || t.name.toLowerCase().includes("pre check"));

    // Default checklists if templates not found
    const defaultCleaningItems = [
      "Strip and replace all bed linens","Scrub toilet inside and out","Clean sink and faucet",
      "Clean shower/tub","Mop bathroom floor","Replace towels","Restock toilet paper (min 4 rolls)",
      "Wipe down all countertops","Clean stovetop","Run and empty dishwasher",
      "Empty all trash and replace liners","Vacuum all floors","Mop hard floors",
      "Check all closets — remove left items","Set thermostat to 68°F","Take photos of completed clean",
    ].map(item => ({ item, done: false }));

    const defaultCohostItems = [
      "Confirm cleaning is complete — full walkthrough","Check all linens are fresh",
      "Verify towels staged in bathroom","Check kitchen fully stocked",
      "Confirm toilet paper stocked (min 4 rolls)","Test WiFi — confirm password correct",
      "Check thermostat set to 68°F","Test door code at least once",
      "Confirm parking space is clear","Test smoke detector","Test CO detector",
      "Take walkthrough photos","Send guest check-in message with access code",
    ].map(item => ({ item, done: false }));

    const cleaningChecklist = cleaningTemplate
      ? (cleaningTemplate.items as {item:string;required:boolean}[]).map(i => ({ item: i.item, done: false }))
      : defaultCleaningItems;

    const propertymanagerChecklist = propertymanagerTemplate
      ? (propertymanagerTemplate.items as {item:string;required:boolean}[]).map(i => ({ item: i.item, done: false }))
      : defaultCohostItems;

    let created = 0;
    let skipped = 0;

    for (const res of checkouts) {
      const departureDateStr = String(res.departureDate).split("T")[0];

      // Check if tasks already exist for this reservation (idempotency)
      const existingTasks = await db.select().from(tasks).where(
        and(eq(tasks.reservationId, res.id), eq(tasks.propertyId, 1))
      );

      const hasCleaningTask = existingTasks.some(t => t.title.toLowerCase().includes("cleaning") || t.type === "turnover");
      const hasCohostTask = existingTasks.some(t => t.title.toLowerCase().includes("property-manager") || t.title.toLowerCase().includes("pre check") || t.type === "inspection");

      if (!hasCleaningTask) {
        await db.insert(tasks).values({
          propertyId: 1,
          reservationId: res.id,
          type: "turnover",
          title: `Cleaning — ${res.guestName ?? "Guest"} checkout ${departureDateStr}`,
          notes: `Auto-created on checkout. Guest: ${res.guestName ?? "Unknown"} | Departure: ${departureDateStr}`,
          dueDate: departureDateStr as unknown as Date,
          departureWindow: "By 11:00 AM",
          arrivalWindow: "After 3:00 PM",
          checklist: cleaningChecklist,
          status: "pending",
        });
        created++;
      } else {
        skipped++;
      }

      if (!hasCohostTask) {
        await db.insert(tasks).values({
          propertyId: 1,
          reservationId: res.id,
          type: "inspection",
          title: `Pre Check-In Inspection — ${res.guestName ?? "Guest"} checkout ${departureDateStr}`,
          notes: `Auto-created on checkout. Verify property is ready for next guest.`,
          dueDate: departureDateStr as unknown as Date,
          departureWindow: "By 11:00 AM",
          arrivalWindow: "Before 3:00 PM",
          checklist: propertymanagerChecklist,
          status: "pending",
        });
        created++;
      } else {
        skipped++;
      }
    }

    return res.json({
      ok: true,
      processed: checkouts.length,
      tasksCreated: created,
      tasksSkipped: skipped,
      checkouts: checkouts.map(r => ({ id: r.id, guest: r.guestName, departure: String(r.departureDate).split("T")[0] })),
    });

  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[auto-tasks] Error:", error);
    return res.status(500).json({
      error,
      context: { url: req.url },
      timestamp: new Date().toISOString(),
    });
  }
}
