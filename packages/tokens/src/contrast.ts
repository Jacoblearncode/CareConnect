/**
 * WCAG 2.x relative-luminance contrast ratio (Build Plan §3.5 / §12). Pure
 * math, no I/O, so the color pairs below can be asserted against a real
 * threshold in tests rather than eyeballed.
 *
 * https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html
 */
function srgbChannelToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const rl = srgbChannelToLinear(r);
  const gl = srgbChannelToLinear(g);
  const bl = srgbChannelToLinear(b);
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

/** Returns the WCAG contrast ratio between two `#rrggbb` colors, from 1 (identical) to 21 (black/white). */
export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG AA for normal-size text; the floor every pair below must clear. */
export const WCAG_AA_NORMAL_TEXT = 4.5;
/** WCAG AAA for normal-size text; Accessibility Mode pairs target this, not just AA. */
export const WCAG_AAA_NORMAL_TEXT = 7;

export interface ColorPair {
  foreground: string;
  background: string;
}

export interface ContrastPalette {
  text: ColorPair;
  mutedText: ColorPair;
  button: ColorPair;
  danger: ColorPair;
}

/** Everyday palette: clears AA, uses a genuinely muted secondary tone. */
export const STANDARD_CONTRAST: ContrastPalette = {
  text: { foreground: "#1F2933", background: "#FFFFFF" },
  mutedText: { foreground: "#3E4C59", background: "#FFFFFF" },
  button: { foreground: "#FFFFFF", background: "#205072" },
  danger: { foreground: "#FFFFFF", background: "#B91C1C" },
};

/**
 * Senior/Accessibility Mode palette (§12): every pair targets AAA
 * (7:1), not just AA — including "muted" text, which in this mode is a
 * darker gray rather than a lighter one, because a lighter muted tone is
 * exactly the kind of low-contrast text §12 asks this mode to eliminate.
 */
export const ACCESSIBILITY_CONTRAST: ContrastPalette = {
  text: { foreground: "#000000", background: "#FFFFFF" },
  mutedText: { foreground: "#1A1A1A", background: "#FFFFFF" },
  button: { foreground: "#FFFFFF", background: "#000000" },
  danger: { foreground: "#FFFFFF", background: "#8B0000" },
};
