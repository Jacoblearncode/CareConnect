import type { DoseStatus } from "./types.js";

/**
 * Adherence math (§5), computed from real DoseInstance rows (Build Plan
 * §3.2), not inferred. Pure: the caller queries the rows for whatever range
 * ("today" / "this week" / "this month") and passes them in.
 */

export interface DoseStatusInput {
  status: DoseStatus;
}

export interface AdherenceSummary {
  taken: number;
  skipped: number;
  missed: number;
  unknown: number;
  pending: number;
  snoozed: number;
  /**
   * taken / (taken + skipped + missed), as a percentage rounded to one
   * decimal place. UNKNOWN is excluded from both sides — it means "can't be
   * determined," not "non-adherent." PENDING/SNOOZED-not-yet-due are
   * excluded because they aren't resolved yet. null when nothing in range
   * has come due (denominator would be 0), e.g. checking "today" before any
   * scheduled time has passed.
   */
  ratePercent: number | null;
}

export function summarizeAdherence(doses: DoseStatusInput[]): AdherenceSummary {
  const counts = { taken: 0, skipped: 0, missed: 0, unknown: 0, pending: 0, snoozed: 0 };
  for (const dose of doses) {
    switch (dose.status) {
      case "TAKEN":
        counts.taken++;
        break;
      case "SKIPPED":
        counts.skipped++;
        break;
      case "MISSED":
        counts.missed++;
        break;
      case "UNKNOWN":
        counts.unknown++;
        break;
      case "PENDING":
        counts.pending++;
        break;
      case "SNOOZED":
        counts.snoozed++;
        break;
    }
  }

  const resolved = counts.taken + counts.skipped + counts.missed;
  const ratePercent = resolved === 0 ? null : Math.round((counts.taken / resolved) * 1000) / 10;

  return { ...counts, ratePercent };
}
