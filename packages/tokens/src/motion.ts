/**
 * Motion preference (§12). Accessibility Mode disables non-essential
 * animation rather than merely shortening it — `enabled: false` is a flag
 * the UI layer checks before starting an animation at all, not just a
 * duration of 0 passed into one that still runs.
 */

export interface MotionTokens {
  enabled: boolean;
  durationMs: number;
}

export const STANDARD_MOTION: MotionTokens = {
  enabled: true,
  durationMs: 200,
};

export const REDUCED_MOTION: MotionTokens = {
  enabled: false,
  durationMs: 0,
};
