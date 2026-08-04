import { matchAll, type NamedPattern } from "./pattern-utils.js";

/**
 * Output validation — the last stage of the §18 pipeline, and the safety
 * net for when a free-tier model doesn't follow the system prompt (see
 * classifier.ts's header note; docs/AI_PROVIDERS.md spells out why this
 * can't be prompt-only). Scoped deliberately narrow: rather than trying to
 * catch every possible unsafe sentence with a disease-word dictionary this
 * project doesn't have, it targets the two failure modes §15 names
 * explicitly — false-confidence diagnostic language ("You definitely have X
 * disease" is §15's own example) and dosage instructions — which is where a
 * model is most likely to overstep, and where a firm rewrite is easy to
 * justify to a user rather than looking like an arbitrary block.
 *
 * A match replaces the *entire* response rather than surgically removing a
 * sentence: a paragraph with one clause deleted can still read as
 * confidently wrong, and this is the last checkpoint before the user sees
 * it, so simplicity wins over preserving as much of the model's text as
 * possible.
 */

export interface ValidationResult {
  safe: boolean;
  sanitized: string;
  /** Which named patterns matched — stored in AiMessage.safetyFlags for audit (§14). */
  violations: string[];
}

const DEFINITIVE_DIAGNOSIS_PATTERNS: NamedPattern[] = [
  { label: "definitely-have", pattern: /\byou\s+(definitely|certainly|clearly)\s+have\b/ },
  { label: "no-doubt-you-have", pattern: /\bno\s+doubt\s+you\s+have\b/ },
  { label: "diagnosed-with", pattern: /\byou(?:'re|\s+are)\s+diagnosed\s+with\b/ },
  { label: "i-diagnose-you", pattern: /\bi\s+diagnose\s+you\b/ },
  { label: "you-have-disease", pattern: /\byou\s+have\s+([\w']+\s+){0,2}(disease|syndrome|disorder)\b/ },
  { label: "you-have-cancer", pattern: /\byou\s+have\s+cancer\b/ },
  { label: "this-is-definitely", pattern: /\bthis\s+is\s+definitely\s+\w+/ },
];

const DOSAGE_INSTRUCTION_PATTERNS: NamedPattern[] = [
  { label: "take-x-mg", pattern: /\btake\s+\d+\s*(mg|milligrams?|mcg|ml)\b/ },
  { label: "increase-your-dose", pattern: /\b(increase|raise)\s+your\s+dos(e|age)\b/ },
  { label: "decrease-your-dose", pattern: /\b(decrease|lower|reduce)\s+your\s+dos(e|age)\b/ },
  { label: "double-your-dose", pattern: /\bdouble\s+your\s+dos(e|age)\b/ },
  { label: "you-should-stop-taking", pattern: /\byou\s+should\s+stop\s+taking\b/ },
  {
    label: "stop-your-medication",
    pattern: /\bstop(ping)?\s+(your|taking\s+your)\s+(medication|medicine|meds?)\b/,
  },
];

const SAFE_REPLACEMENT =
  "I want to be careful here — I can't make a medical diagnosis or give dosage instructions. " +
  "Because you've shared this, it would be reasonable to speak with a healthcare professional about it.";

export function validateOutput(text: string): ValidationResult {
  const normalized = text.toLowerCase();
  const violations = [
    ...matchAll(normalized, DEFINITIVE_DIAGNOSIS_PATTERNS),
    ...matchAll(normalized, DOSAGE_INSTRUCTION_PATTERNS),
  ];

  if (violations.length > 0) {
    return { safe: false, sanitized: SAFE_REPLACEMENT, violations };
  }
  return { safe: true, sanitized: text, violations: [] };
}
