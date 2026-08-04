import type { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./app-env.js";
import type { AppConfig } from "./env.js";
import { errorMiddleware } from "./middleware/error.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerBuddyRoutes } from "./routes/buddies.js";
import { registerCoachRoutes } from "./routes/coach.js";
import { registerCompanionRoutes } from "./routes/companion.js";
import { registerMedicationRoutes } from "./routes/medications.js";
import { registerPermissionRoutes } from "./routes/permissions.js";
import { registerPrivacyRoutes } from "./routes/privacy.js";
import { registerWellnessRoutes } from "./routes/wellness.js";

export interface AppDeps {
  db: PrismaClient;
  config: AppConfig;
}

/**
 * Runtime-agnostic Hono app (Build Plan §1.1): takes its database client and
 * config as arguments instead of constructing them, so this file is shared
 * unmodified by both entry.node.ts and entry.worker.ts.
 */
export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.use(
    "*",
    cors({
      origin: deps.config.corsOrigins.includes("*") ? "*" : deps.config.corsOrigins,
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  );

  app.use("*", async (c, next) => {
    c.set("db", deps.db);
    c.set("config", deps.config);
    await next();
  });

  app.onError(errorMiddleware);

  app.get("/health", (c) => c.json({ status: "ok" }));

  registerAuthRoutes(app);
  registerBuddyRoutes(app);
  registerCoachRoutes(app);
  registerCompanionRoutes(app);
  registerMedicationRoutes(app);
  registerPermissionRoutes(app);
  registerPrivacyRoutes(app);
  registerWellnessRoutes(app);

  return app;
}
