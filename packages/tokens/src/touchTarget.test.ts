import { describe, expect, it } from "vitest";
import { ACCESSIBILITY_TOUCH_TARGET, STANDARD_TOUCH_TARGET } from "./touchTarget.js";

describe("touch targets", () => {
  it("standard meets the WCAG 2.5.5 AA / HIG minimum of 44", () => {
    expect(STANDARD_TOUCH_TARGET.minSize).toBeGreaterThanOrEqual(44);
  });

  it("accessibility mode exceeds the standard minimum, not just meets it", () => {
    expect(ACCESSIBILITY_TOUCH_TARGET.minSize).toBeGreaterThan(STANDARD_TOUCH_TARGET.minSize);
    expect(ACCESSIBILITY_TOUCH_TARGET.spacing).toBeGreaterThan(STANDARD_TOUCH_TARGET.spacing);
  });
});
