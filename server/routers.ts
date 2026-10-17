import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getImportedReservationGuestNameOverride } from "../shared/imported-reservation-overrides";
import {
  createAccessCode,
  createBookingRequest,
  createCalendarEvent,
  createCohost,
  createCost,
  createPlatformPayout,
  deletePlatformPayout,
  createIcalFeed,
  createReservation,
  createTask,
  deleteCalendarEvent,
  deleteCost,
  deleteIcalFeed,
  deleteReservation,
  deleteTask,
  getAccessCodeByCode,
  getAccessCodesByReservation,
  getBookingRequests,
  getCalendarEvents,
  getCohosts,
  getCosts,
  getFinancialMonth,
  getPlatformPayouts,
  getGuestPageBySlug,
  getGuestPages,
  getTenantPages,
  getTenantPageBySlug,
  updateTenantPage,
  getIcalFeeds,
  getProperty,
  getReservationById,
  getReservationFinancial,
  getReservations,
  getTasks,
  getTasksByAssignee,
  updateAccessCode,
  updateBookingRequest,
  updateCost,
  updateGuestPage,
  updateIcalFeed,
  updateProperty,
  updateCohost,
  updatePlatformPayout,
  updateReservation,
  upsertReservationFinancial,
  updateTask,
  upsertCalendarEvent,
  markCalendarEventsStaleBySource,
  syncCalendarBookingsToReservations,
} from "./db";
import {
  getAllAuthUsers,
  createAuthUser,
  updateAuthUser,
  deleteAuthUser,
  getPricingRules,
  createPricingRule,
  updatePricingRule,
  deletePricingRule,
  calculateBookingPrice,
  getDailyRates,
  getDailyRate,
  updateDailyRate,
  upsertDailyRate,
  computeEffectiveRate,
  getStripeCustomerByReservation,
  getAllStripeCustomers,
  getDamageCharges,
  getTermsPages,
  updateTermsPage,
  getOtaLinks,
  getAllOtaLinks,
  updateOtaLink,
  getChecklistTemplates,
  createChecklistTemplate,
  updateChecklistTemplate,
  deleteChecklistTemplate,
  getCleaningJobs,
  createCleaningJob,
  updateCleaningJob,
  deleteCleaningJob,
  upsertCleaningJobForCheckout,
  getBypassCodes,
  createBypassCode,
  deleteBypassCode,
  getBypassCodeByCode,
  upsertBypassCodeForEvent,
  regenerateBypassCode,
} from "./db-extra";
import { parse as parseCookieHeader } from "cookie";
import {
  loginUser,
  createSessionToken,
  verifySessionToken,
  getAuthUserById,
  hashPassword,
  COOKIE_NAME,
} from "./auth-local";
import { createBookingCheckout, chargeDamage } from "./stripe-helper";
import { notifyOwner } from "./_core/notification";
import { hasReasonableIcalDateSpan } from "./calendar-booking-sync";

// ─── Role helpers ─────────────────────────────────────────────────────────────

type Role = "host" | "property_manager" | "cleaner" | "accountant" | "admin";

const SESSION_COOKIE = COOKIE_NAME;

// Auth context: check local JWT cookie from raw header (no cookie-parser needed)
async function getLocalUser(req: { cookies?: Record<string, string>; headers?: Record<string, string | string[]> }) {
  // Try req.cookies first (if cookie-parser is present), then fall back to raw header
  let token: string | undefined = (req.cookies ?? {})[SESSION_COOKIE];
  if (!token) {
    const cookieHeader = Array.isArray(req.headers?.cookie) ? req.headers.cookie[0] : req.headers?.cookie;
    if (cookieHeader) {
      const parsed = parseCookieHeader(cookieHeader);
      token = parsed[SESSION_COOKIE];
    }
  }
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload) return null;
  return getAuthUserById(payload.userId);
}

const localAuthProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const user = await getLocalUser(ctx.req as Parameters<typeof getLocalUser>[0]);
  return next({ ctx: { ...ctx, localUser: user } });
});

const requireLocalAuth = localAuthProcedure.use(({ ctx, next }) => {
  if (!ctx.localUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, localUser: ctx.localUser! } });
});

const requireRole = (roles: Role[]) =>
  requireLocalAuth.use(({ ctx, next }) => {
    if (!roles.includes(ctx.localUser.role as Role)) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return next({ ctx });
  });

const hostProcedure = requireRole(["host", "property_manager", "admin"]);
const staffProcedure = requireRole(["host", "property_manager", "admin"]);
const readProcedure = requireRole(["host", "property_manager", "cleaner", "accountant", "admin"]);

// ─── iCal sync helper ─────────────────────────────────────────────────────────

async function syncIcalFeed(feedId: number, url: string, source: string, propertyId: number) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const vevents = text.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];
    
    // Mark all existing events from this source as stale BEFORE syncing
    // Events seen in the new feed will be un-staled; old events stay stale and get filtered out
    await markCalendarEventsStaleBySource(source, propertyId);
    
    let synced = 0;
    
    for (const vevent of vevents) {
      const uid = vevent.match(/UID:(.+)/)?.[1]?.trim();
      const dtstart = vevent.match(/DTSTART[^:]*:(\d{8})/)?.[1];
      const dtend = vevent.match(/DTEND[^:]*:(\d{8})/)?.[1];
      // Handle iCal line folding (lines starting with space/tab are continuations)
      const unfold = (s: string) => s.replace(/\r?\n[ \t]/g, '');
      const rawSummary = unfold(vevent).match(/SUMMARY:(.+)/)?.[1]?.trim() ?? "Blocked";
      if (!uid || !dtstart || !dtend) continue;
      const toDate = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
      const startDateStr = toDate(dtstart);
      const endDateStr = toDate(dtend);
      // Completed bookings are valid import candidates. Only reject malformed
      // or implausibly long date spans from a source feed.
      if (!hasReasonableIcalDateSpan(startDateStr, endDateStr)) continue;
      // Detect blocked/unavailable events — these are NOT real reservations
      // Note: "Reserved" and "Reserved - Name" are BOOKINGS, not blocks
      const BLOCK_PATTERNS = /^(blocked|not available|airbnb \(not available\)|unavailable|closed|hold|owner block|maintenance|owner stay)$/i;
      const isBlock = BLOCK_PATTERNS.test(rawSummary.trim());
      // Extract guest first name from platform-specific SUMMARY formats:
      // Vrbo: "Reserved - Jessica" → "Jessica"
      // Airbnb: "Reserved" → null (no name in iCal)
      // Booking.com: varies
      let guestFirstNames: string | null = null;
      if (!isBlock) {
        const vrboMatch = rawSummary.match(/^Reserved\s*-\s*(.+)$/i);
        if (vrboMatch) guestFirstNames = vrboMatch[1].trim();
        else if (rawSummary.match(/^Reservation by (.+)$/i)) guestFirstNames = rawSummary.match(/^Reservation by (.+)$/i)![1].trim();
      }
      await upsertCalendarEvent({
        propertyId,
        source: source as "airbnb" | "vrbo" | "booking_com" | "other",
        externalUid: uid,
        title: rawSummary,
        guestFirstNames: guestFirstNames ?? undefined,
        startDate: startDateStr as unknown as Date,
        endDate: endDateStr as unknown as Date,
        eventType: isBlock ? "block" : "booking",
      } as any);
      synced++;
    }
    await syncCalendarBookingsToReservations(propertyId);
    await updateIcalFeed(feedId, { lastSyncAt: new Date(), lastStatus: "ok", lastError: null });
    return { synced };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateIcalFeed(feedId, { lastSyncAt: new Date(), lastStatus: "error", lastError: msg });
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Sync failed: ${msg}` });
  }
}

// ─── Routers ──────────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,

  // ─── Local Auth ─────────────────────────────────────────────────────────────
  auth: router({
    me: localAuthProcedure.query(({ ctx }) => ctx.localUser ?? null),
    login: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const user = await loginUser(input.email, input.password);
        if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
        const token = await createSessionToken(user.id, user.role);
        const isSecure = ctx.req.protocol === "https" || process.env.NODE_ENV === "production";
        ctx.res.cookie(SESSION_COOKIE, token, {
          httpOnly: true,
          secure: isSecure,
          sameSite: isSecure ? "none" : "lax",
          maxAge: 30 * 24 * 60 * 60 * 1000,
          path: "/",
        });
        return { success: true, role: user.role, name: user.name };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(SESSION_COOKIE, { path: "/" });
      return { success: true };
    }),
    changePassword: requireLocalAuth
      .input(z.object({ currentPassword: z.string(), newPassword: z.string().min(8) }))
      .mutation(async ({ input, ctx }) => {
        const user = await loginUser(ctx.localUser.email, input.currentPassword);
        if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password incorrect" });
        const hash = await hashPassword(input.newPassword);
        await updateAuthUser(ctx.localUser.id, { passwordHash: hash });
        return { success: true };
      }),
  }),

  // ─── Team (auth_users) ───────────────────────────────────────────────────────
  team: router({
    list: readProcedure.query(() => getAllAuthUsers()),
    // Public endpoint for cleaner/inspector portals — returns name+id of cleaner-role members only
    // Returns cleaner/staff names for the portal dropdown (no emails exposed)
    cleaners: publicProcedure.query(async () => {
      const all = await getAllAuthUsers();
      return all
        .filter(u => u.role === 'cleaner' || u.role === 'property_manager' || u.role === 'host')
        .map(u => ({ id: u.id, name: u.name ?? u.email }));
    }),
    create: hostProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(8),
        name: z.string().optional(),
        role: z.enum(["host", "property_manager", "cleaner", "accountant", "admin"]).default("host"),
      }))
      .mutation(async ({ input }) => {
        const hash = await hashPassword(input.password);
        await createAuthUser({ email: input.email.toLowerCase(), passwordHash: hash, name: input.name, role: input.role });
        return { success: true };
      }),
    updateRole: hostProcedure
      .input(z.object({ userId: z.number(), role: z.enum(["host", "property_manager", "cleaner", "accountant", "admin"]) }))
      .mutation(({ input }) => updateAuthUser(input.userId, { role: input.role })),
    delete: hostProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(({ input }) => deleteAuthUser(input.userId)),
  }),

  // ─── Property ───────────────────────────────────────────────────────────────
  property: router({
    get: publicProcedure.query(() => getProperty(1)),
    update: hostProcedure
      .input(z.object({
        name: z.string().optional(),
        tagline: z.string().optional(),
        description: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        maxGuests: z.number().optional(),
        bedrooms: z.number().optional(),
        bathrooms: z.number().optional(),
        checkInTime: z.string().optional(),
        checkOutTime: z.string().optional(),
        nightlyRate: z.string().optional(),
        cleaningFee: z.string().optional(),
        amenities: z.array(z.string()).optional(),
        houseRules: z.string().optional(),
        photos: z.array(z.string()).optional(),
        timezone: z.string().optional(),
        listingNote: z.string().optional(),
        mapImageUrl: z.string().optional(),
        mapLocationLabel: z.string().optional(),
        seoTitle: z.string().optional(),
        seoDescription: z.string().optional(),
        seoKeywords: z.string().optional(),
      }))
      .mutation(({ input }) => updateProperty(1, input)),
  }),

  // ─── OTA Links ───────────────────────────────────────────────────────────────
  otaLinks: router({
    list: publicProcedure.query(() => getOtaLinks(1)),
    listAll: readProcedure.query(() => getAllOtaLinks(1)),
    update: hostProcedure
      .input(z.object({
        id: z.number(),
        url: z.string().url().optional(),
        label: z.string().optional(),
        isActive: z.boolean().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(({ input: { id, ...data } }) => updateOtaLink(id, data)),
  }),


  // Checklist Templates
  checklistTemplates: router({
    list: readProcedure.query(() => getChecklistTemplates(1)),
    // Public endpoint for cleaner portal — returns the default turnover checklist template
    turnoverTemplate: publicProcedure.query(async () => {
      const templates = await getChecklistTemplates(1);
      const t = templates.find(t => t.taskType === 'turnover' && t.isDefault)
             ?? templates.find(t => t.taskType === 'turnover')
             ?? templates[0];
      if (!t) return null;
      return { id: t.id, name: t.name, items: t.items as { section: string; item: string; required: boolean }[] };
    }),
    // Public endpoint for inspector portal — returns the inspection checklist template
    inspectionTemplate: publicProcedure.query(async () => {
      const templates = await getChecklistTemplates(1);
      const t = templates.find(t => t.taskType === 'inspection' && t.isDefault)
             ?? templates.find(t => t.taskType === 'inspection')
             ?? templates.find(t => t.taskType === 'turnover')
             ?? templates[0];
      if (!t) return null;
      return { id: t.id, name: t.name, items: t.items as { section: string; item: string; required: boolean }[] };
    }),
    create: hostProcedure
      .input(z.object({
        name: z.string(),
        description: z.string().optional(),
        taskType: z.enum(["turnover", "maintenance", "inspection", "other"]).default("turnover"),
        items: z.array(z.object({ section: z.string(), item: z.string(), required: z.boolean() })),
        assignedToId: z.number().optional(),
        autoAssignOn: z.enum(["checkout", "checkin", "manual"]).default("manual"),
      }))
      .mutation(({ input }) => {
        const filteredItems = input.items.filter(i => i.item.trim().length > 0);
        return createChecklistTemplate({
          ...input,
          propertyId: 1,
          items: filteredItems,
        });
      }),
    update: hostProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        taskType: z.enum(["turnover", "maintenance", "inspection", "other"]).optional(),
        items: z.array(z.object({ section: z.string(), item: z.string(), required: z.boolean() })).optional(),
        assignedToId: z.number().nullable().optional(),
        autoAssignOn: z.enum(["checkout", "checkin", "manual"]).optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(({ input: { id, ...data } }) => updateChecklistTemplate(id, data)),
    delete: hostProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteChecklistTemplate(input.id)),
  }),

  // ─── Calendar ───────────────────────────────────────────────────────────────
  calendar: router({
    events: publicProcedure.query(() => getCalendarEvents(1)),
    addBlock: staffProcedure
      .input(z.object({
        title: z.string().default("Blocked"),
        startDate: z.string(),
        endDate: z.string(),
        eventType: z.enum(["booking", "block", "maintenance"]).default("block"),
      }))
      .mutation(({ input }) =>
        createCalendarEvent({
          propertyId: 1,
          source: "manual",
          title: input.title,
          startDate: input.startDate as unknown as Date,
          endDate: input.endDate as unknown as Date,
          eventType: input.eventType,
        })
      ),
    deleteEvent: staffProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteCalendarEvent(input.id)),
    updateEvent: staffProcedure
      .input(z.object({
        id: z.number(),
        guestFirstNames: z.string().nullable().optional(),
        guestPhone: z.string().nullable().optional(),
        guestCount: z.number().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ input: { id, ...data } }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new Error("DB unavailable");
        const { calendarEvents } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const [event] = await db.select({ reservationId: calendarEvents.reservationId })
          .from(calendarEvents)
          .where(eq(calendarEvents.id, id))
          .limit(1);
        if (!event) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Calendar event not found" });
        }
        const [result] = await db.update(calendarEvents).set(data as any).where(eq(calendarEvents.id, id));
        if (result.affectedRows === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Calendar event not found" });
        }
        // Imported calendar feeds can later replace their own guest fields. Persist an
        // explicitly entered non-empty name on the linked durable reservation so it
        // remains the authoritative display name after subsequent feed refreshes.
        const enteredName = getImportedReservationGuestNameOverride(data.guestFirstNames);
        if (event.reservationId && enteredName) {
          await updateReservation(event.reservationId, { guestName: enteredName });
        }
        return { success: true };
      }),
  }),

  // ─── iCal Feeds ─────────────────────────────────────────────────────────────
  ical: router({
    list: readProcedure.query(() => getIcalFeeds(1)),
    add: hostProcedure
      .input(z.object({
        source: z.enum(["airbnb", "vrbo", "booking_com", "other"]),
        label: z.string().optional(),
        url: z.string().url(),
        direction: z.enum(["import", "export"]).default("import"),
      }))
      .mutation(({ input }) => createIcalFeed({ ...input, propertyId: 1 })),
    update: hostProcedure
      .input(z.object({ id: z.number(), label: z.string().optional(), url: z.string().url().optional(), isActive: z.boolean().optional() }))
      .mutation(({ input: { id, ...data } }) => updateIcalFeed(id, data)),
    delete: hostProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteIcalFeed(input.id)),
    sync: staffProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const feeds = await getIcalFeeds(1);
        const feed = feeds.find((f) => f.id === input.id);
        if (!feed) throw new TRPCError({ code: "NOT_FOUND" });
        return syncIcalFeed(feed.id, feed.url, feed.source, feed.propertyId);
      }),
    syncAll: staffProcedure.mutation(async () => {
      const feeds = await getIcalFeeds(1);
      const active = feeds.filter((f) => f.isActive && f.direction === "import");
      const results = await Promise.allSettled(active.map((f) => syncIcalFeed(f.id, f.url, f.source, f.propertyId)));
      return { total: active.length, results: results.map((r) => r.status) };
    }),
  }),

  // ─── Pricing Rules ───────────────────────────────────────────────────────────
  pricing: router({
    list: publicProcedure.query(() => getPricingRules(1)),
    calculate: publicProcedure
      .input(z.object({ arrivalDate: z.string(), departureDate: z.string() }))
      .query(({ input }) => calculateBookingPrice(input.arrivalDate, input.departureDate, 1)),
    create: hostProcedure
      .input(z.object({
        name: z.string(),
        startDate: z.string(),
        endDate: z.string(),
        nightlyRate: z.string(),
        minNights: z.number().default(1),
        priority: z.number().default(0),
      }))
      .mutation(({ input }) =>
        createPricingRule({
          ...input,
          propertyId: 1,
          startDate: input.startDate as unknown as Date,
          endDate: input.endDate as unknown as Date,
        })
      ),
    update: hostProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        nightlyRate: z.string().optional(),
        isActive: z.boolean().optional(),
        minNights: z.number().optional(),
      }))
      .mutation(({ input: { id, ...data } }) => updatePricingRule(id, data as Parameters<typeof updatePricingRule>[1])),
    delete: hostProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deletePricingRule(input.id)),
  }),

  // ─── Daily Rates (per-date competitor-based pricing) ─────────────────────────
  dailyRates: router({
    // Public: get rates for a date range (for calendar display)
    list: publicProcedure
      .input(z.object({ startDate: z.string().optional(), endDate: z.string().optional() }))
      .query(({ input }) => getDailyRates(1, input.startDate, input.endDate)),
    // Public: get single date rate
    get: publicProcedure
      .input(z.object({ date: z.string() }))
      .query(({ input }) => getDailyRate(input.date, 1)),
    // Host: update a single date rate
    update: hostProcedure
      .input(z.object({
        id: z.number(),
        multiplier: z.string().optional(),
        overrideRate: z.string().nullable().optional(),
        cleaningFee: z.string().optional(),
        minNights: z.number().optional(),
        airbnbLow: z.string().nullable().optional(),
        airbnbHigh: z.string().nullable().optional(),
        comps: z.array(z.object({ name: z.string(), rate: z.number() })).nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(({ input: { id, ...data } }) => updateDailyRate(id, data as any)),
    // Host: bulk upsert (used by startup seed)
    upsert: hostProcedure
      .input(z.object({
        date: z.string(),
        competitorRate: z.string().nullable().optional(),
        multiplier: z.string().optional(),
        overrideRate: z.string().nullable().optional(),
        cleaningFee: z.string().optional(),
        minNights: z.number().optional(),
        airbnbLow: z.string().nullable().optional(),
        airbnbHigh: z.string().nullable().optional(),
        comps: z.array(z.object({ name: z.string(), rate: z.number() })).nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(({ input }) => upsertDailyRate({ ...input, propertyId: 1 } as any)),
    // Host: set global multiplier for all dates
    setGlobalMultiplier: hostProcedure
      .input(z.object({ multiplier: z.string() }))
      .mutation(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) return;
        const { dailyRates: dr } = await import("../drizzle/schema");
        await db.update(dr).set({ multiplier: input.multiplier });
        return { success: true };
      }),
  }),

  // ─── Reservations ───────────────────────────────────────────────────────────
  reservations: router({
    list: readProcedure.query(() => getReservations(1)),
    // Public endpoint for cleaner portal — returns upcoming checkout dates (from reservations + iCal)
    upcomingCheckouts: publicProcedure.query(async () => {
      const allRes = await getReservations(1);
      const allEvents = await getCalendarEvents(1);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split("T")[0];
      
      const toDateStr = (val: unknown): string => {
        if (!val) return '';
        if (val instanceof Date) return val.toISOString().split('T')[0];
        const s = String(val);
        if (s.includes(' ')) { const d = new Date(s); if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]; }
        return s.split('T')[0];
      };
      
      // From direct reservations
      const fromRes = allRes
        .map(r => ({
          id: r.id,
          checkoutDate: toDateStr(r.departureDate),
          checkinDate: toDateStr(r.arrivalDate),
          guestName: r.guestName,
          source: r.source,
          guestCount: r.guestCount,
          status: r.status,
        }))
        .filter(r => r.checkoutDate >= todayStr && r.checkoutDate !== '');
      
      // From iCal-synced bookings (Airbnb/Vrbo/Booking.com)
      const fromIcal = allEvents
        .filter(ev => (ev.eventType === 'booking' || ev.title === 'Reserved') && !ev.isStale)
        .map(ev => ({
          id: -(ev.id),
          checkoutDate: toDateStr(ev.endDate),
          checkinDate: toDateStr(ev.startDate),
          guestName: ev.title ?? ev.source,
          source: ev.source,
          guestCount: null,
          status: 'confirmed',
        }))
        .filter(r => r.checkoutDate >= todayStr && r.checkoutDate !== '');
      
      // Merge, deduplicate by checkoutDate, sort
      const seen = new Set<string>();
      const merged = [...fromRes, ...fromIcal]
        .filter(r => { if (seen.has(r.checkoutDate)) return false; seen.add(r.checkoutDate); return true; })
        .sort((a, b) => a.checkoutDate.localeCompare(b.checkoutDate))
        .slice(0, 10);
      
      return merged;
    }),
    get: readProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getReservationById(input.id)),
    create: staffProcedure
      .input(z.object({
        source: z.enum(["direct", "airbnb", "vrbo", "booking_com", "other"]).default("direct"),
        guestName: z.string().optional(),
        guestEmail: z.union([z.string().email(), z.literal("")]).optional().transform(v => v === "" ? undefined : v),
        guestPhone: z.string().optional(),
        guestCount: z.number().default(1),
        arrivalDate: z.string(),
        departureDate: z.string(),
        nightlyRate: z.string().optional(),
        cleaningFee: z.string().optional(),
        totalAmount: z.string().optional(),
        notes: z.string().optional(),
        status: z.enum(["pending", "confirmed", "checked_in", "checked_out", "cancelled"]).default("confirmed"),
      }))
      .mutation(async ({ input }) => {
        await createReservation({
          ...input,
          propertyId: 1,
          arrivalDate: input.arrivalDate as unknown as Date,
          departureDate: input.departureDate as unknown as Date,
        });
        await createCalendarEvent({
          propertyId: 1,
          source: input.source === "direct" ? "direct" : input.source as "airbnb" | "vrbo" | "booking_com" | "other",
          title: input.guestName ? `${input.guestName} (${input.source})` : input.source,
          startDate: input.arrivalDate as unknown as Date,
          endDate: input.departureDate as unknown as Date,
          eventType: "booking",
        });
        return { success: true };
      }),
    update: staffProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pending", "confirmed", "checked_in", "checked_out", "cancelled"]).optional(),
        guestName: z.string().optional(),
        guestEmail: z.union([z.string().email(), z.literal("")]).optional().transform(v => v === "" ? undefined : v),
        guestPhone: z.string().optional(),
        guestCount: z.number().optional(),
        arrivalDate: z.string().optional(),
        departureDate: z.string().optional(),
        notes: z.string().optional(),
        paymentStatus: z.enum(["unpaid", "partial", "paid", "refunded"]).optional(),
        totalAmount: z.string().optional(),
        nightlyRate: z.string().optional(),
        cleaningFee: z.string().optional(),
      }))
      .mutation(({ input: { id, ...data } }) => updateReservation(id, data as Parameters<typeof updateReservation>[1])),
    delete: hostProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteReservation(input.id)),
    generateCode: staffProcedure
      .input(z.object({ reservationId: z.number() }))
      .mutation(async ({ input }) => {
        const reservation = await getReservationById(input.reservationId);
        if (!reservation) throw new TRPCError({ code: "NOT_FOUND" });
        const code = nanoid(8).toUpperCase();
        const validFrom = new Date(reservation.arrivalDate);
        validFrom.setDate(validFrom.getDate() - 1);
        const validUntil = new Date(reservation.departureDate);
        validUntil.setDate(validUntil.getDate() + 1);
        await createAccessCode({ reservationId: input.reservationId, code, validFrom, validUntil });
        return { code };
      }),
    getCodes: staffProcedure
      .input(z.object({ reservationId: z.number() }))
      .query(({ input }) => getAccessCodesByReservation(input.reservationId)),
    revokeCode: staffProcedure
      .input(z.object({ codeId: z.number() }))
      .mutation(({ input }) => updateAccessCode(input.codeId, { isRevoked: true })),
    getStripeCustomer: readProcedure
      .input(z.object({ reservationId: z.number() }))
      .query(({ input }) => getStripeCustomerByReservation(input.reservationId)),
  }),

  // ─── Guest Portal ────────────────────────────────────────────────────────────
  guest: router({
    verifyCode: publicProcedure
      .input(z.object({ code: z.string() }))
      .mutation(async ({ input }) => {
        const record = await getAccessCodeByCode(input.code.toUpperCase());
        if (!record) return { valid: false, reason: "Invalid code" };
        if ((record as any).portalType === 'tenant') return { valid: false, reason: "Invalid code" };
        if (record.isRevoked) return { valid: false, reason: "Code has been revoked" };
        const now = new Date();
        if (now < record.validFrom) return { valid: false, reason: "Code not yet active" };
        if (now > record.validUntil) return { valid: false, reason: "Code has expired" };
        await updateAccessCode(record.id, { lastUsedAt: new Date(), useCount: (record.useCount ?? 0) + 1 });
        const reservation = await getReservationById(record.reservationId);
        return {
          valid: true,
          reservationId: record.reservationId,
          guestName: reservation?.guestName,
          arrivalDate: reservation?.arrivalDate,
          departureDate: reservation?.departureDate,
        };
      }),
    pages: publicProcedure.query(() => getGuestPages(1)),
    page: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(({ input }) => getGuestPageBySlug(input.slug, 1)),
  }),

  // ─── Guest Pages (host editor) ───────────────────────────────────────────────
  guestPages: router({
    list: readProcedure.query(() => getGuestPages(1)),
    update: staffProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        content: z.string().optional(),
        isVisible: z.boolean().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(({ input: { id, ...data } }) => updateGuestPage(id, data)),
  }),

  // Tenant portal (public read, host edit)
  tenant: router({
    verifyCode: publicProcedure
      .input(z.object({ code: z.string() }))
      .mutation(async ({ input }) => {
        const record = await getAccessCodeByCode(input.code.toUpperCase());
        if (!record) return { valid: false, reason: 'Invalid code' };
        const portalType = (record as any).portalType;
        if (portalType !== 'tenant') return { valid: false, reason: 'Invalid code' };
        if (record.isRevoked) return { valid: false, reason: 'Code has been revoked' };
        const now = new Date();
        if (now < record.validFrom) return { valid: false, reason: 'Code not yet active' };
        if (now > record.validUntil) return { valid: false, reason: 'Code has expired' };
        await updateAccessCode(record.id, { lastUsedAt: new Date(), useCount: (record.useCount ?? 0) + 1 });
        return { valid: true };
      }),
    pages: publicProcedure.query(() => getTenantPages(1)),
    page: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(({ input }) => getTenantPageBySlug(input.slug, 1)),
  }),

  // Tenant Pages (host editor)
  tenantPages: router({
    list: readProcedure.query(() => getTenantPages(1)),
    update: staffProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        content: z.string().optional(),
        isVisible: z.boolean().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(({ input: { id, ...data } }) => updateTenantPage(id, data)),
  }),

  // ─── Terms Pages ─────────────────────────────────────────────────────────────
  terms: router({
    list: publicProcedure.query(() => getTermsPages(1)),
    update: hostProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        content: z.string().optional(),
        isRequired: z.boolean().optional(),
      }))
      .mutation(({ input: { id, ...data } }) => updateTermsPage(id, data)),
  }),

  // ─── Booking (public) ────────────────────────────────────────────────────────
  booking: router({
    checkAvailability: publicProcedure
      .input(z.object({ arrivalDate: z.string(), departureDate: z.string() }))
      .query(async ({ input }) => {
        const events = await getCalendarEvents(1);
        const arrival = input.arrivalDate;
        const departure = input.departureDate;
        const conflicts = events.filter((ev) => {
          const evStart = String(ev.startDate).split("T")[0];
          const evEnd = String(ev.endDate).split("T")[0];
          return !(departure <= evStart || arrival >= evEnd);
        });
        return { available: conflicts.length === 0, conflicts: conflicts.length };
      }),
    createCheckout: publicProcedure
      .input(z.object({
        guestName: z.string().min(2),
        guestEmail: z.string().email(),
        guestPhone: z.string().optional(),
        arrivalDate: z.string(),
        departureDate: z.string(),
        guestCount: z.number().min(1).default(1),
        message: z.string().optional(),
        termsAccepted: z.boolean(),
        damageChargeConsent: z.boolean(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!input.termsAccepted || !input.damageChargeConsent) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "You must accept all terms to proceed" });
        }

        // Check availability
        const events = await getCalendarEvents(1);
        const conflicts = events.filter((ev) => {
          const evStart = String(ev.startDate).split("T")[0];
          const evEnd = String(ev.endDate).split("T")[0];
          return !(input.departureDate <= evStart || input.arrivalDate >= evEnd);
        });
        if (conflicts.length > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "Selected dates are not available" });
        }

        // Calculate price
        const priceCalc = await calculateBookingPrice(input.arrivalDate, input.departureDate, 1);
        if (!priceCalc) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid dates" });

        // Create pending reservation
        await createReservation({
          propertyId: 1,
          source: "direct",
          status: "pending",
          guestName: input.guestName,
          guestEmail: input.guestEmail,
          guestPhone: input.guestPhone,
          guestCount: input.guestCount,
          arrivalDate: input.arrivalDate as unknown as Date,
          departureDate: input.departureDate as unknown as Date,
          nightlyRate: String(priceCalc.avgNightlyRate.toFixed(2)),
          cleaningFee: String(priceCalc.cleaningFee.toFixed(2)),
          totalAmount: String(priceCalc.total.toFixed(2)),
          notes: input.message,
          paymentStatus: "unpaid",
        });

        // Get the reservation we just created
        const allRes = await getReservations(1);
        const newRes = allRes.find((r) =>
          r.guestEmail === input.guestEmail &&
          String(r.arrivalDate).split("T")[0] === input.arrivalDate &&
          r.status === "pending"
        );
        if (!newRes) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create reservation" });

        // Block calendar
        await createCalendarEvent({
          propertyId: 1,
          source: "direct",
          title: `${input.guestName} (pending)`,
          startDate: input.arrivalDate as unknown as Date,
          endDate: input.departureDate as unknown as Date,
          eventType: "booking",
          reservationId: newRes.id,
        });

        // Create Stripe checkout
        const origin = (ctx.req.headers as Record<string, string>)["origin"] ?? "https://example.com";
        const checkout = await createBookingCheckout({
          reservationId: newRes.id,
          guestEmail: input.guestEmail,
          guestName: input.guestName,
          arrivalDate: input.arrivalDate,
          departureDate: input.departureDate,
          nights: priceCalc.nights,
          nightlyRate: priceCalc.avgNightlyRate,
          cleaningFee: priceCalc.cleaningFee,
          totalAmount: priceCalc.total,
          origin,
        });

        // Notify owner
        await notifyOwner({
          title: "New Direct Booking",
          content: `${input.guestName} (${input.guestEmail}) booked ${input.arrivalDate} → ${input.departureDate}. Total: $${priceCalc.total.toFixed(2)}`,
        });

        return { checkoutUrl: checkout.url, reservationId: newRes.id, priceCalc };
      }),
  }),

  // ─── Booking Requests (legacy) ────────────────────────────────────────────────
  bookingRequests: router({
    submit: publicProcedure
      .input(z.object({
        guestName: z.string().min(2),
        guestEmail: z.string().email(),
        guestPhone: z.string().optional(),
        arrivalDate: z.string(),
        departureDate: z.string(),
        guestCount: z.number().min(1).max(10).default(1),
        message: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        await createBookingRequest({
          ...input,
          propertyId: 1,
          arrivalDate: input.arrivalDate as unknown as Date,
          departureDate: input.departureDate as unknown as Date,
        });
        await notifyOwner({
          title: "New Booking Request",
          content: `${input.guestName} (${input.guestEmail}) requested ${input.arrivalDate} → ${input.departureDate}.`,
        });
        return { success: true };
      }),
    list: readProcedure.query(() => getBookingRequests(1)),
    update: staffProcedure
      .input(z.object({ id: z.number(), status: z.enum(["new", "reviewed", "converted", "declined"]) }))
      .mutation(({ input: { id, ...data } }) => updateBookingRequest(id, data)),
  }),

  // ─── Tasks ───────────────────────────────────────────────────────────────────
  tasks: router({
    list: readProcedure.query(async ({ ctx }) => {
      if (ctx.localUser.role === "cleaner") return getTasksByAssignee(ctx.localUser.id);
      return getTasks(1);
    }),
    create: staffProcedure
      .input(z.object({
        reservationId: z.number().optional(),
        assignedToId: z.number().optional(),
        type: z.enum(["turnover", "maintenance", "inspection", "other"]).default("turnover"),
        title: z.string(),
        notes: z.string().optional(),
        dueDate: z.string().optional(),
        arrivalWindow: z.string().optional(),
        departureWindow: z.string().optional(),
        checklist: z.array(z.object({ item: z.string(), done: z.boolean() })).optional(),
      }))
      .mutation(({ input }) =>
        createTask({
          ...input,
          propertyId: 1,
          dueDate: input.dueDate as unknown as Date | undefined,
          checklist: input.checklist ?? [],
        })
      ),
    update: requireLocalAuth
      .input(z.object({
        id: z.number(),
        status: z.enum(["pending", "in_progress", "complete", "skipped"]).optional(),
        notes: z.string().optional(),
        checklist: z.array(z.object({ item: z.string(), done: z.boolean() })).optional(),
        assignedToId: z.number().optional(),
        dueDate: z.string().optional(),
        arrivalWindow: z.string().optional(),
        departureWindow: z.string().optional(),
      }))
      .mutation(async ({ input: { id, ...data }, ctx }) => {
        if (ctx.localUser.role === "cleaner") {
          await updateTask(id, {
            status: data.status,
            checklist: data.checklist,
            completedAt: data.status === "complete" ? new Date() : undefined,
          });
          return;
        }
        await updateTask(id, {
          ...data,
          dueDate: data.dueDate as unknown as Date | undefined,
          completedAt: data.status === "complete" ? new Date() : undefined,
        });
      }),
    delete: staffProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteTask(input.id)),
  }),

  // ─── Costs ───────────────────────────────────────────────────────────────────
  costs: router({
    list: readProcedure.query(() => getCosts(1)),
    create: staffProcedure
      .input(z.object({
        reservationId: z.number().optional(),
        category: z.enum(["cleaning", "supplies", "repairs", "property_manager_fee", "platform_fee", "utilities", "other"]),
        amount: z.string(),
        vendor: z.string().optional(),
        description: z.string().optional(),
        costDate: z.string(),
      }))
      .mutation(({ input, ctx }) =>
        createCost({
          ...input,
          propertyId: 1,
          createdById: ctx.localUser.id,
          costDate: input.costDate as unknown as Date,
        })
      ),
    update: staffProcedure
      .input(z.object({
        id: z.number(),
        category: z.enum(["cleaning", "supplies", "repairs", "property_manager_fee", "platform_fee", "utilities", "other"]).optional(),
        amount: z.string().optional(),
        vendor: z.string().optional(),
        description: z.string().optional(),
        costDate: z.string().optional(),
      }))
      .mutation(({ input: { id, ...data } }) => updateCost(id, data as Parameters<typeof updateCost>[1])),
    delete: staffProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteCost(input.id)),
  }),

  // ─── Financials & payouts ───────────────────────────────────────────────────
  financials: router({
    month: hostProcedure
      .input(z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }))
      .query(({ input }) => getFinancialMonth(1, input.month)),
    reservation: hostProcedure
      .input(z.object({ reservationId: z.number() }))
      .query(({ input }) => getReservationFinancial(input.reservationId)),
    upsertReservation: hostProcedure
      .input(z.object({
        reservationId: z.number(),
        grossRevenue: z.string().regex(/^\d+(\.\d{1,2})?$/),
        platformFees: z.string().regex(/^\d+(\.\d{1,2})?$/),
        cleaningFeeCollected: z.string().regex(/^\d+(\.\d{1,2})?$/),
        netReceived: z.string().regex(/^\d+(\.\d{1,2})?$/),
        revenueReceivedAt: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(({ input }) => upsertReservationFinancial({ propertyId: 1, ...input })),
    cohosts: hostProcedure.query(() => getCohosts(1)),
    platformPayouts: hostProcedure.input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })).query(({ input }) => getPlatformPayouts(1, input.month)),
    createPlatformPayout: hostProcedure
      .input(z.object({
        platform: z.enum(["airbnb", "vrbo", "booking_com", "other"]),
        payoutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        grossAmount: z.string().regex(/^\d+(\.\d{1,2})?$/),
        platformFees: z.string().regex(/^\d+(\.\d{1,2})?$/),
        netAmount: z.string().regex(/^\d+(\.\d{1,2})?$/),
        reference: z.string().max(255).nullable().optional(),
        notes: z.string().nullable().optional(),
        allocations: z.array(z.object({
          reservationId: z.number(),
          grossAmount: z.string().regex(/^\d+(\.\d{1,2})?$/),
          platformFees: z.string().regex(/^\d+(\.\d{1,2})?$/),
          netAmount: z.string().regex(/^\d+(\.\d{1,2})?$/),
        })).default([]),
      }))
      .mutation(({ input }) => createPlatformPayout({ propertyId: 1, ...input })),
    updatePlatformPayout: hostProcedure
      .input(z.object({
        id: z.number(),
        platform: z.enum(["airbnb", "vrbo", "booking_com", "other"]),
        payoutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        grossAmount: z.string().regex(/^\d+(\.\d{1,2})?$/),
        platformFees: z.string().regex(/^\d+(\.\d{1,2})?$/),
        netAmount: z.string().regex(/^\d+(\.\d{1,2})?$/),
        reference: z.string().max(255).nullable().optional(),
        notes: z.string().nullable().optional(),
        allocations: z.array(z.object({
          reservationId: z.number(),
          grossAmount: z.string().regex(/^\d+(\.\d{1,2})?$/),
          platformFees: z.string().regex(/^\d+(\.\d{1,2})?$/),
          netAmount: z.string().regex(/^\d+(\.\d{1,2})?$/),
        })).default([]),
      }))
      .mutation(({ input }) => updatePlatformPayout(input.id, { propertyId: 1, ...input })),
    deletePlatformPayout: hostProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => deletePlatformPayout(input.id, 1)),
    createCohost: hostProcedure
      .input(z.object({
        name: z.string().trim().min(1).max(255),
        ratePercent: z.string().regex(/^\d{1,3}(\.\d{1,2})?$/),
        payoutBasis: z.enum(["gross_revenue", "after_platform_fees", "after_platform_fees_less_cleaning", "after_stay_expenses"]),
        notes: z.string().nullable().optional(),
      }))
      .mutation(({ input }) => createCohost({ propertyId: 1, ...input, isActive: true })),
    updateCohost: hostProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().trim().min(1).max(255).optional(),
        ratePercent: z.string().regex(/^\d{1,3}(\.\d{1,2})?$/).optional(),
        payoutBasis: z.enum(["gross_revenue", "after_platform_fees", "after_platform_fees_less_cleaning", "after_stay_expenses"]).optional(),
        isActive: z.boolean().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(({ input: { id, ...data } }) => updateCohost(id, data)),
  }),

  // ─── Cleaning Jobs ───────────────────────────────────────────────────────────────────────────────────────
  cleans: router({
    list: readProcedure.query(() => getCleaningJobs(1)),
    // Cleaner-facing schedule: operational availability and work only, never guest details.
    operationalCalendar: publicProcedure.query(async () => {
      const [allReservations, allEvents, allJobs] = await Promise.all([
        getReservations(1),
        getCalendarEvents(1),
        getCleaningJobs(1),
      ]);
      const toDateStr = (value: unknown) => {
        if (!value) return "";
        if (value instanceof Date) return value.toISOString().split("T")[0];
        return String(value).split("T")[0].split(" ")[0];
      };
      const occupied = allReservations
        .filter(reservation => reservation.status !== "cancelled")
        .map(reservation => ({
          id: `reservation-${reservation.id}`,
          startDate: toDateStr(reservation.arrivalDate),
          endDate: toDateStr(reservation.departureDate),
          category: "occupied" as const,
          label: "Occupied",
        }));
      const sourceEvents = allEvents
        .filter(event => !event.isStale)
        .map(event => {
          const title = (event.title ?? "").toLowerCase();
          if (event.eventType === "booking") {
            return {
              id: `calendar-${event.id}`,
              startDate: toDateStr(event.startDate),
              endDate: toDateStr(event.endDate),
              category: "occupied" as const,
              label: "Occupied",
            };
          }
          if (event.eventType === "maintenance" || title.includes("maintenance")) {
            return {
              id: `calendar-${event.id}`,
              startDate: toDateStr(event.startDate),
              endDate: toDateStr(event.endDate),
              category: "maintenance" as const,
              label: "Maintenance",
            };
          }
          if (/break|owner stay|owner block|hold/.test(title)) {
            return {
              id: `calendar-${event.id}`,
              startDate: toDateStr(event.startDate),
              endDate: toDateStr(event.endDate),
              category: "break" as const,
              label: "Break / blocked",
            };
          }
          return {
            id: `calendar-${event.id}`,
            startDate: toDateStr(event.startDate),
            endDate: toDateStr(event.endDate),
            category: "blocked" as const,
            label: "Blocked / unavailable",
          };
        });
      const cleaning = allJobs.map(job => ({
        id: `cleaning-${job.id}`,
        startDate: toDateStr(job.checkoutDate),
        endDate: toDateStr(job.checkoutDate),
        category: "cleaning" as const,
        label: job.status === "complete" ? "Cleaning complete" : "Cleaning scheduled",
      }));
      const seen = new Set<string>();
      return [...occupied, ...sourceEvents, ...cleaning]
        .filter(item => {
          if (!item.startDate || !item.endDate) return false;
          const key = `${item.category}:${item.startDate}:${item.endDate}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.category.localeCompare(b.category));
    }),
    create: hostProcedure
      .input(z.object({
        checkoutDate: z.string(),
        checkinDate: z.string().optional(),
        reservationId: z.number().optional(),
        assignedToId: z.number().optional(),
        checklistTemplateId: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        await upsertCleaningJobForCheckout(1, input.checkoutDate, input.reservationId, input.checkinDate);
        return { success: true };
      }),
    update: hostProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pending", "accepted", "in_progress", "complete", "skipped"]).optional(),
        assignedToId: z.number().optional(),
        checklistTemplateId: z.number().optional(),
        checklistProgress: z.array(z.boolean()).optional(),
        notes: z.string().optional(),
        completedAt: z.string().optional(),
      }))
      .mutation(async ({ input: { id, completedAt, ...data } }) => {
        await updateCleaningJob(id, {
          ...data,
          checklistProgress: data.checklistProgress as any,
          ...(completedAt ? { completedAt: new Date(completedAt) } : {}),
        });
        return { success: true };
      }),
    delete: hostProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteCleaningJob(input.id)),
    // Public endpoint for cleaner/inspector portals — record job completion without auth
    recordCompletion: publicProcedure
      .input(z.object({
        checkoutDate: z.string(),
        jobType: z.enum(["cleaning", "inspection"]).default("cleaning"),
        completedBy: z.string().optional(),
        checklistProgress: z.array(z.boolean()).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        // Find or create a cleaning job for this checkout date
        const job = await upsertCleaningJobForCheckout(1, input.checkoutDate);
        if (!job) return { success: false };
        // Update the job with completion details
        const notes = [
          input.jobType === 'inspection' ? '[Inspection]' : '[Cleaning]',
          input.completedBy ? `Completed by: ${input.completedBy}` : null,
          input.notes,
        ].filter(Boolean).join(' — ');
        await updateCleaningJob(job.id, {
          status: 'complete',
          checklistProgress: input.checklistProgress as any,
          notes: notes || undefined,
          completedAt: new Date(),
        });
        return { success: true, jobId: job.id };
      }),
    // Auto-create cleaning jobs from upcoming reservations
    syncFromReservations: hostProcedure.mutation(async () => {
      const allRes = await getReservations(1);
      const allEvents = await getCalendarEvents(1);
      const today = new Date().toISOString().split('T')[0];
      // Helper to normalize any date value to YYYY-MM-DD
      const toStr = (val: unknown): string => {
        if (!val) return '';
        if (val instanceof Date) return val.toISOString().split('T')[0];
        const s = String(val);
        if (s.includes('T')) return s.split('T')[0];
        if (s.includes(' ') && s.length > 10) { const d = new Date(s); if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]; }
        return s.slice(0, 10);
      };
      let created = 0;
      // From direct reservations
      for (const r of allRes) {
        const dep = toStr(r.departureDate);
        if (dep >= today) {
          const arr = toStr(r.arrivalDate);
          await upsertCleaningJobForCheckout(1, dep, r.id, arr);
          created++;
        }
      }
      // From iCal-synced bookings
      for (const ev of allEvents) {
        if (ev.eventType !== 'booking' && ev.title !== 'Reserved') continue;
        const dep = toStr(ev.endDate);
        const arr = toStr(ev.startDate);
        if (dep >= today) {
          await upsertCleaningJobForCheckout(1, dep, undefined, arr);
          created++;
        }
      }
      return { created };
    }),
  }),

  // ─── Guest Feedback (private) ──────────────────────────────────────────────────────────────
  feedback: router({
    submit: publicProcedure
      .input(z.object({
        guestName: z.string().max(128).optional(),
        category: z.enum(["general", "issue", "suggestion", "compliment"]).default("general"),
        message: z.string().min(3).max(2000),
      }))
      .mutation(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new Error("DB unavailable");
        const { guestFeedback } = await import("../drizzle/schema");
        await db.insert(guestFeedback).values({ ...input, propertyId: 1 });
        return { success: true };
      }),
    list: readProcedure.query(async () => {
      const db = await (await import("./db")).getDb();
      if (!db) return [];
      const { guestFeedback } = await import("../drizzle/schema");
      const { desc } = await import("drizzle-orm");
      return db.select().from(guestFeedback).orderBy(desc(guestFeedback.createdAt));
    }),
    markRead: hostProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new Error("DB unavailable");
        const { guestFeedback } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.update(guestFeedback).set({ isRead: true }).where(eq(guestFeedback.id, input.id));
        return { success: true };
      }),
    delete: hostProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new Error("DB unavailable");
        const { guestFeedback } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.delete(guestFeedback).where(eq(guestFeedback.id, input.id));
        return { success: true };
      }),
  }),

  // ─── Guestbook ──────────────────────────────────────────────────────────────
  guestbook: router({
    // Public: list visible entries
    list: publicProcedure.query(async () => {
      const db = await (await import("./db")).getDb();
      if (!db) return [];
      const { guestbookEntries } = await import("../drizzle/schema");
      const { eq, desc } = await import("drizzle-orm");
      return db.select().from(guestbookEntries)
        .where(eq(guestbookEntries.isVisible, true))
        .orderBy(desc(guestbookEntries.createdAt));
    }),
    // Public: submit a new entry
    submit: publicProcedure
      .input(z.object({
        guestName: z.string().min(1).max(128),
        hometown: z.string().max(128).optional(),
        message: z.string().min(3).max(1000),
      }))
      .mutation(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new Error("DB unavailable");
        const { guestbookEntries } = await import("../drizzle/schema");
        await db.insert(guestbookEntries).values({ ...input, propertyId: 1 });
        return { success: true };
      }),
    // Host: list all entries (including hidden)
    listAll: readProcedure.query(async () => {
      const db = await (await import("./db")).getDb();
      if (!db) return [];
      const { guestbookEntries } = await import("../drizzle/schema");
      const { desc } = await import("drizzle-orm");
      return db.select().from(guestbookEntries).orderBy(desc(guestbookEntries.createdAt));
    }),
    // Host: update (edit message or toggle visibility)
    update: hostProcedure
      .input(z.object({
        id: z.number(),
        message: z.string().optional(),
        guestName: z.string().optional(),
        hometown: z.string().nullable().optional(),
        isVisible: z.boolean().optional(),
      }))
      .mutation(async ({ input: { id, ...data } }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new Error("DB unavailable");
        const { guestbookEntries } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.update(guestbookEntries).set(data as any).where(eq(guestbookEntries.id, id));
        return { success: true };
      }),
    // Host: delete an entry
    delete: hostProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new Error("DB unavailable");
        const { guestbookEntries } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.delete(guestbookEntries).where(eq(guestbookEntries.id, input.id));
        return { success: true };
      }),
  }),

  // ─── Property Issues (public report from cleaner portal) ─────────────────────
  issues: router({
    list: readProcedure.query(async () => {
      const allTasks = await getTasks(1);
      const issues: any[] = [];
      for (const task of allTasks) {
        const checklist = (task.checklist ?? []) as any[];
        for (const item of checklist) {
          if (item.issue) {
            issues.push({
              taskId: task.id,
              taskTitle: task.title,
              taskStatus: task.status,
              item: item.item,
              section: item.section ?? "",
              issueDescription: item.issue.description,
              issueSeverity: item.issue.severity ?? "minor",
              issueReportedAt: item.issue.reportedAt,
              issueReportedBy: item.issue.reportedBy ?? "Unknown",
              issueStatus: item.issue.status ?? "open",
              issueLocation: item.issue.location ?? "",
            });
          }
        }
      }
      return issues.sort((a, b) => {
        const sev: Record<string, number> = { urgent: 0, attention: 1, minor: 2 };
        return (sev[a.issueSeverity] ?? 2) - (sev[b.issueSeverity] ?? 2);
      });
    }),
    updateStatus: hostProcedure
      .input(z.object({ taskId: z.number(), itemIndex: z.number(), status: z.enum(["open", "in_progress", "resolved"]) }))
      .mutation(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new Error("DB unavailable");
        const allTasks2 = await getTasks(1);
        const task = allTasks2.find(t => t.id === input.taskId);
        if (!task) throw new TRPCError({ code: "NOT_FOUND" });
        const checklist = [...((task.checklist ?? []) as any[])];
        if (checklist[input.itemIndex]?.issue) {
          checklist[input.itemIndex].issue.status = input.status;
          await updateTask(input.taskId, { checklist: JSON.stringify(checklist) as any });
        }
        return { success: true };
      }),
    report: publicProcedure
      .input(z.object({
        description: z.string().min(3),
        severity: z.enum(["minor", "attention", "urgent"]).default("minor"),
        location: z.string().optional(),
        reportedBy: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        // Create a maintenance task with the issue embedded in the checklist
        await createTask({
          propertyId: 1,
          type: "maintenance",
          title: `Issue reported: ${input.description.slice(0, 60)}${input.description.length > 60 ? '...' : ''}`,
          notes: input.location ? `Location: ${input.location}\n${input.description}` : input.description,
          status: "pending",
          checklist: [{
            item: input.description,
            done: false,
            issue: {
              description: input.description,
              severity: input.severity,
              reportedAt: new Date().toISOString(),
              reportedBy: input.reportedBy ?? "Cleaner",
            },
          }] as any,
        });
        return { success: true };
      }),
  }),

  // ─── Damage Charges ──────────────────────────────────────────────────────────
  damage: router({
    list: readProcedure
      .input(z.object({ reservationId: z.number().optional() }))
      .query(({ input }) => getDamageCharges(input.reservationId)),
    allCustomers: readProcedure.query(() => getAllStripeCustomers()),
    charge: hostProcedure
      .input(z.object({
        stripeCustomerRecordId: z.number(),
        amount: z.number().positive(),
        description: z.string().min(5),
      }))
      .mutation(({ input, ctx }) =>
        chargeDamage({
          stripeCustomerRecordId: input.stripeCustomerRecordId,
          amount: input.amount,
          description: input.description,
          chargedById: ctx.localUser.id,
        })
      ),
  }),

  // ─── Bypass Codes ──────────────────────────────────────────────────────────────────────────────
  bypassCodes: router({
    list: readProcedure.query(() => getBypassCodes(1)),
    create: hostProcedure
      .input(z.object({
        code: z.string().min(4).max(10),
        label: z.string().optional(),
        portalType: z.enum(["guest", "cleaner", "inspector", "all"]).default("guest"),
      }))
      .mutation(async ({ input }) => {
        await createBypassCode({ ...input, propertyId: 1 });
        return { success: true };
      }),
    delete: hostProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteBypassCode(input.id)),
    // Public endpoint — check if a code is a valid bypass code
    verify: publicProcedure
      .input(z.object({ code: z.string() }))
      .query(async ({ input }) => {
        const bc = await getBypassCodeByCode(input.code.toUpperCase());
        if (!bc) return { valid: false, portalType: null, label: null };
        // Check expiry
        if (bc.expiresAt && new Date(bc.expiresAt) < new Date()) return { valid: false, portalType: null, label: null };
        return { valid: true, portalType: bc.portalType, label: bc.label };
      }),
    // Host: regenerate a code
    regenerate: hostProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const newCode = await regenerateBypassCode(input.id);
        return { code: newCode };
      }),
    // Host: auto-create code for a calendar event
    upsertForEvent: hostProcedure
      .input(z.object({ calendarEventId: z.number(), label: z.string().optional(), expiresAt: z.string().optional(), customCode: z.string().optional() }))
      .mutation(async ({ input }) => {
        const expires = input.expiresAt ? new Date(input.expiresAt) : undefined;
        const bc = await upsertBypassCodeForEvent(1, input.calendarEventId, input.label ?? "Guest", expires);
        // If a custom code was provided, update the code to that value
        if (bc && input.customCode && input.customCode.length === 4) {
          const db = await (await import("./db")).getDb();
          if (db) {
            const { bypassCodes } = await import("../drizzle/schema");
            const { eq } = await import("drizzle-orm");
            await db.update(bypassCodes).set({ code: input.customCode }).where(eq(bypassCodes.id, bc.id));
            return { ...bc, code: input.customCode };
          }
        }
        return bc;
      }),
    // Host: set a specific code value on an existing bypass code
    setCode: hostProcedure
      .input(z.object({ id: z.number(), code: z.string().length(4) }))
      .mutation(async ({ input }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new Error("DB unavailable");
        const { bypassCodes } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.update(bypassCodes).set({ code: input.code }).where(eq(bypassCodes.id, input.id));
        return { success: true };
      }),
    // Host: get codes for calendar events (for Reservations page)
    listForEvents: readProcedure.query(async () => {
      const all = await getBypassCodes(1);
      return all.filter(bc => bc.calendarEventId != null);
    }),
  }),
});

export type AppRouter = typeof appRouter;
