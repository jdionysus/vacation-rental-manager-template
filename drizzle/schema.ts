import {
  boolean,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  date,
} from "drizzle-orm/mysql-core";

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["host", "property_manager", "cleaner", "accountant", "admin"]).default("host").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Property ────────────────────────────────────────────────────────────────

export const property = mysqlTable("property", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull().default("Our Rental"),
  tagline: text("tagline"),
  description: text("description"),
  address: text("address"),
  city: varchar("city", { length: 128 }),
  maxGuests: int("maxGuests").default(4),
  bedrooms: int("bedrooms").default(1),
  bathrooms: int("bathrooms").default(1),
  checkInTime: varchar("checkInTime", { length: 8 }).default("15:00"),
  checkOutTime: varchar("checkOutTime", { length: 8 }).default("11:00"),
  cleaningFee: decimal("cleaningFee", { precision: 10, scale: 2 }).default("0"),
  nightlyRate: decimal("nightlyRate", { precision: 10, scale: 2 }).default("0"),
  amenities: json("amenities").$type<string[]>(),
  houseRules: text("houseRules"),
  photos: json("photos").$type<string[]>(),
  timezone: varchar("timezone", { length: 64 }).default("America/Denver"),
  listingNote: text("listingNote"),
  mapImageUrl: text("mapImageUrl"),
  mapLocationLabel: varchar("mapLocationLabel", { length: 255 }),
  seoTitle: varchar("seoTitle", { length: 255 }),
  seoDescription: text("seoDescription"),
  seoKeywords: text("seoKeywords"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Property = typeof property.$inferSelect;
export type InsertProperty = typeof property.$inferInsert;

// ─── Reservations ─────────────────────────────────────────────────────────────

export const reservations = mysqlTable("reservations", {
  id: int("id").autoincrement().primaryKey(),
  propertyId: int("propertyId").notNull().default(1),
  source: mysqlEnum("source", ["direct", "airbnb", "vrbo", "booking_com", "other"]).default("direct").notNull(),
  status: mysqlEnum("status", ["pending", "confirmed", "checked_in", "checked_out", "cancelled"]).default("pending").notNull(),
  guestName: varchar("guestName", { length: 255 }),
  guestEmail: varchar("guestEmail", { length: 320 }),
  guestPhone: varchar("guestPhone", { length: 32 }),
  guestCount: int("guestCount").default(1),
  arrivalDate: date("arrivalDate").notNull(),
  departureDate: date("departureDate").notNull(),
  nightlyRate: decimal("nightlyRate", { precision: 10, scale: 2 }),
  cleaningFee: decimal("cleaningFee", { precision: 10, scale: 2 }),
  totalAmount: decimal("totalAmount", { precision: 10, scale: 2 }),
  paymentStatus: mysqlEnum("paymentStatus", ["unpaid", "partial", "paid", "refunded"]).default("unpaid"),
  notes: text("notes"),
  externalId: varchar("externalId", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Reservation = typeof reservations.$inferSelect;
export type InsertReservation = typeof reservations.$inferInsert;

// ─── Calendar Events (availability blocks from all sources) ──────────────────

export const calendarEvents = mysqlTable("calendar_events", {
  id: int("id").autoincrement().primaryKey(),
  propertyId: int("propertyId").notNull().default(1),
  source: mysqlEnum("source", ["direct", "airbnb", "vrbo", "booking_com", "manual", "other"]).notNull(),
  externalUid: varchar("externalUid", { length: 512 }),
  title: varchar("title", { length: 255 }),
  guestFirstNames: varchar("guestFirstNames", { length: 255 }), // e.g. "Jessica & John"
  guestPhone: varchar("guestPhone", { length: 32 }),
  guestCount: int("guestCount").default(1),
  notes: text("notes"),
  startDate: date("startDate").notNull(),
  endDate: date("endDate").notNull(),
  eventType: mysqlEnum("eventType", ["booking", "block", "maintenance"]).default("booking").notNull(),
  reservationId: int("reservationId"),
  lastSeenAt: timestamp("lastSeenAt").defaultNow(),
  isStale: boolean("isStale").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type InsertCalendarEvent = typeof calendarEvents.$inferInsert;

// ─── iCal Feeds ───────────────────────────────────────────────────────────────

export const icalFeeds = mysqlTable("ical_feeds", {
  id: int("id").autoincrement().primaryKey(),
  propertyId: int("propertyId").notNull().default(1),
  source: mysqlEnum("source", ["airbnb", "vrbo", "booking_com", "other"]).notNull(),
  label: varchar("label", { length: 128 }),
  url: text("url").notNull(),
  direction: mysqlEnum("direction", ["import", "export"]).default("import").notNull(),
  lastSyncAt: timestamp("lastSyncAt"),
  lastStatus: mysqlEnum("lastStatus", ["ok", "error", "pending"]).default("pending"),
  lastError: text("lastError"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type IcalFeed = typeof icalFeeds.$inferSelect;
export type InsertIcalFeed = typeof icalFeeds.$inferInsert;

// ─── Guest Access Codes ───────────────────────────────────────────────────────

// portalType: 'guest' = guest portal only, 'tenant' = tenant portal only
export const guestAccessCodes = mysqlTable("guest_access_codes", {
  id: int("id").autoincrement().primaryKey(),
  reservationId: int("reservationId").notNull(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  validFrom: timestamp("validFrom").notNull(),
  validUntil: timestamp("validUntil").notNull(),
  lastUsedAt: timestamp("lastUsedAt"),
  useCount: int("useCount").default(0),
  isRevoked: boolean("isRevoked").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GuestAccessCode = typeof guestAccessCodes.$inferSelect;
export type InsertGuestAccessCode = typeof guestAccessCodes.$inferInsert;

// ─── Bypass Codes (permanent portal access codes) ──────────────────────────────

export const bypassCodes = mysqlTable("bypass_codes", {
  id: int("id").autoincrement().primaryKey(),
  propertyId: int("propertyId").notNull().default(1),
  code: varchar("code", { length: 10 }).notNull().unique(),
  label: varchar("label", { length: 128 }),
  portalType: mysqlEnum("portalType", ["guest", "cleaner", "inspector", "all"]).default("guest").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  lastUsedAt: timestamp("lastUsedAt"),
  useCount: int("useCount").default(0),
  expiresAt: timestamp("expiresAt"),          // null = never expires
  calendarEventId: int("calendarEventId"),    // linked iCal event
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BypassCode = typeof bypassCodes.$inferSelect;
export type InsertBypassCode = typeof bypassCodes.$inferInsert;

// ─── Guestbook Entries ────────────────────────────────────────────────────────

export const guestbookEntries = mysqlTable("guestbook_entries", {
  id: int("id").autoincrement().primaryKey(),
  propertyId: int("propertyId").notNull().default(1),
  guestName: varchar("guestName", { length: 128 }).notNull(),
  hometown: varchar("hometown", { length: 128 }),
  message: text("message").notNull(),
  isVisible: boolean("isVisible").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GuestbookEntry = typeof guestbookEntries.$inferSelect;
export type InsertGuestbookEntry = typeof guestbookEntries.$inferInsert;

// ─── Guest Feedback (private, host-only) ────────────────────────────────────────────────────────

export const guestFeedback = mysqlTable("guest_feedback", {
  id: int("id").autoincrement().primaryKey(),
  propertyId: int("propertyId").notNull().default(1),
  guestName: varchar("guestName", { length: 128 }),
  category: mysqlEnum("category", ["general", "issue", "suggestion", "compliment"]).default("general").notNull(),
  message: text("message").notNull(),
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GuestFeedback = typeof guestFeedback.$inferSelect;
export type InsertGuestFeedback = typeof guestFeedback.$inferInsert;

// ─── Guest Pages (editable content blocks) ────────────────────────────────────

export const guestPages = mysqlTable("guest_pages", {
  id: int("id").autoincrement().primaryKey(),
  propertyId: int("propertyId").notNull().default(1),
  slug: varchar("slug", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content"),
  icon: varchar("icon", { length: 64 }),
  sortOrder: int("sortOrder").default(0),
  isVisible: boolean("isVisible").default(true),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GuestPage = typeof guestPages.$inferSelect;
export type InsertGuestPage = typeof guestPages.$inferInsert;

// ─── Tasks (cleaner workflow) ─────────────────────────────────────────────────

export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  propertyId: int("propertyId").notNull().default(1),
  reservationId: int("reservationId"),
  assignedToId: int("assignedToId"),
  type: mysqlEnum("type", ["turnover", "maintenance", "inspection", "other"]).default("turnover").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  notes: text("notes"),
  dueDate: date("dueDate"),
  arrivalWindow: varchar("arrivalWindow", { length: 64 }),
  departureWindow: varchar("departureWindow", { length: 64 }),
  checklist: json("checklist").$type<{ item: string; done: boolean }[]>(),
  status: mysqlEnum("status", ["pending", "in_progress", "complete", "skipped"]).default("pending").notNull(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

// ─── Costs ────────────────────────────────────────────────────────────────────

export const costs = mysqlTable("costs", {
  id: int("id").autoincrement().primaryKey(),
  propertyId: int("propertyId").notNull().default(1),
  reservationId: int("reservationId"),
  category: mysqlEnum("category", ["cleaning", "supplies", "repairs", "property_manager_fee", "platform_fee", "utilities", "other"]).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  vendor: varchar("vendor", { length: 255 }),
  description: text("description"),
  costDate: date("costDate").notNull(),
  receiptUrl: text("receiptUrl"),
  createdById: int("createdById"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Cost = typeof costs.$inferSelect;
export type InsertCost = typeof costs.$inferInsert;

// ─── Reservation Financials ───────────────────────────────────────────────────

// One editable financial summary per reservation.  The booking amount remains on
// reservations; this table captures the actual revenue and platform fees used for
// month-end bookkeeping without changing reservation history.
export const reservationFinancials = mysqlTable("reservation_financials", {
  id: int("id").autoincrement().primaryKey(),
  propertyId: int("propertyId").notNull().default(1),
  reservationId: int("reservationId").notNull().unique(),
  grossRevenue: decimal("grossRevenue", { precision: 10, scale: 2 }).notNull().default("0"),
  platformFees: decimal("platformFees", { precision: 10, scale: 2 }).notNull().default("0"),
  cleaningFeeCollected: decimal("cleaningFeeCollected", { precision: 10, scale: 2 }).notNull().default("0"),
  netReceived: decimal("netReceived", { precision: 10, scale: 2 }),
  revenueReceivedAt: date("revenueReceivedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ReservationFinancial = typeof reservationFinancials.$inferSelect;
export type InsertReservationFinancial = typeof reservationFinancials.$inferInsert;

// ─── Platform Payouts & Reservation Reconciliation ───────────────────────────

// A platform payout is the actual bank transfer reported by Airbnb, Vrbo, or
// another channel. It deliberately remains separate from reservation financials:
// one transfer can cover several stays and a stay can be paid in installments.
export const platformPayouts = mysqlTable("platform_payouts", {
  id: int("id").autoincrement().primaryKey(),
  propertyId: int("propertyId").notNull().default(1),
  platform: mysqlEnum("platform", ["airbnb", "vrbo", "booking_com", "other"]).notNull(),
  payoutDate: date("payoutDate").notNull(),
  grossAmount: decimal("grossAmount", { precision: 10, scale: 2 }).notNull().default("0"),
  platformFees: decimal("platformFees", { precision: 10, scale: 2 }).notNull().default("0"),
  netAmount: decimal("netAmount", { precision: 10, scale: 2 }).notNull().default("0"),
  reference: varchar("reference", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PlatformPayout = typeof platformPayouts.$inferSelect;
export type InsertPlatformPayout = typeof platformPayouts.$inferInsert;

// Each allocation reconciles a portion of a platform transfer to one stay. The
// allocation amounts are snapshots, so future edits to reservation revenue do
// not change a previously recorded bank-payout reconciliation.
export const platformPayoutAllocations = mysqlTable("platform_payout_allocations", {
  id: int("id").autoincrement().primaryKey(),
  platformPayoutId: int("platformPayoutId").notNull(),
  reservationId: int("reservationId").notNull(),
  grossAmount: decimal("grossAmount", { precision: 10, scale: 2 }).notNull().default("0"),
  platformFees: decimal("platformFees", { precision: 10, scale: 2 }).notNull().default("0"),
  netAmount: decimal("netAmount", { precision: 10, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PlatformPayoutAllocation = typeof platformPayoutAllocations.$inferSelect;
export type InsertPlatformPayoutAllocation = typeof platformPayoutAllocations.$inferInsert;

// ─── Co-hosts & Payouts ───────────────────────────────────────────────────────

export const cohosts = mysqlTable("cohosts", {
  id: int("id").autoincrement().primaryKey(),
  propertyId: int("propertyId").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  ratePercent: decimal("ratePercent", { precision: 5, scale: 2 }).notNull().default("25.00"),
  payoutBasis: mysqlEnum("payoutBasis", ["gross_revenue", "after_platform_fees", "after_platform_fees_less_cleaning", "after_stay_expenses"]).default("after_platform_fees_less_cleaning").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Cohost = typeof cohosts.$inferSelect;
export type InsertCohost = typeof cohosts.$inferInsert;

// Rate history keeps a changed percentage from rewriting earlier months that
// have not yet been viewed or finalized in the financial workspace.
export const cohostRateHistory = mysqlTable("cohost_rate_history", {
  id: int("id").autoincrement().primaryKey(),
  propertyId: int("propertyId").notNull().default(1),
  cohostId: int("cohostId").notNull(),
  effectiveMonth: varchar("effectiveMonth", { length: 7 }).notNull(),
  ratePercent: decimal("ratePercent", { precision: 5, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CohostRateHistory = typeof cohostRateHistory.$inferSelect;
export type InsertCohostRateHistory = typeof cohostRateHistory.$inferInsert;

// A payout is a snapshot. Editing a co-host rate later cannot alter any value
// recorded here, including the rate, basis, included stays, or amount due.
export const payouts = mysqlTable("payouts", {
  id: int("id").autoincrement().primaryKey(),
  propertyId: int("propertyId").notNull().default(1),
  cohostId: int("cohostId").notNull(),
  payoutMonth: varchar("payoutMonth", { length: 7 }).notNull(),
  status: mysqlEnum("status", ["draft", "approved", "paid"]).default("draft").notNull(),
  ratePercentSnapshot: decimal("ratePercentSnapshot", { precision: 5, scale: 2 }).notNull(),
  payoutBasisSnapshot: mysqlEnum("payoutBasisSnapshot", ["gross_revenue", "after_platform_fees", "after_platform_fees_less_cleaning", "after_stay_expenses"]).notNull(),
  grossRevenueSnapshot: decimal("grossRevenueSnapshot", { precision: 10, scale: 2 }).notNull().default("0"),
  platformFeesSnapshot: decimal("platformFeesSnapshot", { precision: 10, scale: 2 }).notNull().default("0"),
  cleaningFeeCollectedSnapshot: decimal("cleaningFeeCollectedSnapshot", { precision: 10, scale: 2 }).notNull().default("0"),
  stayExpensesSnapshot: decimal("stayExpensesSnapshot", { precision: 10, scale: 2 }).notNull().default("0"),
  eligibleRevenueSnapshot: decimal("eligibleRevenueSnapshot", { precision: 10, scale: 2 }).notNull().default("0"),
  amountDueSnapshot: decimal("amountDueSnapshot", { precision: 10, scale: 2 }).notNull().default("0"),
  paidAt: timestamp("paidAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Payout = typeof payouts.$inferSelect;
export type InsertPayout = typeof payouts.$inferInsert;

export const payoutItems = mysqlTable("payout_items", {
  id: int("id").autoincrement().primaryKey(),
  payoutId: int("payoutId").notNull(),
  reservationId: int("reservationId").notNull(),
  grossRevenueSnapshot: decimal("grossRevenueSnapshot", { precision: 10, scale: 2 }).notNull().default("0"),
  platformFeesSnapshot: decimal("platformFeesSnapshot", { precision: 10, scale: 2 }).notNull().default("0"),
  cleaningFeeCollectedSnapshot: decimal("cleaningFeeCollectedSnapshot", { precision: 10, scale: 2 }).notNull().default("0"),
  stayExpensesSnapshot: decimal("stayExpensesSnapshot", { precision: 10, scale: 2 }).notNull().default("0"),
  eligibleRevenueSnapshot: decimal("eligibleRevenueSnapshot", { precision: 10, scale: 2 }).notNull().default("0"),
  amountDueSnapshot: decimal("amountDueSnapshot", { precision: 10, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PayoutItem = typeof payoutItems.$inferSelect;
export type InsertPayoutItem = typeof payoutItems.$inferInsert;

// ─── Cleaning Jobs ───────────────────────────────────────────────────────────

export const cleaningJobs = mysqlTable("cleaning_jobs", {
  id: int("id").autoincrement().primaryKey(),
  propertyId: int("propertyId").notNull().default(1),
  reservationId: int("reservationId"),
  checkoutDate: date("checkoutDate").notNull(),
  checkinDate: date("checkinDate"),
  status: mysqlEnum("status", ["pending", "accepted", "in_progress", "complete", "skipped"]).default("pending").notNull(),
  assignedToId: int("assignedToId"),
  checklistTemplateId: int("checklistTemplateId"),
  checklistProgress: json("checklistProgress").$type<boolean[]>(),
  notes: text("notes"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CleaningJob = typeof cleaningJobs.$inferSelect;
export type InsertCleaningJob = typeof cleaningJobs.$inferInsert;

// ─── Auth Users (email/password host login) ──────────────────────────────────

export const authUsers = mysqlTable("auth_users", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }),
  role: mysqlEnum("role", ["host", "property_manager", "cleaner", "accountant", "admin"]).default("host").notNull(),
  isActive: boolean("isActive").default(true),
  lastLoginAt: timestamp("lastLoginAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AuthUser = typeof authUsers.$inferSelect;
export type InsertAuthUser = typeof authUsers.$inferInsert;

// ─── Pricing Rules (seasonal/dynamic pricing) ────────────────────────────────

export const pricingRules = mysqlTable("pricing_rules", {
  id: int("id").autoincrement().primaryKey(),
  propertyId: int("propertyId").notNull().default(1),
  name: varchar("name", { length: 128 }).notNull(),
  startDate: date("startDate").notNull(),
  endDate: date("endDate").notNull(),
  nightlyRate: decimal("nightlyRate", { precision: 10, scale: 2 }).notNull(),
  minNights: int("minNights").default(1),
  priority: int("priority").default(0),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PricingRule = typeof pricingRules.$inferSelect;
export type InsertPricingRule = typeof pricingRules.$inferInsert;

// ─── Stripe Customers (card on file) ─────────────────────────────────────────

export const stripeCustomers = mysqlTable("stripe_customers", {
  id: int("id").autoincrement().primaryKey(),
  reservationId: int("reservationId").notNull(),
  guestEmail: varchar("guestEmail", { length: 320 }).notNull(),
  guestName: varchar("guestName", { length: 255 }),
  stripeCustomerId: varchar("stripeCustomerId", { length: 128 }).notNull(),
  stripePaymentMethodId: varchar("stripePaymentMethodId", { length: 128 }),
  stripeSetupIntentId: varchar("stripeSetupIntentId", { length: 128 }),
  cardBrand: varchar("cardBrand", { length: 32 }),
  cardLast4: varchar("cardLast4", { length: 4 }),
  cardExpMonth: int("cardExpMonth"),
  cardExpYear: int("cardExpYear"),
  termsAcceptedAt: timestamp("termsAcceptedAt"),
  damageChargeConsent: boolean("damageChargeConsent").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StripeCustomer = typeof stripeCustomers.$inferSelect;
export type InsertStripeCustomer = typeof stripeCustomers.$inferInsert;

// ─── Damage Charges ───────────────────────────────────────────────────────────

export const damageCharges = mysqlTable("damage_charges", {
  id: int("id").autoincrement().primaryKey(),
  reservationId: int("reservationId").notNull(),
  stripeCustomerId: int("stripeCustomerId").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  description: text("description").notNull(),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 128 }),
  status: mysqlEnum("status", ["pending", "charged", "failed", "refunded"]).default("pending").notNull(),
  chargedAt: timestamp("chargedAt"),
  chargedById: int("chargedById"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DamageCharge = typeof damageCharges.$inferSelect;
export type InsertDamageCharge = typeof damageCharges.$inferInsert;

// ─── Terms Pages (editable legal content) ────────────────────────────────────

export const termsPages = mysqlTable("terms_pages", {
  id: int("id").autoincrement().primaryKey(),
  propertyId: int("propertyId").notNull().default(1),
  slug: varchar("slug", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content"),
  isRequired: boolean("isRequired").default(true),
  sortOrder: int("sortOrder").default(0),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TermsPage = typeof termsPages.$inferSelect;
export type InsertTermsPage = typeof termsPages.$inferInsert;

// ─── OTA Links (configurable per property) ───────────────────────────────────

export const otaLinks = mysqlTable("ota_links", {
  id: int("id").autoincrement().primaryKey(),
  propertyId: int("propertyId").notNull().default(1),
  platform: mysqlEnum("platform", ["airbnb", "vrbo", "homeaway", "booking_com", "other"]).notNull(),
  label: varchar("label", { length: 128 }),
  url: text("url").notNull(),
  isActive: boolean("isActive").default(true),
  sortOrder: int("sortOrder").default(0),
});

export type OtaLink = typeof otaLinks.$inferSelect;
export type InsertOtaLink = typeof otaLinks.$inferInsert;

// ─── Booking Requests (public form submissions) ───────────────────────────────

export const bookingRequests = mysqlTable("booking_requests", {
  id: int("id").autoincrement().primaryKey(),
  propertyId: int("propertyId").notNull().default(1),
  guestName: varchar("guestName", { length: 255 }).notNull(),
  guestEmail: varchar("guestEmail", { length: 320 }).notNull(),
  guestPhone: varchar("guestPhone", { length: 32 }),
  arrivalDate: date("arrivalDate").notNull(),
  departureDate: date("departureDate").notNull(),
  guestCount: int("guestCount").default(1),
  message: text("message"),
  status: mysqlEnum("status", ["new", "reviewed", "converted", "declined"]).default("new").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BookingRequest = typeof bookingRequests.$inferSelect;
export type InsertBookingRequest = typeof bookingRequests.$inferInsert;

// ─── Daily Rates (per-date pricing seeded from competitor data) ───────────────

export const dailyRates = mysqlTable("daily_rates", {
  id: int("id").autoincrement().primaryKey(),
  propertyId: int("propertyId").notNull().default(1),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  competitorRate: decimal("competitorRate", { precision: 10, scale: 2 }), // comparable property rate
  multiplier: decimal("multiplier", { precision: 5, scale: 3 }).notNull().default("1.000"), // 1.0 = match, 1.15 = 15% premium
  overrideRate: decimal("overrideRate", { precision: 10, scale: 2 }), // manual override takes precedence
  cleaningFee: decimal("cleaningFee", { precision: 10, scale: 2 }).notNull().default("100.00"),
  minNights: int("minNights").default(1),
  airbnbLow: decimal("airbnbLow", { precision: 10, scale: 2 }),   // Airbnb low comp
  airbnbHigh: decimal("airbnbHigh", { precision: 10, scale: 2 }),  // Airbnb high comp
  comps: json("comps"),  // [{name: string, rate: number}] additional comps
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DailyRate = typeof dailyRates.$inferSelect;
export type InsertDailyRate = typeof dailyRates.$inferInsert;

// ─── Checklist Templates ──────────────────────────────────────────────────────

export type ChecklistItemWithIssue = {
  section: string;
  item: string;
  required: boolean;
  done?: boolean;
  issue?: {
    description: string;
    severity: 'minor' | 'attention' | 'urgent';
    reportedAt: string;
    reportedBy?: string;
  } | null;
};

export const checklistTemplates = mysqlTable("checklist_templates", {
  id: int("id").autoincrement().primaryKey(),
  propertyId: int("propertyId").notNull().default(1),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  taskType: mysqlEnum("taskType", ["turnover", "maintenance", "inspection", "other"]).default("turnover").notNull(),
  items: json("items").$type<ChecklistItemWithIssue[]>().notNull(),
  isDefault: boolean("isDefault").default(false),
  assignedToId: int("assignedToId"),
  autoAssignOn: varchar("autoAssignOn", { length: 20 }).default("manual"),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ChecklistTemplate = typeof checklistTemplates.$inferSelect;
export type InsertChecklistTemplate = typeof checklistTemplates.$inferInsert;
