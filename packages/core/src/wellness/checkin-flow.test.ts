import { describe, expect, it } from "vitest";
import { nextCheckInQuestion, type CheckInAnswers } from "./checkin-flow.js";

const withMeds = { hasActiveMedications: true };
const noMeds = { hasActiveMedications: false };

describe("nextCheckInQuestion", () => {
  it("always asks mood first", () => {
    expect(nextCheckInQuestion({}, withMeds)).toBe("mood");
  });

  it("low mood branches to stress, then pain, then energy, then closes", () => {
    let answers: CheckInAnswers = { mood: 1 };
    expect(nextCheckInQuestion(answers, withMeds)).toBe("stress");

    answers = { ...answers, stress: 4 };
    expect(nextCheckInQuestion(answers, withMeds)).toBe("pain");

    answers = { ...answers, pain: 3 };
    expect(nextCheckInQuestion(answers, withMeds)).toBe("energy");

    answers = { ...answers, energy: 2 };
    expect(nextCheckInQuestion(answers, withMeds)).toBe("generalWellbeing");

    answers = { ...answers, generalWellbeing: 2 };
    expect(nextCheckInQuestion(answers, withMeds)).toBeNull();
  });

  it("low mood never asks sleepQuality, medicationAdherence, or physicalActivity", () => {
    const answers: CheckInAnswers = { mood: 2, stress: 3, pain: 2, energy: 3, generalWellbeing: 3 };
    expect(nextCheckInQuestion(answers, withMeds)).toBeNull();
  });

  it("good mood skips stress/pain and asks the routine-tracking questions instead", () => {
    let answers: CheckInAnswers = { mood: 4 };
    expect(nextCheckInQuestion(answers, withMeds)).toBe("energy");

    answers = { ...answers, energy: 4 };
    expect(nextCheckInQuestion(answers, withMeds)).toBe("sleepQuality");

    answers = { ...answers, sleepQuality: 4 };
    expect(nextCheckInQuestion(answers, withMeds)).toBe("medicationAdherence");

    answers = { ...answers, medicationAdherence: 5 };
    expect(nextCheckInQuestion(answers, withMeds)).toBe("physicalActivity");

    answers = { ...answers, physicalActivity: 3 };
    expect(nextCheckInQuestion(answers, withMeds)).toBe("generalWellbeing");
  });

  it("skips medicationAdherence entirely when the user has no active medications", () => {
    const answers: CheckInAnswers = { mood: 5, energy: 5, sleepQuality: 5 };
    expect(nextCheckInQuestion(answers, noMeds)).toBe("physicalActivity");
  });

  it("neutral mood (3) takes the good-mood branch, not the low-mood one", () => {
    const answers: CheckInAnswers = { mood: 3 };
    expect(nextCheckInQuestion(answers, withMeds)).toBe("energy");
  });

  it("generalWellbeing always closes the flow, on either branch", () => {
    const lowBranch: CheckInAnswers = { mood: 1, stress: 1, pain: 1, energy: 1 };
    const goodBranch: CheckInAnswers = { mood: 5, energy: 5, sleepQuality: 5, medicationAdherence: 5, physicalActivity: 5 };
    expect(nextCheckInQuestion(lowBranch, withMeds)).toBe("generalWellbeing");
    expect(nextCheckInQuestion(goodBranch, withMeds)).toBe("generalWellbeing");
  });
});
