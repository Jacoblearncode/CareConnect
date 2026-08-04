import { describe, expect, it } from "vitest";
import { checkGoalContent } from "./goal-policy.js";

describe("checkGoalContent", () => {
  it("allows an ordinary lifestyle goal", () => {
    expect(checkGoalContent("Walk 20 minutes, 5 days a week").likelyMedical).toBe(false);
  });

  it("allows a dietary goal", () => {
    expect(checkGoalContent("Reduce added sugar intake", "Non-medical dietary goal.").likelyMedical).toBe(
      false,
    );
  });

  it("flags a dosage number", () => {
    const result = checkGoalContent("Increase to 20mg");
    expect(result.likelyMedical).toBe(true);
    expect(result.matchedPatterns).toContain("dosage");
  });

  it("flags a medication-change instruction", () => {
    const result = checkGoalContent("Stop taking your medication");
    expect(result.likelyMedical).toBe(true);
    expect(result.matchedPatterns).toContain("medication-change");
  });

  it("does not catch a specific drug name (documented limitation, not a drug dictionary)", () => {
    expect(checkGoalContent("Stop taking metformin").likelyMedical).toBe(false);
  });

  it("flags a diagnosis reference", () => {
    expect(checkGoalContent("Diagnose the cause of fatigue").likelyMedical).toBe(true);
  });

  it("flags a prescription reference", () => {
    expect(checkGoalContent("Get prescription renewed").likelyMedical).toBe(true);
  });

  it("flags a treatment plan reference", () => {
    expect(checkGoalContent("Follow the new treatment plan").likelyMedical).toBe(true);
  });

  it("checks the description as well as the title", () => {
    const result = checkGoalContent("Feel better", "Taper off the medication slowly");
    expect(result.likelyMedical).toBe(true);
    expect(result.matchedPatterns).toContain("medication-change");
  });

  it("is case-insensitive", () => {
    expect(checkGoalContent("DIAGNOSE this").likelyMedical).toBe(true);
  });
});
