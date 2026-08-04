import { describe, expect, it } from "vitest";
import { classifyInput } from "./classifier.js";

describe("classifyInput — CRISIS", () => {
  const crisisMessages = [
    "I want to kill myself",
    "i've been thinking about killing myself lately",
    "I want to end my life",
    "sometimes I just want to end it all",
    "I wish I were dead",
    "I wish I was dead honestly",
    "I don't want to live anymore",
    "there's no reason to live",
    "no point in living like this",
    "I've been thinking about hurting myself",
    "I want to harm myself",
    "I've been engaging in self-harm",
    "I've been doing self harm",
    "everyone would be better off without me",
    "I feel like I'm better off dead",
    "I can't go on like this",
    "I'm suicidal",
    "having suicidal thoughts",
    "I feel like ending it all",
  ];

  it.each(crisisMessages)("classifies %j as CRISIS", (message) => {
    const result = classifyInput(message);
    expect(result.category).toBe("CRISIS");
    expect(result.matchedPatterns.length).toBeGreaterThan(0);
  });

  it("CRISIS takes priority over a dosage-change phrasing in the same message", () => {
    const result = classifyInput("I want to stop taking my medication, I don't want to live anymore");
    expect(result.category).toBe("CRISIS");
  });
});

describe("classifyInput — DOSAGE_CHANGE", () => {
  const dosageMessages = [
    "should I stop taking my metformin?",
    "can I stop taking my blood pressure medication",
    "is it okay to stop my medication",
    "is it ok to stop taking this",
    "I want to double my dose",
    "should I double the dosage",
    "can I increase my dose",
    "I'm going to raise my dosage",
    "should I lower my dose",
    "I want to reduce my dosage",
    "can I change my dose",
    "should I skip my medication today",
    "is it fine to skip a dose",
    "can I skip today's medication",
    "can I take more than prescribed",
    "can I take extra just in case",
  ];

  it.each(dosageMessages)("classifies %j as DOSAGE_CHANGE", (message) => {
    const result = classifyInput(message);
    expect(result.category).toBe("DOSAGE_CHANGE");
    expect(result.matchedPatterns.length).toBeGreaterThan(0);
  });
});

describe("classifyInput — DIAGNOSIS_SEEKING", () => {
  const diagnosisMessages = [
    "do I have diabetes?",
    "do I have depression",
    "am I depressed",
    "am I diabetic",
    "am I dying",
    "is this cancer",
    "is this a heart attack",
    "is this serious",
    "can you diagnose me",
    "please diagnose this",
    "what disease causes fatigue",
    "what condition would cause this",
    "what's wrong with me",
    "whats wrong with me",
    "do you think I have an ulcer",
  ];

  it.each(diagnosisMessages)("classifies %j as DIAGNOSIS_SEEKING", (message) => {
    const result = classifyInput(message);
    expect(result.category).toBe("DIAGNOSIS_SEEKING");
    expect(result.matchedPatterns.length).toBeGreaterThan(0);
  });
});

describe("classifyInput — GENERAL (safe, ordinary wellness messages)", () => {
  const safeMessages = [
    "How has my sleep been trending this week?",
    "Can you help me prepare some questions for my doctor's appointment?",
    "I completed my walk today, feeling good!",
    "What does it generally mean when heart rate is elevated after exercise?",
    "I'm feeling pretty good today",
    "Can you summarize my mood over the last month?",
    "I drank more water today than usual",
    "Encourage me to keep up my exercise routine",
    "Thanks for checking in on me",
    "What's a good breathing exercise for stress?",
    "I'm feeling stressed about work today",
    "Remind me why medication adherence matters",
    "I forgot to log my check-in yesterday",
  ];

  it.each(safeMessages)("classifies %j as GENERAL", (message) => {
    const result = classifyInput(message);
    expect(result.category).toBe("GENERAL");
    expect(result.matchedPatterns).toEqual([]);
  });
});

describe("classifyInput — case and punctuation insensitivity", () => {
  it("matches regardless of case", () => {
    expect(classifyInput("I WANT TO KILL MYSELF").category).toBe("CRISIS");
  });

  it("matches with surrounding punctuation and extra whitespace", () => {
    expect(classifyInput("  should I stop taking my medication???  ").category).toBe("DOSAGE_CHANGE");
  });
});
