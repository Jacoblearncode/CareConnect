import type { Context } from "hono";
import type { AppEnv } from "../app-env.js";

/**
 * `?userId=` lets a buddy/coach view someone else's data; defaults to self.
 * Every call site must follow this with an assertCanView/canViewCategory
 * check — resolving the owner is not itself an authorization decision.
 */
export function resolveOwnerId(c: Context<AppEnv>): string {
  return c.req.query("userId") ?? (c.var.userId as string);
}
