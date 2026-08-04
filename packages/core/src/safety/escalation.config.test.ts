import { describe, expect, it } from "vitest";
import { escalationGuidance } from "./escalation.config.js";

describe("escalationGuidance", () => {
  it("defaults to neutral wording with no hardcoded numbers when unconfigured", () => {
    const guidance = escalationGuidance({});
    expect(guidance).toMatch(/local emergency services/i);
    expect(guidance).not.toMatch(/\d{3}/); // no phone-number-shaped digits
  });

  it("includes the emergency number when configured", () => {
    const guidance = escalationGuidance({ emergencyNumber: "911" });
    expect(guidance).toContain("911");
  });

  it("includes the crisis line name and number when configured", () => {
    const guidance = escalationGuidance({
      crisisLineName: "Suicide & Crisis Lifeline",
      crisisLineNumber: "988",
    });
    expect(guidance).toContain("988");
    expect(guidance).toContain("Suicide & Crisis Lifeline");
  });

  it("labels the crisis line generically when a number is given without a name", () => {
    const guidance = escalationGuidance({ crisisLineNumber: "123456" });
    expect(guidance).toContain("Crisis line");
  });
});
