import { doses as coreDoses } from "@careconnect/core";
import type { PrismaClient } from "@prisma/client";
import { closeExpiredDoses } from "../doses/sweep.js";

export interface CompanionContext {
  mood: number | undefined;
  weekAdherenceRatePercent: number | null;
  activeMedicationNames: string[];
}

/**
 * Read-only context gathered server-side, before the model is ever called —
 * the "context retrieval" stage of the §18 pipeline. The companion has no
 * tool-calling surface at all (see companion.ts's header note), so this is
 * the *only* way context reaches the model: it can only ever be the
 * authenticated user's own data, looked up by their own ID, never something
 * the model requests.
 */
export async function buildCompanionContext(db: PrismaClient, userId: string): Promise<CompanionContext> {
  await closeExpiredDoses(db);

  const startOfWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [latestCheckIn, medications, weekDoses] = await Promise.all([
    db.checkIn.findFirst({ where: { userId }, orderBy: { date: "desc" } }),
    db.medication.findMany({ where: { userId, isActive: true }, select: { name: true } }),
    db.doseInstance.findMany({
      where: { medication: { userId }, scheduledAt: { gte: startOfWeek } },
      select: { status: true },
    }),
  ]);

  const adherence = coreDoses.summarizeAdherence(weekDoses);

  return {
    mood: latestCheckIn?.mood ?? undefined,
    weekAdherenceRatePercent: adherence.ratePercent,
    activeMedicationNames: medications.map((m) => m.name),
  };
}
