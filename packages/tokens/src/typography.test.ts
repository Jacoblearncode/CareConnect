import { describe, expect, it } from "vitest";
import { ACCESSIBILITY_TYPE_SCALE, STANDARD_TYPE_SCALE, type TypeRole } from "./typography.js";

describe("type scales", () => {
  it.each(Object.keys(STANDARD_TYPE_SCALE) as TypeRole[])(
    "accessibility %s is strictly larger than standard %s",
    (role) => {
      expect(ACCESSIBILITY_TYPE_SCALE[role].fontSize).toBeGreaterThan(STANDARD_TYPE_SCALE[role].fontSize);
      expect(ACCESSIBILITY_TYPE_SCALE[role].lineHeight).toBeGreaterThan(
        STANDARD_TYPE_SCALE[role].lineHeight,
      );
    },
  );

  it.each(Object.values(STANDARD_TYPE_SCALE))("line height is never smaller than font size", (style) => {
    expect(style.lineHeight).toBeGreaterThanOrEqual(style.fontSize);
  });

  it.each(Object.values(ACCESSIBILITY_TYPE_SCALE))(
    "accessibility line height is never smaller than font size",
    (style) => {
      expect(style.lineHeight).toBeGreaterThanOrEqual(style.fontSize);
    },
  );
});
