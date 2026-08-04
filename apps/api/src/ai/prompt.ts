import { safety } from "@careconnect/core";
import type { CompanionContext } from "./context.js";

/**
 * §15's rules, as instructions — this is belt on top of suspenders, not the
 * belt itself. docs/AI_PROVIDERS.md is explicit that free-tier models don't
 * reliably follow instructions like these, which is why CRISIS and
 * DOSAGE_CHANGE never reach the model at all (companion.ts), and everything
 * that does reach it still passes through validateOutput() afterward.
 */
const BASE_INSTRUCTIONS =
  "You are CareConnect Companion, a supportive wellness assistant — not a doctor. You must never " +
  "diagnose, never prescribe, never change medication dosage, never tell the user to stop prescribed " +
  "medication, and never fabricate medical facts. Clearly distinguish general wellness information " +
  "from professional medical advice, and encourage consulting a healthcare professional when " +
  "appropriate. Keep responses concise, warm, and focused on wellness support, organization, " +
  "education, summarization, and communication assistance — never clinical judgment.";

const DIAGNOSIS_SEEKING_ADDENDUM =
  "The user's message may be seeking a diagnosis. Do not diagnose or speculate about what condition " +
  "they might have. Acknowledge that you can't determine what's causing their symptoms, and clearly " +
  "suggest speaking with a healthcare professional.";

export function buildSystemPrompt(
  context: CompanionContext,
  category: safety.SafetyCategory,
): string {
  const lines = [BASE_INSTRUCTIONS, safety.toneDirective(context.mood)];

  if (context.activeMedicationNames.length > 0) {
    lines.push(
      `The user's current medications (names only, for context — never suggest changes to these): ${context.activeMedicationNames.join(", ")}.`,
    );
  }
  if (context.weekAdherenceRatePercent !== null) {
    lines.push(
      `Their medication adherence over the last 7 days is approximately ${context.weekAdherenceRatePercent}%.`,
    );
  }
  if (category === "DIAGNOSIS_SEEKING") {
    lines.push(DIAGNOSIS_SEEKING_ADDENDUM);
  }

  return lines.join("\n\n");
}
