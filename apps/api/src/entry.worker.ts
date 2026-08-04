import { createApp } from "./app.js";
import { createPrismaClient } from "./db.worker.js";
import { loadConfig } from "./env.js";

interface WorkerEnv {
  DATABASE_URL: string;
  JWT_ACCESS_SECRET: string;
  ACCESS_TOKEN_TTL_SECONDS?: string;
  REFRESH_TOKEN_TTL_SECONDS?: string;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const config = loadConfig(env as unknown as Record<string, string | undefined>);
    const db = createPrismaClient(env.DATABASE_URL);
    const app = createApp({ db, config });
    return app.fetch(request);
  },
};
