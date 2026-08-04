import type { PrismaClient } from "@prisma/client";

/**
 * Closes out dose instances whose window has passed without a final
 * outcome, so MISSED is a real persisted status (Build Plan §3.2), not
 * something computed only at read time. PENDING and SNOOZED both expire to
 * MISSED — a snooze delays the reminder within the window, but once the
 * window truly closes without TAKEN/SKIPPED, it's missed regardless of
 * whether it was snoozed along the way.
 *
 * Called at the top of every route that reads doses or adherence, rather
 * than run on a schedule — this prototype has no background worker, and a
 * lazy sweep-on-read gets the same correctness with no extra infrastructure.
 */
export async function closeExpiredDoses(db: PrismaClient, now = new Date()): Promise<number> {
  const result = await db.doseInstance.updateMany({
    where: { status: { in: ["PENDING", "SNOOZED"] }, windowEndsAt: { lt: now } },
    data: { status: "MISSED", recordedAt: now },
  });
  return result.count;
}
