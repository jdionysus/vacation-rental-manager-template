import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  // This app uses local email/password auth via auth-local.ts
  // The localUser is resolved inside each procedure via the localAuthProcedure middleware
  // We keep user: null here since Manus OAuth is not used
  return {
    req: opts.req,
    res: opts.res,
    user: null,
  };
}
