import { ai as coreAi, safety } from "@careconnect/core";
import type { PrismaClient } from "@prisma/client";
import type { AppConfig } from "../env.js";
import { buildCompanionContext } from "./context.js";
import { buildSystemPrompt } from "./prompt.js";
import { createGroqProvider, createWorkersAiProvider } from "./providers.js";

/**
 * The full §18 pipeline:
 *
 *   User input -> safety checks -> context retrieval -> AI response -> safety validation -> User
 *
 * Two categories never reach a model at all: CRISIS and DOSAGE_CHANGE always
 * resolve to a fixed, pre-reviewed response (docs/AI_PROVIDERS.md's
 * consequence of using free-tier models — these are the two failure modes
 * §15 treats as non-negotiable, so they aren't left to a model's judgment
 * even with an output validator as backup). GENERAL and DIAGNOSIS_SEEKING
 * reach the model, informed by read-only context, and the response is
 * always passed through validateOutput() before the user sees it.
 *
 * No tool-calling surface exists anywhere in this pipeline — the model is
 * never given anything it could invoke. Context is gathered server-side
 * before the call (context.ts) and handed to the model as text; the model
 * cannot request more, and it categorically cannot write to anything. This
 * is what makes "the AI has read-only access" true by construction rather
 * than by convention: there's no tool for it to misuse because there's no
 * tool at all.
 */

export interface CompanionReply {
  content: string;
  category: safety.SafetyCategory;
  providerUsed: string;
  escalated: boolean;
  safetyFlags: Record<string, unknown>;
}

const CRISIS_RESPONSE_PREFIX =
  "Thank you for telling me. What you're feeling matters, and this deserves more support than I can give in a chat message.";

const DOSAGE_CHANGE_RESPONSE =
  "I can't advise on changing, stopping, or adjusting your medication — that has to come from your " +
  "prescribing doctor or pharmacist, since they know your full medical picture. Please reach out to " +
  "them, especially if something is making the current plan hard to stick to; they may have options " +
  "you haven't considered. I'm glad to help you note this down or prepare questions to ask them.";

export async function generateCompanionReply(
  db: PrismaClient,
  config: AppConfig,
  userId: string,
  userMessage: string,
): Promise<CompanionReply> {
  const classification = safety.classifyInput(userMessage);

  if (classification.category === "CRISIS") {
    const guidance = safety.escalationGuidance(config.escalation);
    return {
      content: `${CRISIS_RESPONSE_PREFIX} ${guidance}`,
      category: "CRISIS",
      providerUsed: "scripted-safety-override",
      escalated: true,
      safetyFlags: { classification: classification.matchedPatterns },
    };
  }

  if (classification.category === "DOSAGE_CHANGE") {
    return {
      content: DOSAGE_CHANGE_RESPONSE,
      category: "DOSAGE_CHANGE",
      providerUsed: "scripted-safety-override",
      escalated: false,
      safetyFlags: { classification: classification.matchedPatterns },
    };
  }

  const context = await buildCompanionContext(db, userId);
  const systemPrompt = buildSystemPrompt(context, classification.category);

  const providers: coreAi.NamedProvider[] = [
    { name: "workers-ai", call: createWorkersAiProvider(config.ai) },
    { name: "groq", call: createGroqProvider(config.ai) },
  ];

  let rawText: string;
  let providerUsed: string;
  try {
    const result = await coreAi.callWithFallback(providers, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ]);
    rawText = result.text;
    providerUsed = result.providerUsed;
  } catch {
    rawText = safety.scriptedCompanionResponse(context.mood);
    providerUsed = "scripted-last-resort";
  }

  const validation = safety.validateOutput(rawText);

  return {
    content: validation.sanitized,
    category: classification.category,
    providerUsed,
    escalated: false,
    safetyFlags: {
      classification: classification.matchedPatterns,
      outputValidation: validation.safe ? "passed" : validation.violations,
    },
  };
}
