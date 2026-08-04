import type { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import type { AppEnv } from "./app-env.js";
import type { AppConfig } from "./env.js";
import { errorMiddleware } from "./middleware/error.js";
import { registerAuthRoutes } from "./routes/auth.js";
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

  app.use("*", async (c, next) => {
    c.set("db", deps.db);
    c.set("config", deps.config);
    await next();
  });

  app.onError(errorMiddleware);

  app.get("/health", (c) => c.json({ status: "ok" }));

  registerAuthRoutes(app);
  registerCompanionRoutes(app);
  registerMedicationRoutes(app);
  registerPermissionRoutes(app);
  registerPrivacyRoutes(app);
  registerWellnessRoutes(app);

  return app;
}
