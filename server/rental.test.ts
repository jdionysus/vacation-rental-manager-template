import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the db module
vi.mock("./db", () => ({
  getAccessCodeByCode: vi.fn(),
  updateAccessCode: vi.fn(),
  getReservationById: vi.fn(),
  createBookingRequest: vi.fn(),
  getBookingRequests: vi.fn(),
  getCalendarEvents: vi.fn(),
  getReservations: vi.fn(),
  getProperty: vi.fn(),
  getGuestPages: vi.fn(),
  getGuestPageBySlug: vi.fn(),
}));

vi.mock("./db-extra", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db-extra")>();
  return {
    ...actual,
    getCleaningJobs: vi.fn(),
  };
});

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

import {
  getAccessCodeByCode,
  updateAccessCode,
  getReservationById,
  createBookingRequest,
  getCalendarEvents,
  getReservations,
  getProperty,
  getGuestPages,
} from "./db";
import { getCleaningJobs } from "./db-extra";

function makePublicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeHostCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "host-1",
      email: "host@example.com",
      name: "Host User",
      loginMethod: "manus",
      role: "host",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("guest.verifyCode", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns valid=false for unknown code", async () => {
    vi.mocked(getAccessCodeByCode).mockResolvedValue(null);
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.guest.verifyCode({ code: "BADCODE" });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Invalid code");
  });

  it("returns valid=false for revoked code", async () => {
    vi.mocked(getAccessCodeByCode).mockResolvedValue({
      id: 1, reservationId: 1, code: "REVOKED1",
      validFrom: new Date(Date.now() - 86400000),
      validUntil: new Date(Date.now() + 86400000),
      isRevoked: true, useCount: 0, lastUsedAt: null, createdAt: new Date(),
    });
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.guest.verifyCode({ code: "REVOKED1" });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Code has been revoked");
  });

  it("returns valid=false for expired code", async () => {
    vi.mocked(getAccessCodeByCode).mockResolvedValue({
      id: 2, reservationId: 1, code: "EXPIRED1",
      validFrom: new Date(Date.now() - 172800000),
      validUntil: new Date(Date.now() - 86400000),
      isRevoked: false, useCount: 0, lastUsedAt: null, createdAt: new Date(),
    });
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.guest.verifyCode({ code: "EXPIRED1" });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Code has expired");
  });

  it("returns valid=true for a valid active code", async () => {
    vi.mocked(getAccessCodeByCode).mockResolvedValue({
      id: 3, reservationId: 5, code: "VALID123",
      validFrom: new Date(Date.now() - 86400000),
      validUntil: new Date(Date.now() + 86400000),
      isRevoked: false, useCount: 0, lastUsedAt: null, createdAt: new Date(),
    });
    vi.mocked(updateAccessCode).mockResolvedValue(undefined);
    vi.mocked(getReservationById).mockResolvedValue({
      id: 5, propertyId: 1, source: "direct", status: "confirmed",
      guestName: "Jane Doe", guestEmail: "jane@example.com", guestPhone: null,
      guestCount: 2, arrivalDate: "2026-06-01" as unknown as Date,
      departureDate: "2026-06-05" as unknown as Date,
      nightlyRate: null, cleaningFee: null, totalAmount: null,
      paymentStatus: "unpaid", notes: null, externalId: null,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.guest.verifyCode({ code: "VALID123" });
    expect(result.valid).toBe(true);
    expect(result.guestName).toBe("Jane Doe");
  });
});

describe("bookingRequests.submit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a booking request and returns success", async () => {
    vi.mocked(createBookingRequest).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.bookingRequests.submit({
      guestName: "John Smith",
      guestEmail: "john@example.com",
      arrivalDate: "2026-07-10",
      departureDate: "2026-07-14",
      guestCount: 2,
    });
    expect(result.success).toBe(true);
    expect(createBookingRequest).toHaveBeenCalledOnce();
  });

  it("rejects invalid email", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(
      caller.bookingRequests.submit({
        guestName: "Bad User",
        guestEmail: "not-an-email",
        arrivalDate: "2026-07-10",
        departureDate: "2026-07-14",
      })
    ).rejects.toThrow();
  });
});

describe("calendar.events", () => {
  it("returns events for public access", async () => {
    vi.mocked(getCalendarEvents).mockResolvedValue([]);
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.calendar.events();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("cleans.operationalCalendar", () => {
  it("returns a privacy-safe operational schedule for a cleaner portal visitor", async () => {
    vi.mocked(getReservations).mockResolvedValue([]);
    vi.mocked(getCalendarEvents).mockResolvedValue([]);
    vi.mocked(getCleaningJobs).mockResolvedValue([]);

    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.cleans.operationalCalendar();

    expect(result).toEqual([]);
  });
});

describe("property.get", () => {
  it("returns property for public access", async () => {
    vi.mocked(getProperty).mockResolvedValue({
      id: 1, name: "The Hideaway", tagline: "Test", description: null,
      address: null, city: null, maxGuests: 2, bedrooms: 1, bathrooms: 1,
      checkInTime: "15:00", checkOutTime: "11:00", cleaningFee: "75.00",
      nightlyRate: "150.00", amenities: [], houseRules: null, photos: [],
      timezone: "America/Denver", createdAt: new Date(), updatedAt: new Date(),
    });
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.property.get();
    expect(result?.name).toBe("The Hideaway");
  });
});
