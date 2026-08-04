import { describe, expect, it } from "vitest";
import { validateOutput } from "./validator.js";

describe("validateOutput — catches false-confidence diagnostic claims", () => {
  const unsafeMessages = [
    "You definitely have diabetes based on what you've described.",
    "You certainly have an infection.",
    "You clearly have anxiety disorder.",
    "There's no doubt you have a thyroid disease.",
    "You are diagnosed with hypertension.",
    "You're diagnosed with a heart condition.",
    "I diagnose you with seasonal depression.",
    "You have Crohn's disease.",
    "You have an autoimmune disorder.",
    "This is definitely appendicitis.",
    "You have cancer, I'm afraid.",
  ];

  it.each(unsafeMessages)("rejects %j", (message) => {
    const result = validateOutput(message);
    expect(result.safe).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.sanitized).not.toBe(message);
  });
});

describe("validateOutput — catches dosage instructions", () => {
  const unsafeMessages = [
    "Take 500 mg of ibuprofen twice daily.",
    "You should take 10mg every morning.",
    "You should increase your dose to manage the symptoms.",
    "I'd recommend you decrease your dosage slightly.",
    "Try to double your dose this week.",
    "You should stop taking your medication immediately.",
    "It would be best to stop your medication for now.",
    "Consider stopping taking your meds for a few days.",
  ];

  it.each(unsafeMessages)("rejects %j", (message) => {
    const result = validateOutput(message);
    expect(result.safe).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });
});

describe("validateOutput — passes safe, ordinary responses through unchanged", () => {
  const safeMessages = [
    "It sounds like today has been difficult. Would you like to try a short breathing exercise?",
    "That's great to hear! Would you like to keep the momentum going with today's goals?",
    "I can't diagnose this, but because you've reported these symptoms, it would be reasonable to speak with a healthcare professional.",
    "Your sleep has been trending upward this week, which is great to see.",
    "Remember to always take your medication as prescribed by your doctor.",
    "Here are a few questions you could ask your doctor at your next appointment.",
    "Staying hydrated can help with energy levels throughout the day.",
    "It's completely normal to feel stressed sometimes — would you like some tips?",
  ];

  it.each(safeMessages)("passes %j through unchanged", (message) => {
    const result = validateOutput(message);
    expect(result.safe).toBe(true);
    expect(result.sanitized).toBe(message);
    expect(result.violations).toEqual([]);
  });
});

describe("validateOutput — replaces the whole response, not just the offending clause", () => {
  it("does not leak any part of the unsafe original text into sanitized output", () => {
    const result = validateOutput("You definitely have diabetes, so cut back on sugar.");
    expect(result.sanitized).not.toContain("diabetes");
    expect(result.sanitized).not.toContain("definitely");
  });
});
