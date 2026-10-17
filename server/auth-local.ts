import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { authUsers } from "../drizzle/schema";
import { ENV } from "./_core/env";

const JWT_SECRET = new TextEncoder().encode(ENV.cookieSecret || "fallback-secret-change-in-production");
const COOKIE_NAME = "vrm_host_session";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(userId: number, role: string): Promise<string> {
  return new SignJWT({ userId, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(JWT_SECRET);
}

export async function verifySessionToken(token: string): Promise<{ userId: number; role: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return { userId: payload.userId as number, role: payload.role as string };
  } catch {
    return null;
  }
}

export async function getAuthUserById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(authUsers).where(eq(authUsers.id, id)).limit(1);
  return result[0] ?? null;
}

export async function getAuthUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(authUsers).where(eq(authUsers.email, email)).limit(1);
  return result[0] ?? null;
}

export async function loginUser(email: string, password: string) {
  const user = await getAuthUserByEmail(email.toLowerCase().trim());
  if (!user || !user.isActive) return null;
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;
  const db = await getDb();
  if (db) await db.update(authUsers).set({ lastLoginAt: new Date() }).where(eq(authUsers.id, user.id));
  return user;
}

export { COOKIE_NAME };
