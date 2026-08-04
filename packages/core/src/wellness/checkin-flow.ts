/**
 * The daily check-in's adaptive branching (§7: "Follow with only relevant
 * questions rather than forcing users through a long questionnaire").
 *
 * The spec gives one worked example — mood is always first, via the 5-emoji
 * scale — and otherwise leaves the exact branching rule as a product
 * decision. This implements one deliberate, defensible rule set, not the
 * only possible one:
 *
 *   1. `mood` is always asked first.
 *   2. A LOW mood (1-2 on the 1-5 scale) branches toward understanding why:
 *      stress and pain next, then energy, then close. Sleep quality,
 *      medication adherence, and physical activity are skipped — a bad day
 *      shouldn't be met with a long form.
 *   3. A neutral-or-better mood (3-5) branches toward the routine-tracking
 *      questions instead: energy, sleep quality, medication adherence (only
 *      if the user actually has an active medication — otherwise the
 *      question is meaningless) and physical activity. Stress/pain are
 *      skipped on an ordinary day; they're still loggable as standalone
 *      health metrics (§6) if relevant, just not part of every check-in.
 *   4. `generalWellbeing` always closes the flow.
 *
 * `nextCheckInQuestion` is pure and stateless: given what's been answered so
 * far and static context about the user, it returns the single next field to
 * ask, or null once the flow is complete. The API layer calls this once per
 * answer submitted, which is what makes the flow feel like a conversation
 * rather than a form.
 */

export const CHECKIN_FIELDS = [
  "mood",
  "energy",
  "sleepQuality",
  "stress",
  "pain",
  "medicationAdherence",
  "physicalActivity",
  "generalWellbeing",
] as const;
export type CheckInField = (typeof CHECKIN_FIELDS)[number];

// `| undefined` explicitly, not just optional keys: callers (e.g. mapping a
// Prisma row's nullable columns) build this by assigning `field ?? undefined`
// for every key, which exactOptionalPropertyTypes treats differently from an
// absent key.
export type CheckInAnswers = Partial<Record<CheckInField, number | undefined>>;

export interface CheckInContext {
  /** Whether medicationAdherence is a meaningful question to ask at all. */
  hasActiveMedications: boolean;
}

const LOW_MOOD_THRESHOLD = 2;

export function nextCheckInQuestion(
  answers: CheckInAnswers,
  context: CheckInContext,
): CheckInField | null {
  if (answers.mood === undefined) {
    return "mood";
  }

  const moodIsLow = answers.mood <= LOW_MOOD_THRESHOLD;

  if (moodIsLow) {
    if (answers.stress === undefined) return "stress";
    if (answers.pain === undefined) return "pain";
    if (answers.energy === undefined) return "energy";
  } else {
    if (answers.energy === undefined) return "energy";
    if (answers.sleepQuality === undefined) return "sleepQuality";
    if (context.hasActiveMedications && answers.medicationAdherence === undefined) {
      return "medicationAdherence";
    }
    if (answers.physicalActivity === undefined) return "physicalActivity";
  }

  if (answers.generalWellbeing === undefined) return "generalWellbeing";
  return null;
}
