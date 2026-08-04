import type { ErrorHandler } from "hono";
import { AppError } from "../errors.js";

/**
 * Never forwards an underlying error's message or stack to the client
 * (§14: no private information in debug messages) — only AppError's
 * deliberately-written, user-facing message reaches the response. Anything
 * else is logged server-side and replaced with a generic message.
 */
export const errorMiddleware: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.statusCode as 400);
  }
  console.error(err);
  return c.json({ error: { code: "internal_error", message: "Something went wrong." } }, 500);
};
