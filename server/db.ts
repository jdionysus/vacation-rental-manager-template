import { and, desc, eq, gte, isNull, lte, ne, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  bookingRequests,
  bypassCodes,
  calendarEvents,
  cohosts,
  cohostRateHistory,
  costs,
  guestAccessCodes,
  guestPages,
  icalFeeds,
  InsertUser,
  property,
  payoutItems,
  payouts,
  platformPayoutAllocations,
  platformPayouts,
  reservationFinancials,
  reservations,
  tasks,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getReservationSeedFromCalendarBooking } from "./calendar-booking-sync";
import { calculateMonthlyCohostDue, calculateMonthlyReservationSummary, calculatePlatformPayoutReconciliation, calculatePayoutSnapshot, hasRecordedPayoutValue } from "./financial-calculations";
import { compareStaysByOperationalDate } from "../shared/reservation-ordering";
import { getCanonicalImportedReservations, getDisplayedGuestName, sameCalendarEventReference } from "../shared/reservation-display";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    textFields.forEach((field) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    });
    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(desc(users.createdAt));
}

export async function updateUserRole(userId: number, role: typeof users.$inferSelect["role"]) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

// ─── Property ────────────────────────────────────────────────────────────────

export async function getProperty(id = 1) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(property).where(eq(property.id, id)).limit(1);
  return result[0] ?? null;
}

export async function updateProperty(id: number, data: Partial<typeof property.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(property).set(data).where(eq(property.id, id));
}

// ─── Reservations ─────────────────────────────────────────────────────────────

function dateKey(value: Date | string) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function isHistoricalBookingEvent(event: typeof calendarEvents.$inferSelect, today = new Date()) {
  return event.isStale === true
    && event.eventType === "booking"
    && dateKey(event.endDate) < today.toISOString().slice(0, 10);
}

function withImportedEventDetails(
  reservation: typeof reservations.$inferSelect,
  event: typeof calendarEvents.$inferSelect | undefined,
) {
  if (!event) return reservation;
  return {
    ...reservation,
    guestName: getDisplayedGuestName(reservation.guestName, event.guestFirstNames),
    guestPhone: event.guestPhone || reservation.guestPhone,
    guestCount: event.guestCount ?? reservation.guestCount,
    notes: event.notes || reservation.notes,
  };
}

export async function getReservations(propertyId = 1) {
  await syncCalendarBookingsToReservations(propertyId);
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(reservations)
    .where(eq(reservations.propertyId, propertyId))
    .orderBy(desc(reservations.arrivalDate));
  const importedEvents = await db.select().from(calendarEvents).where(and(
    eq(calendarEvents.propertyId, propertyId),
    eq(calendarEvents.eventType, "booking"),
  ));
  const eventByReservationId = new Map(
    importedEvents
      .filter((event) => typeof event.reservationId === "number")
      .map((event) => [event.reservationId as number, event]),
  );
  const canonicalRows = getCanonicalImportedReservations(rows, new Set(eventByReservationId.keys()));
  return canonicalRows.map((reservation) => withImportedEventDetails(reservation, eventByReservationId.get(reservation.id)));
}

export async function syncCalendarBookingsToReservations(propertyId = 1) {
  const db = await getDb();
  if (!db) return { created: 0, linked: 0 };

  const events = (await db.select().from(calendarEvents).where(eq(calendarEvents.propertyId, propertyId)))
    .filter((event) => !event.isStale || isHistoricalBookingEvent(event));
  let created = 0;
  let linked = 0;

  for (const event of events) {
    const seed = getReservationSeedFromCalendarBooking(event);
    if (!seed) continue;

    if (typeof event.reservationId === "number") {
      const [linkedReservation] = await db.select({ id: reservations.id }).from(reservations)
        .where(eq(reservations.id, event.reservationId)).limit(1);
      if (linkedReservation) continue;
    }

    const [existing] = await db.select({ id: reservations.id }).from(reservations).where(and(
      eq(reservations.propertyId, propertyId),
      eq(reservations.externalId, seed.externalId),
    )).limit(1);
    const reservationId = existing?.id ?? Number((await db.insert(reservations).values({
      ...seed,
      arrivalDate: seed.arrivalDate as unknown as Date,
      departureDate: seed.departureDate as unknown as Date,
    }))[0].insertId);

    if (!existing) created++;
    if (event.reservationId !== reservationId) {
      await db.update(calendarEvents).set({ reservationId }).where(eq(calendarEvents.id, event.id));
      linked++;
    }
  }

  return { created, linked };
}

export async function getReservationById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(reservations).where(eq(reservations.id, id)).limit(1);
  if (!result[0]) return null;
  const [event] = await db.select().from(calendarEvents)
    .where(and(eq(calendarEvents.propertyId, result[0].propertyId), eq(calendarEvents.reservationId, id)))
    .limit(1);
  return withImportedEventDetails(result[0], event);
}

export async function createReservation(data: typeof reservations.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(reservations).values(data);
  return result[0];
}

export async function updateReservation(id: number, data: Partial<typeof reservations.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(reservations).set(data).where(eq(reservations.id, id));
}

export async function deleteReservation(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(reservations).where(eq(reservations.id, id));
}

// ─── Calendar Events ──────────────────────────────────────────────────────────

export async function getCalendarEvents(propertyId = 1) {
  await syncCalendarBookingsToReservations(propertyId);
  const db = await getDb();
  if (!db) return [];
  const events = await db.select().from(calendarEvents)
    .where(eq(calendarEvents.propertyId, propertyId))
    .orderBy(calendarEvents.startDate);
  return events.filter((event) => !event.isStale || isHistoricalBookingEvent(event));
}

export async function upsertCalendarEvent(data: typeof calendarEvents.$inferInsert) {
  const db = await getDb();
  if (!db) return;
  if (data.externalUid) {
    const existing = await db.select().from(calendarEvents).where(and(eq(calendarEvents.externalUid, data.externalUid), eq(calendarEvents.propertyId, data.propertyId ?? 1))).limit(1);
    if (existing[0]) {
      // Feed refreshes must not erase enrichment entered by staff for imported stays.
      // iCal feeds often omit guest names, phone numbers, counts, and internal notes.
      const updateData: Record<string, unknown> = { ...data, lastSeenAt: new Date(), isStale: false };
      for (const field of ["guestFirstNames", "guestPhone", "guestCount", "notes"] as const) {
        if (updateData[field] === undefined || updateData[field] === null || updateData[field] === "") {
          delete updateData[field];
        }
      }
      await db.update(calendarEvents).set(updateData as typeof calendarEvents.$inferInsert).where(eq(calendarEvents.id, existing[0].id));
      return;
    }
  }
  await db.insert(calendarEvents).values({ ...data, lastSeenAt: new Date() });
}

export async function createCalendarEvent(data: typeof calendarEvents.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(calendarEvents).values(data);
}

export async function deleteCalendarEvent(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
}

export async function markCalendarEventsStaleBySource(source: string, propertyId = 1) {
  const db = await getDb();
  if (!db) return;
  // Mark all events from this source as stale before re-syncing
  // Events seen in the new feed will be un-staled; events not seen will stay stale and be filtered out
  await db.update(calendarEvents)
    .set({ isStale: true })
    .where(and(eq(calendarEvents.source, source as any), eq(calendarEvents.propertyId, propertyId)));
}

// ─── iCal Feeds ───────────────────────────────────────────────────────────────

export async function getIcalFeeds(propertyId = 1) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(icalFeeds).where(eq(icalFeeds.propertyId, propertyId)).orderBy(icalFeeds.source);
}

export async function createIcalFeed(data: typeof icalFeeds.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(icalFeeds).values(data);
}

export async function updateIcalFeed(id: number, data: Partial<typeof icalFeeds.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(icalFeeds).set(data).where(eq(icalFeeds.id, id));
}

export async function deleteIcalFeed(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(icalFeeds).where(eq(icalFeeds.id, id));
}

// ─── Guest Access Codes ───────────────────────────────────────────────────────

export async function getAccessCodeByCode(code: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(guestAccessCodes).where(eq(guestAccessCodes.code, code)).limit(1);
  return result[0] ?? null;
}

export async function createAccessCode(data: typeof guestAccessCodes.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(guestAccessCodes).values(data);
}

export async function updateAccessCode(id: number, data: Partial<typeof guestAccessCodes.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(guestAccessCodes).set(data).where(eq(guestAccessCodes.id, id));
}

export async function getAccessCodesByReservation(reservationId: number) {
  const db = await getDb();
  if (!db) return [];
  const reservationCodes = await db.select().from(guestAccessCodes)
    .where(eq(guestAccessCodes.reservationId, reservationId));
  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, reservationId)).limit(1);
  if (!reservation) return reservationCodes.map((code) => ({ ...code, origin: "reservation" as const }));

  const linkedEvents = await db.select({ id: calendarEvents.id }).from(calendarEvents).where(and(
    eq(calendarEvents.propertyId, reservation.propertyId),
    eq(calendarEvents.reservationId, reservationId),
  ));
  const eventIds = new Set(linkedEvents.map((event) => event.id));
  if (eventIds.size === 0) return reservationCodes.map((code) => ({ ...code, origin: "reservation" as const }));

  const eventCodes = (await db.select().from(bypassCodes)
    .where(eq(bypassCodes.propertyId, reservation.propertyId)))
    .filter((code) => code.calendarEventId !== null && Array.from(eventIds).some((eventId) => sameCalendarEventReference(code.calendarEventId, eventId)))
    .map((code) => ({
      id: code.id,
      reservationId,
      code: code.code,
      validFrom: reservation.arrivalDate,
      validUntil: code.expiresAt ?? reservation.departureDate,
      isRevoked: !code.isActive,
      useCount: code.useCount,
      createdAt: code.createdAt,
      origin: "calendar_event" as const,
    }));
  return [
    ...reservationCodes.map((code) => ({ ...code, origin: "reservation" as const })),
    ...eventCodes,
  ];
}

// ─── Guest Pages ──────────────────────────────────────────────────────────────

export async function getGuestPages(propertyId = 1) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(guestPages).where(eq(guestPages.propertyId, propertyId)).orderBy(guestPages.sortOrder);
}

export async function getGuestPageBySlug(slug: string, propertyId = 1) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(guestPages).where(and(eq(guestPages.slug, slug), eq(guestPages.propertyId, propertyId))).limit(1);
  return result[0] ?? null;
}

export async function updateGuestPage(id: number, data: Partial<typeof guestPages.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(guestPages).set(data).where(eq(guestPages.id, id));
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function getTasks(propertyId = 1) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tasks).where(eq(tasks.propertyId, propertyId)).orderBy(desc(tasks.dueDate));
}

export async function getTasksByAssignee(assignedToId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tasks).where(eq(tasks.assignedToId, assignedToId)).orderBy(desc(tasks.dueDate));
}

export async function createTask(data: typeof tasks.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(tasks).values(data);
}

export async function updateTask(id: number, data: Partial<typeof tasks.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(tasks).set(data).where(eq(tasks.id, id));
}

export async function deleteTask(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(tasks).where(eq(tasks.id, id));
}

// ─── Costs ────────────────────────────────────────────────────────────────────

export async function getCosts(propertyId = 1) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(costs).where(eq(costs.propertyId, propertyId)).orderBy(desc(costs.costDate));
}

export async function createCost(data: typeof costs.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(costs).values(data);
}

export async function updateCost(id: number, data: Partial<typeof costs.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(costs).set(data).where(eq(costs.id, id));
}

export async function deleteCost(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(costs).where(eq(costs.id, id));
}

// ─── Financial ledger & payouts ───────────────────────────────────────────────

let financialSchemaReady: Promise<void> | null = null;

/**
 * The production app deploys directly from main and does not run Drizzle migrations
 * as a release step. These idempotent statements let the first financial request
 * create only the new, generated tables in the same database used by the app.
 */
async function ensureFinancialSchema() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (!financialSchemaReady) {
    financialSchemaReady = (async () => {
      await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS reservation_financials (
        id int AUTO_INCREMENT NOT NULL PRIMARY KEY,
        propertyId int NOT NULL DEFAULT 1,
        reservationId int NOT NULL UNIQUE,
        grossRevenue decimal(10,2) NOT NULL DEFAULT '0',
        platformFees decimal(10,2) NOT NULL DEFAULT '0',
        cleaningFeeCollected decimal(10,2) NOT NULL DEFAULT '0',
        netReceived decimal(10,2),
        revenueReceivedAt date,
        notes text,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`));
      await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS platform_payouts (
        id int AUTO_INCREMENT NOT NULL PRIMARY KEY,
        propertyId int NOT NULL DEFAULT 1,
        platform enum('airbnb','vrbo','booking_com','other') NOT NULL,
        payoutDate date NOT NULL,
        grossAmount decimal(10,2) NOT NULL DEFAULT '0',
        platformFees decimal(10,2) NOT NULL DEFAULT '0',
        netAmount decimal(10,2) NOT NULL DEFAULT '0',
        reference varchar(255),
        notes text,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`));
      await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS platform_payout_allocations (
        id int AUTO_INCREMENT NOT NULL PRIMARY KEY,
        platformPayoutId int NOT NULL,
        reservationId int NOT NULL,
        grossAmount decimal(10,2) NOT NULL DEFAULT '0',
        platformFees decimal(10,2) NOT NULL DEFAULT '0',
        netAmount decimal(10,2) NOT NULL DEFAULT '0',
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`));
      await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS cohosts (
        id int AUTO_INCREMENT NOT NULL PRIMARY KEY,
        propertyId int NOT NULL DEFAULT 1,
        name varchar(255) NOT NULL,
        ratePercent decimal(5,2) NOT NULL DEFAULT '25.00',
        payoutBasis enum('gross_revenue','after_platform_fees','after_platform_fees_less_cleaning','after_stay_expenses') NOT NULL DEFAULT 'after_platform_fees_less_cleaning',
        isActive boolean NOT NULL DEFAULT true,
        notes text,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`));
      await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS cohost_rate_history (
        id int AUTO_INCREMENT NOT NULL PRIMARY KEY,
        propertyId int NOT NULL DEFAULT 1,
        cohostId int NOT NULL,
        effectiveMonth varchar(7) NOT NULL,
        ratePercent decimal(5,2) NOT NULL,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`));
      await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS payouts (
        id int AUTO_INCREMENT NOT NULL PRIMARY KEY,
        propertyId int NOT NULL DEFAULT 1,
        cohostId int NOT NULL,
        payoutMonth varchar(7) NOT NULL,
        status enum('draft','approved','paid') NOT NULL DEFAULT 'draft',
        ratePercentSnapshot decimal(5,2) NOT NULL,
        payoutBasisSnapshot enum('gross_revenue','after_platform_fees','after_platform_fees_less_cleaning','after_stay_expenses') NOT NULL,
        grossRevenueSnapshot decimal(10,2) NOT NULL DEFAULT '0',
        platformFeesSnapshot decimal(10,2) NOT NULL DEFAULT '0',
        cleaningFeeCollectedSnapshot decimal(10,2) NOT NULL DEFAULT '0',
        stayExpensesSnapshot decimal(10,2) NOT NULL DEFAULT '0',
        eligibleRevenueSnapshot decimal(10,2) NOT NULL DEFAULT '0',
        amountDueSnapshot decimal(10,2) NOT NULL DEFAULT '0',
        paidAt timestamp,
        notes text,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`));
      await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS payout_items (
        id int AUTO_INCREMENT NOT NULL PRIMARY KEY,
        payoutId int NOT NULL,
        reservationId int NOT NULL,
        grossRevenueSnapshot decimal(10,2) NOT NULL DEFAULT '0',
        platformFeesSnapshot decimal(10,2) NOT NULL DEFAULT '0',
        cleaningFeeCollectedSnapshot decimal(10,2) NOT NULL DEFAULT '0',
        stayExpensesSnapshot decimal(10,2) NOT NULL DEFAULT '0',
        eligibleRevenueSnapshot decimal(10,2) NOT NULL DEFAULT '0',
        amountDueSnapshot decimal(10,2) NOT NULL DEFAULT '0',
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`));
      const addColumnIfMissing = async (table: string, column: string, definition: string) => {
        try {
          await db.execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!/duplicate column|already exists/i.test(message)) throw error;
        }
      };
      await addColumnIfMissing("reservation_financials", "cleaningFeeCollected", "decimal(10,2) NOT NULL DEFAULT '0'");
      await addColumnIfMissing("payouts", "cleaningFeeCollectedSnapshot", "decimal(10,2) NOT NULL DEFAULT '0'");
      await addColumnIfMissing("payout_items", "cleaningFeeCollectedSnapshot", "decimal(10,2) NOT NULL DEFAULT '0'");
      await db.execute(sql.raw("ALTER TABLE cohosts MODIFY COLUMN payoutBasis enum('gross_revenue','after_platform_fees','after_platform_fees_less_cleaning','after_stay_expenses') NOT NULL DEFAULT 'after_platform_fees_less_cleaning'"));
      await db.execute(sql.raw("ALTER TABLE payouts MODIFY COLUMN payoutBasisSnapshot enum('gross_revenue','after_platform_fees','after_platform_fees_less_cleaning','after_stay_expenses') NOT NULL"));
      await db.execute(sql.raw("UPDATE cohosts SET payoutBasis = 'after_platform_fees_less_cleaning' WHERE payoutBasis = 'after_platform_fees'"));
    })().catch((error) => {
      financialSchemaReady = null;
      throw error;
    });
  }
  await financialSchemaReady;
}

const amount = (value: string | number | null | undefined) => Number.parseFloat(String(value ?? 0)) || 0;
const money = (value: number) => Math.round(value * 100) / 100;

export type PayoutBasis = "gross_revenue" | "after_platform_fees" | "after_platform_fees_less_cleaning" | "after_stay_expenses";

export type PlatformPayoutInput = {
  propertyId?: number;
  platform: "airbnb" | "vrbo" | "booking_com" | "other";
  payoutDate: string;
  grossAmount: string;
  platformFees: string;
  netAmount: string;
  reference?: string | null;
  notes?: string | null;
  allocations?: Array<{
    reservationId: number;
    grossAmount: string;
    platformFees: string;
    netAmount: string;
  }>;
};

export async function getPlatformPayouts(propertyId = 1, month?: string) {
  await ensureFinancialSchema();
  const db = await getDb();
  if (!db) return [];
  const [year, monthNumber] = month?.split("-").map(Number) ?? [];
  const monthStart = month ? new Date(Date.UTC(year, monthNumber - 1, 1)) : null;
  const monthEnd = month ? new Date(Date.UTC(year, monthNumber, 0)) : null;
  const condition = monthStart && monthEnd
    ? and(eq(platformPayouts.propertyId, propertyId), gte(platformPayouts.payoutDate, monthStart), lte(platformPayouts.payoutDate, monthEnd))
    : eq(platformPayouts.propertyId, propertyId);
  const [rows, allocations, propertyReservations] = await Promise.all([
    db.select().from(platformPayouts).where(condition).orderBy(desc(platformPayouts.payoutDate), desc(platformPayouts.createdAt)),
    db.select().from(platformPayoutAllocations),
    getReservations(propertyId),
  ]);
  const reservationsById = new Map(propertyReservations.map((reservation) => [reservation.id, reservation]));
  return rows.map((payout) => {
    const items = allocations.filter((allocation) => allocation.platformPayoutId === payout.id).map((allocation) => ({
      ...allocation,
      reservation: reservationsById.get(allocation.reservationId) ?? null,
    }));
    const reconciliation = calculatePlatformPayoutReconciliation(amount(payout.netAmount), items.map((item) => amount(item.netAmount)));
    return { ...payout, items, ...reconciliation };
  });
}

export async function createPlatformPayout(data: PlatformPayoutInput) {
  await ensureFinancialSchema();
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const netAmount = amount(data.netAmount);
  const allocations = data.allocations ?? [];
  const reconciliation = calculatePlatformPayoutReconciliation(netAmount, allocations.map((allocation) => amount(allocation.netAmount)));
  if (reconciliation.isOverAllocated) throw new Error("Allocated stay amounts cannot exceed the platform payout net amount.");
  const result = await db.insert(platformPayouts).values({
    propertyId: data.propertyId ?? 1,
    platform: data.platform,
    payoutDate: data.payoutDate as unknown as Date,
    grossAmount: amount(data.grossAmount).toFixed(2),
    platformFees: amount(data.platformFees).toFixed(2),
    netAmount: netAmount.toFixed(2),
    reference: data.reference ?? null,
    notes: data.notes ?? null,
  });
  const platformPayoutId = Number(result[0].insertId);
  if (allocations.length) {
    await db.insert(platformPayoutAllocations).values(allocations.map((allocation) => ({
      platformPayoutId,
      reservationId: allocation.reservationId,
      grossAmount: amount(allocation.grossAmount).toFixed(2),
      platformFees: amount(allocation.platformFees).toFixed(2),
      netAmount: amount(allocation.netAmount).toFixed(2),
    })));
  }
  return platformPayoutId;
}

export async function updatePlatformPayout(id: number, data: PlatformPayoutInput) {
  await ensureFinancialSchema();
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const propertyId = data.propertyId ?? 1;
  const existing = await db.select().from(platformPayouts).where(and(eq(platformPayouts.id, id), eq(platformPayouts.propertyId, propertyId))).limit(1);
  if (!existing[0]) throw new Error("Platform payout not found.");
  const netAmount = amount(data.netAmount);
  const allocations = data.allocations ?? [];
  const reconciliation = calculatePlatformPayoutReconciliation(netAmount, allocations.map((allocation) => amount(allocation.netAmount)));
  if (reconciliation.isOverAllocated) throw new Error("Allocated stay amounts cannot exceed the platform payout net amount.");
  await db.update(platformPayouts).set({
    platform: data.platform,
    payoutDate: data.payoutDate as unknown as Date,
    grossAmount: amount(data.grossAmount).toFixed(2),
    platformFees: amount(data.platformFees).toFixed(2),
    netAmount: netAmount.toFixed(2),
    reference: data.reference ?? null,
    notes: data.notes ?? null,
  }).where(eq(platformPayouts.id, id));
  await db.delete(platformPayoutAllocations).where(eq(platformPayoutAllocations.platformPayoutId, id));
  if (allocations.length) {
    await db.insert(platformPayoutAllocations).values(allocations.map((allocation) => ({
      platformPayoutId: id,
      reservationId: allocation.reservationId,
      grossAmount: amount(allocation.grossAmount).toFixed(2),
      platformFees: amount(allocation.platformFees).toFixed(2),
      netAmount: amount(allocation.netAmount).toFixed(2),
    })));
  }
}

export async function deletePlatformPayout(id: number, propertyId = 1) {
  await ensureFinancialSchema();
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await db.select().from(platformPayouts).where(and(eq(platformPayouts.id, id), eq(platformPayouts.propertyId, propertyId))).limit(1);
  if (!existing[0]) throw new Error("Platform payout not found.");
  await db.delete(platformPayoutAllocations).where(eq(platformPayoutAllocations.platformPayoutId, id));
  await db.delete(platformPayouts).where(eq(platformPayouts.id, id));
}

export async function getReservationFinancial(reservationId: number) {
  await ensureFinancialSchema();
  const db = await getDb();
  if (!db) return null;
  const record = await db.select().from(reservationFinancials)
    .where(eq(reservationFinancials.reservationId, reservationId)).limit(1);
  return record[0] ?? null;
}

export async function upsertReservationFinancial(data: {
  propertyId?: number;
  reservationId: number;
  grossRevenue: string;
  platformFees: string;
  cleaningFeeCollected: string;
  netReceived: string;
  revenueReceivedAt?: string | null;
  notes?: string | null;
}) {
  await ensureFinancialSchema();
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await getReservationFinancial(data.reservationId);
  const values = {
    propertyId: data.propertyId ?? 1,
    reservationId: data.reservationId,
    grossRevenue: amount(data.grossRevenue).toFixed(2),
    platformFees: amount(data.platformFees).toFixed(2),
    cleaningFeeCollected: amount(data.cleaningFeeCollected).toFixed(2),
    netReceived: amount(data.netReceived).toFixed(2),
    revenueReceivedAt: data.revenueReceivedAt ? data.revenueReceivedAt as unknown as Date : null,
    notes: data.notes ?? null,
  };
  if (existing) {
    await db.update(reservationFinancials).set(values).where(eq(reservationFinancials.id, existing.id));
    return { ...existing, ...values };
  }
  const result = await db.insert(reservationFinancials).values(values);
  return { id: Number(result[0].insertId), ...values };
}

export async function getCohosts(propertyId = 1) {
  await ensureFinancialSchema();
  const db = await getDb();
  if (!db) return [];
  const existing = await db.select().from(cohosts).where(eq(cohosts.propertyId, propertyId)).orderBy(desc(cohosts.isActive), cohosts.name);
  if (existing.length || propertyId !== 1) return existing;
  const result = await db.insert(cohosts).values({
    propertyId,
    name: "Host",
    ratePercent: "25.00",
    payoutBasis: "after_platform_fees_less_cleaning",
    isActive: true,
    notes: "Default co-host agreement",
  });
  const cohostId = Number(result[0].insertId);
  await db.insert(cohostRateHistory).values({
    propertyId,
    cohostId,
    effectiveMonth: "0000-01",
    ratePercent: "25.00",
  });
  return db.select().from(cohosts).where(eq(cohosts.propertyId, propertyId)).orderBy(desc(cohosts.isActive), cohosts.name);
}

export async function createCohost(data: typeof cohosts.$inferInsert) {
  await ensureFinancialSchema();
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(cohosts).values(data);
  const cohostId = Number(result[0].insertId);
  await db.insert(cohostRateHistory).values({
    propertyId: data.propertyId ?? 1,
    cohostId,
    effectiveMonth: "0000-01",
    ratePercent: amount(data.ratePercent).toFixed(2),
  });
  return cohostId;
}

export async function updateCohost(id: number, data: Partial<typeof cohosts.$inferInsert>) {
  await ensureFinancialSchema();
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [existing] = await db.select().from(cohosts).where(eq(cohosts.id, id)).limit(1);
  if (!existing) throw new Error("Co-host not found.");
  if (data.ratePercent !== undefined && amount(data.ratePercent) !== amount(existing.ratePercent)) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const history = await db.select().from(cohostRateHistory).where(eq(cohostRateHistory.cohostId, id)).limit(1);
    if (!history.length) {
      await db.insert(cohostRateHistory).values({
        propertyId: existing.propertyId,
        cohostId: id,
        effectiveMonth: "0000-01",
        ratePercent: amount(existing.ratePercent).toFixed(2),
      });
    }
    await db.delete(cohostRateHistory).where(and(eq(cohostRateHistory.cohostId, id), eq(cohostRateHistory.effectiveMonth, currentMonth)));
    await db.insert(cohostRateHistory).values({
      propertyId: existing.propertyId,
      cohostId: id,
      effectiveMonth: currentMonth,
      ratePercent: amount(data.ratePercent).toFixed(2),
    });
  }
  await db.update(cohosts).set(data).where(eq(cohosts.id, id));
}

export async function getFinancialMonth(propertyId: number, month: string) {
  await ensureFinancialSchema();
  await syncCalendarBookingsToReservations(propertyId);
  const db = await getDb();
  if (!db) return { month, reservations: [], monthlyReservations: [], cohostAmounts: [], totalGrossRevenue: 0, totalPlatformFees: 0, totalNetReceived: 0, totalCleaningFeesCollected: 0, totalCohostEligibleRevenue: 0, totalStayExpenses: 0, totalNetProfit: 0, totalNetRevenue: 0 };
  const [allReservations, financials, allCosts, people, finalizedPayouts, rateHistory] = await Promise.all([
    getReservations(propertyId),
    db.select().from(reservationFinancials).where(eq(reservationFinancials.propertyId, propertyId)),
    db.select().from(costs).where(eq(costs.propertyId, propertyId)),
    getCohosts(propertyId),
    db.select().from(payouts).where(and(eq(payouts.propertyId, propertyId), eq(payouts.payoutMonth, month))),
    db.select().from(cohostRateHistory).where(eq(cohostRateHistory.propertyId, propertyId)),
  ]);
  const financialByReservation = new Map(financials.map((item) => [item.reservationId, item]));
  const expensesByReservation = new Map<number, { total: number; items: typeof allCosts }>();
  for (const cost of allCosts) {
    if (cost.reservationId) {
      const current = expensesByReservation.get(cost.reservationId) ?? { total: 0, items: [] };
      current.total = money(current.total + amount(cost.amount));
      current.items.push(cost);
      expensesByReservation.set(cost.reservationId, current);
    }
  }
  const reservationRows = allReservations
    .filter((reservation) => reservation.status !== "cancelled")
    .sort(compareStaysByOperationalDate)
    .map((reservation) => {
    const financial = financialByReservation.get(reservation.id);
    const grossRevenue = financial ? amount(financial.grossRevenue) : amount(reservation.totalAmount);
    const platformFees = financial ? amount(financial.platformFees) : 0;
    const cleaningFeeCollected = financial ? amount(financial.cleaningFeeCollected) : 0;
    const netReceived = financial?.netReceived !== null && financial?.netReceived !== undefined
      ? amount(financial.netReceived)
      : money(grossRevenue - platformFees);
    const expenseRecord = expensesByReservation.get(reservation.id);
    const stayExpenses = expenseRecord?.total ?? 0;
    return {
      reservation,
      financial: financial ?? null,
      grossRevenue: money(grossRevenue),
      platformFees: money(platformFees),
      cleaningFeeCollected: money(cleaningFeeCollected),
      netReceived: money(netReceived),
      stayExpenses: money(stayExpenses),
      expenses: expenseRecord?.items ?? [],
      netProfit: money(netReceived - stayExpenses),
      netRevenue: money(netReceived - stayExpenses),
      };
    });
  const financialMonth = (value: Date | string | null | undefined) => value ? (value instanceof Date ? value.toISOString() : String(value)).slice(0, 7) : null;
  const monthlyReservations = reservationRows.filter((row) => (
    financialMonth(row.financial?.revenueReceivedAt) === month
    && hasRecordedPayoutValue({
      grossRevenue: row.grossRevenue,
      platformFees: row.platformFees,
      netReceived: row.netReceived,
    })
  ));
  const totals = calculateMonthlyReservationSummary(monthlyReservations.map((row) => ({
    reservationId: row.reservation.id,
    grossRevenue: row.grossRevenue,
    platformFees: row.platformFees,
    cleaningFeeCollected: row.cleaningFeeCollected,
    netReceived: row.netReceived,
    stayExpenses: row.stayExpenses,
  })));
  const rateForMonth = (cohostId: number, fallbackRate: string | number | null) => {
    const record = rateHistory
      .filter((entry) => entry.cohostId === cohostId && entry.effectiveMonth <= month)
      .sort((left, right) => right.effectiveMonth.localeCompare(left.effectiveMonth))[0];
    return amount(record?.ratePercent ?? fallbackRate);
  };
  const finalizedByCohost = new Map(finalizedPayouts
    .filter((payout) => payout.status !== "draft")
    .map((payout) => [payout.cohostId, payout]));
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (month < currentMonth && monthlyReservations.length) {
    for (const cohost of people.filter((person) => person.isActive && !finalizedByCohost.has(person.id))) {
      const ratePercent = rateForMonth(cohost.id, cohost.ratePercent);
      const snapshot = calculatePayoutSnapshot(monthlyReservations.map((row) => ({
        reservationId: row.reservation.id,
        grossRevenue: row.grossRevenue,
        platformFees: row.platformFees,
        cleaningFeeCollected: row.cleaningFeeCollected,
        netReceived: row.netReceived,
        stayExpenses: row.stayExpenses,
      })), ratePercent, "after_platform_fees_less_cleaning");
      const result = await db.insert(payouts).values({
        propertyId,
        cohostId: cohost.id,
        payoutMonth: month,
        ratePercentSnapshot: ratePercent.toFixed(2),
        payoutBasisSnapshot: "after_platform_fees_less_cleaning",
        grossRevenueSnapshot: snapshot.totals.grossRevenue.toFixed(2),
        platformFeesSnapshot: snapshot.totals.platformFees.toFixed(2),
        cleaningFeeCollectedSnapshot: snapshot.totals.cleaningFeeCollected.toFixed(2),
        stayExpensesSnapshot: snapshot.totals.stayExpenses.toFixed(2),
        eligibleRevenueSnapshot: snapshot.totals.eligibleRevenue.toFixed(2),
        amountDueSnapshot: snapshot.totals.amountDue.toFixed(2),
      });
      const payoutId = Number(result[0].insertId);
      if (snapshot.items.length) await db.insert(payoutItems).values(snapshot.items.map((item) => ({
        payoutId,
        reservationId: item.reservationId,
        grossRevenueSnapshot: item.grossRevenue.toFixed(2),
        platformFeesSnapshot: item.platformFees.toFixed(2),
        cleaningFeeCollectedSnapshot: item.cleaningFeeCollected.toFixed(2),
        stayExpensesSnapshot: item.stayExpenses.toFixed(2),
        eligibleRevenueSnapshot: item.eligibleRevenue.toFixed(2),
        amountDueSnapshot: item.amountDue.toFixed(2),
      })));
      finalizedByCohost.set(cohost.id, {
        cohostId: cohost.id,
        ratePercentSnapshot: ratePercent.toFixed(2),
        amountDueSnapshot: snapshot.totals.amountDue.toFixed(2),
      } as typeof finalizedPayouts[number]);
    }
  }
  const cohostAmounts = people.filter((person) => person.isActive || finalizedByCohost.has(person.id)).map((cohost) => {
    const finalized = finalizedByCohost.get(cohost.id);
    const ratePercent = finalized ? amount(finalized.ratePercentSnapshot) : rateForMonth(cohost.id, cohost.ratePercent);
    return {
      cohostId: cohost.id,
      name: cohost.name,
      ratePercent,
      amountDue: finalized ? amount(finalized.amountDueSnapshot) : calculateMonthlyCohostDue([totals.cohostEligibleRevenue], ratePercent),
      isFinal: !!finalized,
    };
  });
  return {
    month,
    reservations: reservationRows,
    monthlyReservations,
    cohostAmounts,
    totalGrossRevenue: totals.grossRevenue,
    totalPlatformFees: totals.platformFees,
    totalNetReceived: totals.netReceived,
    totalCleaningFeesCollected: totals.cleaningFeeCollected,
    totalCohostEligibleRevenue: totals.cohostEligibleRevenue,
    totalStayExpenses: totals.stayExpenses,
    totalNetProfit: totals.netProfit,
    totalNetRevenue: totals.netProfit,
  };
}

export async function getPayouts(propertyId = 1) {
  await ensureFinancialSchema();
  const db = await getDb();
  if (!db) return [];
  const [rows, people, items] = await Promise.all([
    db.select().from(payouts).where(eq(payouts.propertyId, propertyId)).orderBy(desc(payouts.payoutMonth), desc(payouts.createdAt)),
    getCohosts(propertyId),
    db.select().from(payoutItems),
  ]);
  const cohostById = new Map(people.map((person) => [person.id, person]));
  return rows.map((payout) => ({
    ...payout,
    cohost: cohostById.get(payout.cohostId) ?? null,
    items: items.filter((item) => item.payoutId === payout.id),
  }));
}

export async function createPayoutSnapshot(propertyId: number, cohostId: number, month: string, notes?: string | null) {
  await ensureFinancialSchema();
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [existing] = await db.select().from(payouts).where(and(
    eq(payouts.propertyId, propertyId),
    eq(payouts.cohostId, cohostId),
    eq(payouts.payoutMonth, month),
  )).limit(1);
  if (existing) throw new Error("A payout already exists for this co-host and month.");
  const cohost = (await getCohosts(propertyId)).find((person) => person.id === cohostId);
  if (!cohost) throw new Error("Co-host not found.");
  const ledger = await getFinancialMonth(propertyId, month);
  const ratePercent = amount(cohost.ratePercent);
  const payoutBasis = cohost.payoutBasis as PayoutBasis;
  const snapshot = calculatePayoutSnapshot(
    ledger.monthlyReservations.map((row) => ({
      reservationId: row.reservation.id,
      grossRevenue: row.grossRevenue,
      platformFees: row.platformFees,
      cleaningFeeCollected: row.cleaningFeeCollected,
      netReceived: row.netReceived,
      stayExpenses: row.stayExpenses,
    })),
    ratePercent,
    payoutBasis,
  );
  const items = snapshot.items.map((item) => ({
    reservationId: item.reservationId,
    grossRevenueSnapshot: item.grossRevenue.toFixed(2),
    platformFeesSnapshot: item.platformFees.toFixed(2),
    cleaningFeeCollectedSnapshot: item.cleaningFeeCollected.toFixed(2),
    stayExpensesSnapshot: item.stayExpenses.toFixed(2),
    eligibleRevenueSnapshot: item.eligibleRevenue.toFixed(2),
    amountDueSnapshot: item.amountDue.toFixed(2),
  }));
  const { grossRevenue, platformFees, cleaningFeeCollected, stayExpenses, eligibleRevenue, amountDue } = snapshot.totals;
  const result = await db.insert(payouts).values({
    propertyId,
    cohostId,
    payoutMonth: month,
    ratePercentSnapshot: ratePercent.toFixed(2),
    payoutBasisSnapshot: payoutBasis,
    grossRevenueSnapshot: grossRevenue.toFixed(2),
    platformFeesSnapshot: platformFees.toFixed(2),
    cleaningFeeCollectedSnapshot: cleaningFeeCollected.toFixed(2),
    stayExpensesSnapshot: stayExpenses.toFixed(2),
    eligibleRevenueSnapshot: eligibleRevenue.toFixed(2),
    amountDueSnapshot: amountDue.toFixed(2),
    notes: notes ?? null,
  });
  const payoutId = Number(result[0].insertId);
  if (items.length) await db.insert(payoutItems).values(items.map((item) => ({ payoutId, ...item })));
  return payoutId;
}

export async function updatePayoutStatus(id: number, status: "draft" | "approved" | "paid", notes?: string | null) {
  await ensureFinancialSchema();
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(payouts).set({
    status,
    notes: notes ?? undefined,
    paidAt: status === "paid" ? new Date() : null,
  }).where(eq(payouts.id, id));
}

// ─── Booking Requests ─────────────────────────────────────────────────────────

export async function getBookingRequests(propertyId = 1) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(bookingRequests).where(eq(bookingRequests.propertyId, propertyId)).orderBy(desc(bookingRequests.createdAt));
}

export async function createBookingRequest(data: typeof bookingRequests.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(bookingRequests).values(data);
}

export async function updateBookingRequest(id: number, data: Partial<typeof bookingRequests.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(bookingRequests).set(data).where(eq(bookingRequests.id, id));
}

// ─── Tenant Pages ─────────────────────────────────────────────────────────────

export async function getTenantPages(propertyId = 1) {
  const db = await getDb();
  if (!db) return [];
  try {
    const conn = (db as any).session?.client ?? (db as any).$client;
    if (conn) {
      const [rows] = await conn.execute(
        `SELECT id, propertyId, slug, title, content, icon, sortOrder, isVisible FROM tenant_pages WHERE propertyId = ? AND isVisible = 1 ORDER BY sortOrder ASC, id ASC`,
        [propertyId]
      );
      return (rows as any[]).map((r: any) => ({ ...r, isVisible: !!r.isVisible }));
    }
  } catch (e) { console.warn("[tenant_pages] query failed:", e); }
  return [];
}

export async function getTenantPageBySlug(slug: string, propertyId = 1) {
  const db = await getDb();
  if (!db) return null;
  try {
    const conn = (db as any).session?.client ?? (db as any).$client;
    if (conn) {
      const [rows] = await conn.execute(
        `SELECT id, propertyId, slug, title, content, icon, sortOrder, isVisible FROM tenant_pages WHERE propertyId = ? AND slug = ? LIMIT 1`,
        [propertyId, slug]
      );
      const r = (rows as any[])[0];
      return r ? { ...r, isVisible: !!r.isVisible } : null;
    }
  } catch (e) { console.warn("[tenant_pages] query failed:", e); }
  return null;
}

export async function updateTenantPage(id: number, data: { title?: string; content?: string; isVisible?: boolean; sortOrder?: number }) {
  const db = await getDb();
  if (!db) return;
  try {
    const conn = (db as any).session?.client ?? (db as any).$client;
    if (!conn) return;
    const sets: string[] = [];
    const vals: any[] = [];
    if (data.title !== undefined) { sets.push("title = ?"); vals.push(data.title); }
    if (data.content !== undefined) { sets.push("content = ?"); vals.push(data.content); }
    if (data.isVisible !== undefined) { sets.push("isVisible = ?"); vals.push(data.isVisible ? 1 : 0); }
    if (data.sortOrder !== undefined) { sets.push("sortOrder = ?"); vals.push(data.sortOrder); }
    if (sets.length === 0) return;
    vals.push(id);
    await conn.execute(`UPDATE tenant_pages SET ${sets.join(", ")} WHERE id = ?`, vals);
  } catch (e) { console.warn("[tenant_pages] update failed:", e); }
}
