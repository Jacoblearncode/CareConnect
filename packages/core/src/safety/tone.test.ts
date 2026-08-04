import { describe, expect, it } from "vitest";
import { moodOpener, toneDirective } from "./tone.js";

describe("toneDirective", () => {
  it("uses a neutral default when no check-in mood is available", () => {
    expect(toneDirective(undefined)).toMatch(/neutral/i);
  });

  it("is gentle and supportive for a low mood (1-2)", () => {
    expect(toneDirective(1)).toMatch(/gentle|supportive/i);
    expect(toneDirective(2)).toMatch(/gentle|supportive/i);
  });

  it("is even-keeled for a neutral mood (3)", () => {
    expect(toneDirective(3)).toMatch(/neutral|even-keeled/i);
  });

  it("matches positive energy for a high mood (4-5)", () => {
    expect(toneDirective(4)).toMatch(/positive|momentum/i);
    expect(toneDirective(5)).toMatch(/positive|momentum/i);
  });
});

describe("moodOpener", () => {
  it("returns the spec's low-mood example verbatim for mood 1-2", () => {
    expect(moodOpener(1)).toContain("It sounds like today has been difficult");
    expect(moodOpener(2)).toContain("It sounds like today has been difficult");
  });

  it("returns the spec's positive-mood example verbatim for mood 4-5", () => {
    expect(moodOpener(4)).toContain("That's great to hear!");
    expect(moodOpener(5)).toContain("That's great to hear!");
  });

  it("returns null for a neutral mood or no check-in — no scripted opener for 'fine'", () => {
    expect(moodOpener(3)).toBeNull();
    expect(moodOpener(undefined)).toBeNull();
  });
});
