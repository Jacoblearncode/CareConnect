import { describe, expect, it } from "vitest";
import { getTokens } from "./index.js";

describe("getTokens", () => {
  it("returns the standard scale for 'standard'", () => {
    const tokens = getTokens("standard");
    expect(tokens.mode).toBe("standard");
    expect(tokens.motion.enabled).toBe(true);
  });

  it("returns the accessibility scale for 'accessibility', with motion disabled", () => {
    const tokens = getTokens("accessibility");
    expect(tokens.mode).toBe("accessibility");
    expect(tokens.motion.enabled).toBe(false);
    expect(tokens.touchTarget.minSize).toBeGreaterThan(getTokens("standard").touchTarget.minSize);
  });
});
