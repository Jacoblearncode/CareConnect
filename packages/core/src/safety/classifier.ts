/**
 * Input classification — the first stage of the §18 pipeline, and per
 * docs/AI_PROVIDERS.md the load-bearing one: free-tier open-weight models
 * follow "never diagnose" system-prompt instructions unreliably, so the §15
 * prohibitions have to be enforced as deterministic code the model never
 * gets a chance to violate, not as a request to behave.
 *
 * Pattern-based, not ML-based — there's no classifier model in this stack,
 * and a transparent, testable rule list is more auditable for a safety
 * feature than an opaque one would be anyway. Ordered by priority: CRISIS
 * always wins, even over what would otherwise read as a dosage question
 * ("I want to stop my meds, I don't want to be here anymore" is a crisis
 * message, not a medication question).
 */

import { matchAll, type NamedPattern } from "./pattern-utils.js";

export type SafetyCategory = "CRISIS" | "DOSAGE_CHANGE" | "DIAGNOSIS_SEEKING" | "GENERAL";

export interface ClassificationResult {
  category: SafetyCategory;
  /** Which named patterns matched — stored in AiMessage.safetyFlags for audit (§14). */
  matchedPatterns: string[];
}

// Self-harm / suicide ideation. Deliberately a wide net: a false positive
// here costs an unnecessary but harmless escalation message; a false
// negative costs a user in crisis getting a chat reply instead. Not
// symmetric, so the net is cast wide on purpose.
const CRISIS_PATTERNS: NamedPattern[] = [
  { label: "suicidal-ideation", pattern: /\bsuicidal?\b/ },
  { label: "kill-myself", pattern: /\bkill(ing)?\s+(myself|my\s*self)\b/ },
  { label: "end-my-life", pattern: /\bend(ing)?\s+(my\s+life|it\s+all)\b/ },
  { label: "want-to-die", pattern: /\b(want|wish)\s+(to\s+)?(i\s+)?(was|were)?\s*(die|dead|be\s+dead)\b/ },
  { label: "dont-want-to-live", pattern: /\b(don'?t|do\s+not)\s+want\s+to\s+(be\s+alive|live)\b/ },
  { label: "no-reason-to-live", pattern: /\bno\s+(reason|point)\s+(to|in)\s+liv(e|ing)\b/ },
  { label: "self-harm", pattern: /\b(hurt(ing)?|harm(ing)?)\s+(myself|my\s*self)\b/ },
  { label: "self-harm-noun", pattern: /\bself[\s-]?harm\b/ },
  { label: "better-off-dead", pattern: /\bbetter\s+off\s+(dead|without\s+me)\b/ },
  { label: "cant-go-on", pattern: /\b(can'?t|cannot)\s+go\s+on\b/ },
  { label: "ending-it", pattern: /\bending\s+it\s+all\b/ },
];

// Any request for the AI to change, stop, skip, or adjust a medication
// regimen. §15: "never change medication dosage," "never tell users to stop
// prescribed medication." These bypass the model entirely (see companion.ts)
// rather than relying on the model declining correctly.
const DOSAGE_CHANGE_PATTERNS: NamedPattern[] = [
  // Non-greedy filler-word gap so "stop taking my blood pressure medication"
  // matches, not just the adjacent "stop my medication" phrasing.
  { label: "stop-taking", pattern: /\b(stop|quit)\b(?:\s+\w+){0,4}?\s+(medication|medicine|meds?|pills?|dose)\b/ },
  { label: "should-i-stop", pattern: /\bshould\s+i\s+(stop|quit)\b/ },
  { label: "ok-to-stop", pattern: /\b(ok(ay)?|okay|fine|safe)\s+(to|if\s+i)\s+stop\b/ },
  { label: "double-dose", pattern: /\bdouble\s+(my\s+|the\s+)?dos(e|age)\b/ },
  { label: "increase-dose", pattern: /\b(increase|raise|up)\s+(my\s+|the\s+)?dos(e|age)\b/ },
  { label: "decrease-dose", pattern: /\b(lower|reduce|decrease|cut)\s+(my\s+|the\s+)?dos(e|age)\b/ },
  { label: "change-dosage", pattern: /\bchange\s+(my\s+)?dos(e|age)\b/ },
  { label: "skip-dose", pattern: /\bskip\s+(my\s+|a\s+|today'?s\s+)?(medication|medicine|dose|pills?)\b/ },
  { label: "can-i-take-more", pattern: /\bcan\s+i\s+take\s+(more|extra|another)\b/ },
];

// Requests for the AI to diagnose, or that assume a diagnosis is what's
// being asked for. Unlike the two categories above, these still reach the
// model (a general wellness question shouldn't be blocked outright) but the
// system prompt and output validator both treat them as elevated risk.
const DIAGNOSIS_SEEKING_PATTERNS: NamedPattern[] = [
  { label: "do-i-have", pattern: /\bdo\s+i\s+have\b/ },
  { label: "am-i-diagnosis", pattern: /\bam\s+i\s+(depressed|anxious|diabetic|dying|sick)\b/ },
  { label: "is-this-disease", pattern: /\bis\s+this\s+(cancer|diabetes|a\s+heart\s+attack|serious)\b/ },
  { label: "diagnose-me", pattern: /\bdiagnos(e|is)\s*(me)?\b/ },
  { label: "what-disease", pattern: /\bwhat\s+(disease|condition|illness)\b/ },
  { label: "whats-wrong-with-me", pattern: /\bwhat'?s\s+wrong\s+with\s+me\b/ },
  { label: "do-you-think-i-have", pattern: /\bdo\s+you\s+think\s+i\s+have\b/ },
];

export function classifyInput(text: string): ClassificationResult {
  const normalized = text.toLowerCase();

  const crisis = matchAll(normalized, CRISIS_PATTERNS);
  if (crisis.length > 0) {
    return { category: "CRISIS", matchedPatterns: crisis };
  }

  const dosage = matchAll(normalized, DOSAGE_CHANGE_PATTERNS);
  if (dosage.length > 0) {
    return { category: "DOSAGE_CHANGE", matchedPatterns: dosage };
  }

  const diagnosis = matchAll(normalized, DIAGNOSIS_SEEKING_PATTERNS);
  if (diagnosis.length > 0) {
    return { category: "DIAGNOSIS_SEEKING", matchedPatterns: diagnosis };
  }

  return { category: "GENERAL", matchedPatterns: [] };
}
