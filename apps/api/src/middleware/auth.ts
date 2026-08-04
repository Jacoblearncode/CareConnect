import { auth as coreAuth } from "@careconnect/core";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../app-env.js";
import { Errors } from "../errors.js";

/** Verifies the access token and sets `userId` on context; throws 401 otherwise. */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    throw Errors.unauthorized();
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = await coreAuth.verifyJwt(token, c.var.config.jwtAccessSecret);
    c.set("userId", payload.sub);
  } catch {
    throw Errors.unauthorized();
  }
  await next();
};
