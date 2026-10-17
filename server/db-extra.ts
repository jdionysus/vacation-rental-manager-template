import { and, desc, eq, gte, lte, or } from "drizzle-orm";
import { getDb } from "./db";
import { getCalendarEventReferenceCandidates } from "../shared/reservation-display";
import {
  authUsers,
  pricingRules,
  stripeCustomers,
  damageCharges,
  termsPages,
  otaLinks,
  dailyRates,
} from "../drizzle/schema";

// ─── Auth Users ───────────────────────────────────────────────────────────────

export async function getAllAuthUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(authUsers).orderBy(desc(authUsers.createdAt));
}

export async function createAuthUser(data: typeof authUsers.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(authUsers).values(data);
}

export async function updateAuthUser(id: number, data: Partial<typeof authUsers.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(authUsers).set(data).where(eq(authUsers.id, id));
}

export async function deleteAuthUser(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(authUsers).where(eq(authUsers.id, id));
}

// ─── Pricing Rules ────────────────────────────────────────────────────────────

export async function getPricingRules(propertyId = 1) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pricingRules).where(eq(pricingRules.propertyId, propertyId)).orderBy(pricingRules.startDate);
}

export async function getActivePricingRuleForDate(date: string, propertyId = 1) {
  const db = await getDb();
  if (!db) return null;
  const rules = await db.select().from(pricingRules).where(
    and(
      eq(pricingRules.propertyId, propertyId),
      eq(pricingRules.isActive, true),
      lte(pricingRules.startDate, date as unknown as Date),
      gte(pricingRules.endDate, date as unknown as Date),
    )
  ).orderBy(desc(pricingRules.priority));
  return rules[0] ?? null;
}

export async function createPricingRule(data: typeof pricingRules.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(pricingRules).values(data);
}

export async function updatePricingRule(id: number, data: Partial<typeof pricingRules.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(pricingRules).set(data).where(eq(pricingRules.id, id));
}

export async function deletePricingRule(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(pricingRules).where(eq(pricingRules.id, id));
}

// Calculate rate for a date range
// ─── Daily Rates ─────────────────────────────────────────────────────────────

export async function getDailyRates(propertyId = 1, startDate?: string, endDate?: string) {
  const db = await getDb();
  if (!db) return [];
  let q = db.select().from(dailyRates).where(eq(dailyRates.propertyId, propertyId));
  const rows = await q.orderBy(dailyRates.date);
  if (startDate && endDate) {
    return rows.filter(r => r.date >= startDate && r.date <= endDate);
  }
  return rows;
}

export async function getDailyRate(date: string, propertyId = 1) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(dailyRates)
    .where(and(eq(dailyRates.propertyId, propertyId), eq(dailyRates.date, date)))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertDailyRate(data: typeof dailyRates.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(dailyRates).values(data).onDuplicateKeyUpdate({
    set: {
      competitorRate: data.competitorRate,
      multiplier: data.multiplier,
      overrideRate: data.overrideRate,
      cleaningFee: data.cleaningFee,
      notes: data.notes,
    }
  });
}

export async function updateDailyRate(id: number, data: Partial<typeof dailyRates.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(dailyRates).set(data).where(eq(dailyRates.id, id));
}

/** Compute the effective nightly rate for a date:
 *  overrideRate ?? (competitorRate * multiplier) ?? fallback
 */
export function computeEffectiveRate(row: typeof dailyRates.$inferSelect | null, fallback = 150): number {
  if (!row) return fallback;
  if (row.overrideRate) return parseFloat(row.overrideRate);
  if (row.competitorRate) return Math.round(parseFloat(row.competitorRate) * parseFloat(row.multiplier));
  return fallback;
}

export async function calculateBookingPrice(arrivalDate: string, departureDate: string, propertyId = 1) {
  const db = await getDb();
  if (!db) return null;

  const arrival = new Date(arrivalDate + "T12:00:00Z");
  const departure = new Date(departureDate + "T12:00:00Z");
  const nights = Math.round((departure.getTime() - arrival.getTime()) / 86400000);
  if (nights <= 0) return null;

  // Fetch all daily rates for the range in one query
  const allRates = await getDailyRates(propertyId, arrivalDate, departureDate);
  const rateMap = new Map(allRates.map(r => [r.date, r]));

  // Default cleaning fee from first rate row or $100
  const cleaningFee = allRates[0] ? parseFloat(allRates[0].cleaningFee) : 100;

  let totalNightlyAmount = 0;
  const breakdown: { date: string; rate: number; competitorRate: number | null }[] = [];

  for (let i = 0; i < nights; i++) {
    const d = new Date(arrival.getTime() + i * 86400000);
    const dateStr = d.toISOString().split("T")[0];
    const row = rateMap.get(dateStr) ?? null;
    const rate = computeEffectiveRate(row);
    const competitorRate = row?.competitorRate ? parseFloat(row.competitorRate) : null;
    totalNightlyAmount += rate;
    breakdown.push({ date: dateStr, rate, competitorRate });
  }

  const total = totalNightlyAmount + cleaningFee;

  return {
    nights,
    nightlyBreakdown: breakdown,
    subtotal: totalNightlyAmount,
    cleaningFee,
    total,
    avgNightlyRate: Math.round(totalNightlyAmount / nights),
  };
}

// ─── Stripe Customers ─────────────────────────────────────────────────────────

export async function getStripeCustomerByReservation(reservationId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(stripeCustomers).where(eq(stripeCustomers.reservationId, reservationId)).limit(1);
  return result[0] ?? null;
}

export async function getAllStripeCustomers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(stripeCustomers).orderBy(desc(stripeCustomers.createdAt));
}

// ─── Damage Charges ───────────────────────────────────────────────────────────

export async function getDamageCharges(reservationId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (reservationId) {
    return db.select().from(damageCharges).where(eq(damageCharges.reservationId, reservationId)).orderBy(desc(damageCharges.createdAt));
  }
  return db.select().from(damageCharges).orderBy(desc(damageCharges.createdAt));
}

// ─── Terms Pages ──────────────────────────────────────────────────────────────

export async function getTermsPages(propertyId = 1) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(termsPages).where(eq(termsPages.propertyId, propertyId)).orderBy(termsPages.sortOrder);
}

export async function updateTermsPage(id: number, data: Partial<typeof termsPages.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(termsPages).set(data).where(eq(termsPages.id, id));
}

// ─── OTA Links ────────────────────────────────────────────────────────────────

export async function getOtaLinks(propertyId = 1) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(otaLinks).where(and(eq(otaLinks.propertyId, propertyId), eq(otaLinks.isActive, true))).orderBy(otaLinks.sortOrder);
}

export async function getAllOtaLinks(propertyId = 1) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(otaLinks).where(eq(otaLinks.propertyId, propertyId)).orderBy(otaLinks.sortOrder);
}

export async function updateOtaLink(id: number, data: Partial<typeof otaLinks.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(otaLinks).set(data).where(eq(otaLinks.id, id));
}

// ─── Checklist Templates ──────────────────────────────────────────────────────

import { checklistTemplates } from "../drizzle/schema";

export async function getChecklistTemplates(propertyId = 1) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(checklistTemplates)
    .where(eq(checklistTemplates.propertyId, propertyId))
    .orderBy(checklistTemplates.sortOrder, checklistTemplates.createdAt);
  // MySQL may return JSON columns as strings — parse them back to arrays
  return rows.map(r => ({
    ...r,
    items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items ?? []),
  }));
}

export async function createChecklistTemplate(data: typeof checklistTemplates.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Stringify items to JSON string for MySQL JSON column compatibility
  // Empty array is valid — templates can be created without items and filled in later
  const insertData = {
    ...data,
    items: JSON.stringify(data.items ?? []) as any,
  };
  await db.insert(checklistTemplates).values(insertData);
}

export async function updateChecklistTemplate(id: number, data: Partial<typeof checklistTemplates.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  // Stringify items if present
  const updateData = data.items !== undefined
    ? { ...data, items: JSON.stringify(data.items ?? []) as any }
    : data;
  await db.update(checklistTemplates).set(updateData).where(eq(checklistTemplates.id, id));
}

export async function deleteChecklistTemplate(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(checklistTemplates).where(eq(checklistTemplates.id, id));
}

// ─── Cleaning Jobs ────────────────────────────────────────────────────────────

import { cleaningJobs } from "../drizzle/schema";

export async function getCleaningJobs(propertyId = 1) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cleaningJobs)
    .where(eq(cleaningJobs.propertyId, propertyId))
    .orderBy(desc(cleaningJobs.checkoutDate));
}

export async function createCleaningJob(data: typeof cleaningJobs.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(cleaningJobs).values(data);
}

export async function updateCleaningJob(id: number, data: Partial<typeof cleaningJobs.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(cleaningJobs).set(data).where(eq(cleaningJobs.id, id));
}

export async function deleteCleaningJob(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(cleaningJobs).where(eq(cleaningJobs.id, id));
}

export async function upsertCleaningJobForCheckout(propertyId: number, checkoutDate: string, reservationId?: number, checkinDate?: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Normalize dates to YYYY-MM-DD format (handles Date objects passed as strings)
  function normDate(val: string | undefined): string | undefined {
    if (!val) return undefined;
    if (val.includes('T')) return val.split('T')[0];
    if (val.includes(' ') && val.length > 10) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    return val.slice(0, 10);
  }
  const normalizedCheckout = normDate(checkoutDate) ?? checkoutDate;
  const normalizedCheckin = normDate(checkinDate);
  // Check if a cleaning job already exists for this checkout date
  const existing = await db.select().from(cleaningJobs)
    .where(and(eq(cleaningJobs.propertyId, propertyId), eq(cleaningJobs.checkoutDate, normalizedCheckout as unknown as Date)))
    .limit(1);
  if (existing[0]) return existing[0];
  // Auto-assign the default turnover checklist template
  let checklistTemplateId: number | undefined;
  try {
    const templates = await db.select().from(checklistTemplates)
      .where(eq(checklistTemplates.propertyId, propertyId))
      .orderBy(checklistTemplates.sortOrder, checklistTemplates.createdAt);
    const t = templates.find(t => t.taskType === 'turnover' && t.isDefault)
           ?? templates.find(t => t.taskType === 'turnover')
           ?? templates[0];
    if (t) checklistTemplateId = t.id;
  } catch { /* ignore */ }
  // Create a new one with normalized dates
  await db.insert(cleaningJobs).values({
    propertyId,
    reservationId,
    checkoutDate: normalizedCheckout as unknown as Date,
    checkinDate: normalizedCheckin as unknown as Date | undefined,
    status: "pending",
    checklistTemplateId,
  });
  const created = await db.select().from(cleaningJobs)
    .where(and(eq(cleaningJobs.propertyId, propertyId), eq(cleaningJobs.checkoutDate, normalizedCheckout as unknown as Date)))
    .limit(1);
  return created[0];
}

// ─── Bypass Codes ─────────────────────────────────────────────────────────────

import { bypassCodes } from "../drizzle/schema";

export async function getBypassCodes(propertyId = 1) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(bypassCodes)
    .where(eq(bypassCodes.propertyId, propertyId))
    .orderBy(desc(bypassCodes.createdAt));
}

export async function createBypassCode(data: { code: string; label?: string; portalType?: "guest" | "cleaner" | "inspector" | "all"; propertyId?: number; expiresAt?: Date; calendarEventId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(bypassCodes).values({
    propertyId: data.propertyId ?? 1,
    code: data.code.toUpperCase(),
    label: data.label,
    portalType: data.portalType ?? "guest",
    isActive: true,
    expiresAt: data.expiresAt,
    calendarEventId: data.calendarEventId,
  });
}

export async function upsertBypassCodeForEvent(propertyId: number, calendarEventId: number, label: string, expiresAt?: Date) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Check both historical UI (-id) and database (+id) references before creating a code.
  const eventReferenceCandidates = getCalendarEventReferenceCandidates(calendarEventId);
  const existing = await db.select().from(bypassCodes)
    .where(and(
      eq(bypassCodes.propertyId, propertyId),
      or(...eventReferenceCandidates.map((eventId) => eq(bypassCodes.calendarEventId, eventId))),
    ))
    .limit(1);
  if (existing[0]) return existing[0];
  // Generate a unique 4-digit code
  let code = "";
  for (let attempts = 0; attempts < 20; attempts++) {
    const candidate = Math.floor(1000 + Math.random() * 9000).toString();
    const conflict = await db.select({ id: bypassCodes.id }).from(bypassCodes)
      .where(eq(bypassCodes.code, candidate)).limit(1);
    if (!conflict[0]) { code = candidate; break; }
  }
  if (!code) code = Math.floor(1000 + Math.random() * 9000).toString();
  await db.insert(bypassCodes).values({
    propertyId, code, label,
    portalType: "guest",
    isActive: true,
    calendarEventId,
    expiresAt,
  });
  const created = await db.select().from(bypassCodes)
    .where(and(eq(bypassCodes.calendarEventId, calendarEventId), eq(bypassCodes.propertyId, propertyId)))
    .limit(1);
  return created[0];
}

export async function regenerateBypassCode(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  let code = "";
  for (let attempts = 0; attempts < 20; attempts++) {
    const candidate = Math.floor(1000 + Math.random() * 9000).toString();
    const conflict = await db.select({ id: bypassCodes.id }).from(bypassCodes)
      .where(eq(bypassCodes.code, candidate)).limit(1);
    if (!conflict[0]) { code = candidate; break; }
  }
  if (!code) code = Math.floor(1000 + Math.random() * 9000).toString();
  await db.update(bypassCodes).set({ code, useCount: 0, lastUsedAt: null }).where(eq(bypassCodes.id, id));
  return code;
}

export async function deleteBypassCode(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(bypassCodes).where(eq(bypassCodes.id, id));
}

export async function getBypassCodeByCode(code: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(bypassCodes)
    .where(and(eq(bypassCodes.code, code.toUpperCase()), eq(bypassCodes.isActive, true)))
    .limit(1);
  if (result[0]) {
    // Update use count and last used
    await db.update(bypassCodes).set({
      useCount: (result[0].useCount ?? 0) + 1,
      lastUsedAt: new Date(),
    }).where(eq(bypassCodes.id, result[0].id));
  }
  return result[0] ?? null;
}
