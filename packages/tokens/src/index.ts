// Design tokens, including the Senior/Accessibility Mode scale (Build Plan §3.5).

export * from "./contrast.js";
export * from "./typography.js";
export * from "./touchTarget.js";
export * from "./motion.js";
export * from "./spacing.js";

import { ACCESSIBILITY_CONTRAST, STANDARD_CONTRAST, type ContrastPalette } from "./contrast.js";
import { REDUCED_MOTION, STANDARD_MOTION, type MotionTokens } from "./motion.js";
import { ACCESSIBILITY_TOUCH_TARGET, STANDARD_TOUCH_TARGET, type TouchTargetTokens } from "./touchTarget.js";
import { ACCESSIBILITY_TYPE_SCALE, STANDARD_TYPE_SCALE, type TypeScale } from "./typography.js";

export type AccessibilityMode = "standard" | "accessibility";

export interface Tokens {
  mode: AccessibilityMode;
  type: TypeScale;
  touchTarget: TouchTargetTokens;
  contrast: ContrastPalette;
  motion: MotionTokens;
}

/**
 * The single entry point the mobile app's root uses (Build Plan §3.5): one
 * function swapping four token groups at the root of one component tree,
 * rather than a "senior version" of each screen. `mode` normally comes from
 * `User.accessibilityMode` (apps/api), with a device-local override for
 * trying it without changing the account setting.
 */
export function getTokens(mode: AccessibilityMode): Tokens {
  if (mode === "accessibility") {
    return {
      mode,
      type: ACCESSIBILITY_TYPE_SCALE,
      touchTarget: ACCESSIBILITY_TOUCH_TARGET,
      contrast: ACCESSIBILITY_CONTRAST,
      motion: REDUCED_MOTION,
    };
  }
  return {
    mode,
    type: STANDARD_TYPE_SCALE,
    touchTarget: STANDARD_TOUCH_TARGET,
    contrast: STANDARD_CONTRAST,
    motion: STANDARD_MOTION,
  };
}
