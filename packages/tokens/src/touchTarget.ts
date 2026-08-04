/**
 * Touch target sizing (§12). 44 is the WCAG 2.5.5 AA / Apple HIG minimum
 * for standard mode; Accessibility Mode goes past that floor rather than
 * just meeting it, since §12 asks specifically for "large touch targets"
 * for older adults, not the bare minimum every app is already expected to
 * hit.
 */

export interface TouchTargetTokens {
  /** Minimum width/height of any tappable control. */
  minSize: number;
  /** Minimum gap between adjacent tappable controls, to prevent mis-taps. */
  spacing: number;
}

export const STANDARD_TOUCH_TARGET: TouchTargetTokens = {
  minSize: 44,
  spacing: 8,
};

export const ACCESSIBILITY_TOUCH_TARGET: TouchTargetTokens = {
  minSize: 56,
  spacing: 12,
};
