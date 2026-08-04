import { describe, expect, it } from "vitest";
import { summarizeAdherence } from "./adherence.js";

describe("summarizeAdherence", () => {
  it("returns null rate when nothing has come due yet", () => {
    const summary = summarizeAdherence([{ status: "PENDING" }, { status: "PENDING" }]);
    expect(summary.ratePercent).toBeNull();
    expect(summary.pending).toBe(2);
  });

  it("computes rate as taken / (taken + skipped + missed)", () => {
    const summary = summarizeAdherence([
      { status: "TAKEN" },
      { status: "TAKEN" },
      { status: "TAKEN" },
      { status: "SKIPPED" },
      { status: "MISSED" },
    ]);
    // 3 taken / 5 resolved = 60%
    expect(summary.ratePercent).toBe(60);
  });

  it("excludes UNKNOWN from both numerator and denominator", () => {
    const summary = summarizeAdherence([
      { status: "TAKEN" },
      { status: "UNKNOWN" },
      { status: "UNKNOWN" },
    ]);
    // 1 taken / 1 resolved = 100%, the two UNKNOWNs don't count against it
    expect(summary.ratePercent).toBe(100);
    expect(summary.unknown).toBe(2);
  });

  it("matches the spec's own worked example (§5: this week 92%)", () => {
    const doses = [
      ...Array(23).fill({ status: "TAKEN" }),
      ...Array(2).fill({ status: "MISSED" }),
    ];
    const summary = summarizeAdherence(doses);
    expect(summary.ratePercent).toBeCloseTo(92, 0);
  });
});
