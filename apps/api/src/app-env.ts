import type { PrismaClient } from "@prisma/client";
import type { AppConfig } from "./env.js";

export interface AppEnv {
  Variables: {
    db: PrismaClient;
    config: AppConfig;
    userId?: string;
  };
}
