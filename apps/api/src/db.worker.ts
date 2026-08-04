import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

/**
 * Cloudflare Workers entry point: Workers cannot open a raw TCP socket, so
 * this speaks to Neon over HTTP/WebSocket instead of node-postgres
 * (Build Plan §1.1). A fresh client per request is the pattern Neon's
 * serverless driver is designed for — connections are cheap HTTP calls, not
 * long-lived sockets — so this isn't the anti-pattern it would be with `pg`.
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaNeon({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}
