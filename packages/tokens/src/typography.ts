/**
 * Type scale (Build Plan §3.5 / §12 "large fonts"). Two fixed scales rather
 * than a multiplier applied at render time: concrete sizes are what a
 * screen actually renders, and fixed values are what a test can assert
 * against without re-deriving the same arithmetic the render code uses.
 */

export type TypeRole = "caption" | "body" | "button" | "heading" | "display";

export interface TypeStyle {
  fontSize: number;
  lineHeight: number;
}

export type TypeScale = Record<TypeRole, TypeStyle>;

export const STANDARD_TYPE_SCALE: TypeScale = {
  caption: { fontSize: 12, lineHeight: 16 },
  body: { fontSize: 16, lineHeight: 22 },
  button: { fontSize: 16, lineHeight: 20 },
  heading: { fontSize: 20, lineHeight: 26 },
  display: { fontSize: 28, lineHeight: 34 },
};

/** Every role is larger, not just scaled uniformly — captions grow the most, since a 12pt caption is the least readable size in the standard scale. */
export const ACCESSIBILITY_TYPE_SCALE: TypeScale = {
  caption: { fontSize: 16, lineHeight: 22 },
  body: { fontSize: 22, lineHeight: 30 },
  button: { fontSize: 22, lineHeight: 28 },
  heading: { fontSize: 26, lineHeight: 34 },
  display: { fontSize: 36, lineHeight: 44 },
};
