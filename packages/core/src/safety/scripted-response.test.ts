import { describe, expect, it } from "vitest";
import { scriptedCompanionResponse } from "./scripted-response.js";

describe("scriptedCompanionResponse", () => {
  it("uses the low-mood opener when mood is low", () => {
    expect(scriptedCompanionResponse(1)).toContain("It sounds like today has been difficult");
  });

  it("uses the positive-mood opener when mood is high", () => {
    expect(scriptedCompanionResponse(5)).toContain("That's great to hear!");
  });

  it("falls back to a generic acknowledgement with no mood data", () => {
    const response = scriptedCompanionResponse(undefined);
    expect(response).toContain("Thanks for sharing that with me");
  });

  it("always discloses that it's running in a limited mode", () => {
    expect(scriptedCompanionResponse(1)).toMatch(/limited offline mode/i);
    expect(scriptedCompanionResponse(undefined)).toMatch(/limited offline mode/i);
  });
});
