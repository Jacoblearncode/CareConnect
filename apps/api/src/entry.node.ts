import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createPrismaClient } from "./db.node.js";
import { loadConfig } from "./env.js";

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const config = loadConfig(process.env);
const db = createPrismaClient(databaseUrl);
const app = createApp({ db, config });

const port = Number(process.env["PORT"] ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`CareConnect API listening on http://localhost:${info.port}`);
});
