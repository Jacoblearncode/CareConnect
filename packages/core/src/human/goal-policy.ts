import { matchAll, type NamedPattern } from "../safety/pattern-utils.js";

/**
 * schema.prisma's CoachGoal comment is explicit: "non-medical" isn't a
 * structural property of a string, so it's "enforced in application code."
 * This is that enforcement — and it is deliberately a narrow, honest one.
 *
 * This is NOT a claim that every non-medical goal passes and every medical
 * one is caught — free text defeats any fixed pattern list eventually, the
 * same limitation documented for the AI safety classifier in
 * packages/core/src/safety. It exists to catch the unambiguous cases (a
 * coach typing a dosage change or a diagnosis into what the product frames
 * as a lifestyle-goal field) at write time, with a clear error, rather than
 * silently accepting anything. §10 keeps clinical judgment with licensed
 * professionals; this function's job is narrower — stop the obviously
 * clinical case from landing in a field the coach dashboard (Phase 8)
 * presents as non-medical. It matches generic medication vocabulary
 * ("medication," "dose," "prescription"), not a drug-name dictionary — "stop
 * taking your medication" is flagged, "stop taking metformin" is not. That
 * gap is a known, accepted limitation of any fixed pattern list.
 */
const MEDICAL_GOAL_PATTERNS: NamedPattern[] = [
  { label: "dosage", pattern: /\b\d+\s*(mg|mcg|ml|iu)\b/i },
  {
    label: "medication-change",
    pattern:
      /\b(start|stop|switch|increase|decrease|taper)\w*\b(?:\s+\w+){0,4}?\s+(medication|medicine|meds?|dose|dosage|prescription)\b/i,
  },
  { label: "diagnosis", pattern: /\bdiagnos(e|is|ed|ing)\b/i },
  { label: "prescription", pattern: /\bprescri(be|bed|bing|ption)\b/i },
  { label: "treatment-plan", pattern: /\b(treatment|therapy)\s+plan\b/i },
];

export interface GoalContentCheck {
  likelyMedical: boolean;
  matchedPatterns: string[];
}

export function checkGoalContent(title: string, description?: string | null): GoalContentCheck {
  const normalized = `${title} ${description ?? ""}`.toLowerCase();
  const matchedPatterns = matchAll(normalized, MEDICAL_GOAL_PATTERNS);
  return { likelyMedical: matchedPatterns.length > 0, matchedPatterns };
}
