import { doses } from "@careconnect/core";
import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * How far ahead DoseInstance rows are materialized when a medication (or its
 * schedule) is created. A background job to keep topping this horizon up
 * would pair naturally with real reminder delivery once apps/mobile exists;
 * out of scope while there's no client to deliver a reminder to.
 */
const GENERATION_HORIZON_DAYS = 30;

export async function generateDoseInstancesFor(
  db: PrismaClient | Prisma.TransactionClient,
  medicationId: string,
  rule: doses.ScheduleRuleInput,
  medicationStartDate: Date,
  medicationEndDate: Date | null,
): Promise<void> {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const horizonEnd = new Date(now.getTime() + GENERATION_HORIZON_DAYS * 24 * 60 * 60 * 1000);

  // Never backfill doses before today: a medication started in the past has
  // no real record of what happened on those earlier days, and generating
  // fake MISSED history would misrepresent adherence rather than measure it.
  const rangeStart = medicationStartDate > startOfToday ? medicationStartDate : startOfToday;
  const rangeEnd = medicationEndDate && medicationEndDate < horizonEnd ? medicationEndDate : horizonEnd;

  const times = doses.generateDoseTimes(rule, rangeStart, rangeEnd);
  if (times.length === 0) {
    return;
  }

  await db.doseInstance.createMany({
    data: times.map((t) => ({
      medicationId,
      scheduledAt: t.scheduledAt,
      windowEndsAt: t.windowEndsAt,
      status: "PENDING" as const,
    })),
  });
}
