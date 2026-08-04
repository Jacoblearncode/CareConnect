import { describe, expect, it } from "vitest";
import {
  ACCESSIBILITY_CONTRAST,
  contrastRatio,
  STANDARD_CONTRAST,
  WCAG_AA_NORMAL_TEXT,
  WCAG_AAA_NORMAL_TEXT,
} from "./contrast.js";

describe("contrastRatio", () => {
  it("returns 21 for black on white", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
  });

  it("returns 1 for identical colors", () => {
    expect(contrastRatio("#808080", "#808080")).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#1F2933", "#FFFFFF")).toBeCloseTo(contrastRatio("#FFFFFF", "#1F2933"), 5);
  });
});

describe("STANDARD_CONTRAST", () => {
  it.each(Object.entries(STANDARD_CONTRAST))("%s pair clears WCAG AA (4.5:1)", (_role, pair) => {
    expect(contrastRatio(pair.foreground, pair.background)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });
});

describe("ACCESSIBILITY_CONTRAST", () => {
  it.each(Object.entries(ACCESSIBILITY_CONTRAST))(
    "%s pair clears WCAG AAA (7:1), not just AA",
    (_role, pair) => {
      expect(contrastRatio(pair.foreground, pair.background)).toBeGreaterThanOrEqual(WCAG_AAA_NORMAL_TEXT);
    },
  );

  it.each(Object.keys(STANDARD_CONTRAST) as (keyof typeof STANDARD_CONTRAST)[])(
    "%s pair is at least as high-contrast as the standard pair",
    (role) => {
      const standardRatio = contrastRatio(
        STANDARD_CONTRAST[role].foreground,
        STANDARD_CONTRAST[role].background,
      );
      const accessibilityRatio = contrastRatio(
        ACCESSIBILITY_CONTRAST[role].foreground,
        ACCESSIBILITY_CONTRAST[role].background,
      );
      expect(accessibilityRatio).toBeGreaterThanOrEqual(standardRatio);
    },
  );
});
