/**
 * Tone adaptation (§8), reading only the value the user selected in their
 * most recent daily check-in (§7) — never inferred from the current
 * message's text, voice, or any other signal (Build Plan §3.4: §8
 * explicitly forbids claiming to detect emotional state from facial
 * expressions, voice, or text). `mood` here is a plain number; the caller
 * (apps/api) is responsible for sourcing it from CheckIn.mood and nothing
 * else — this function has no way to enforce that itself, which is exactly
 * why it takes the narrowest possible input instead of, say, the user's raw
 * message.
 */

const LOW_MOOD_THRESHOLD = 2;
const HIGH_MOOD_THRESHOLD = 4;

/** A one-line instruction injected into the model's system prompt. */
export function toneDirective(mood: number | undefined): string {
  if (mood === undefined) {
    return "No recent mood check-in is available for this user. Use a neutral, warm, supportive tone.";
  }
  if (mood <= LOW_MOOD_THRESHOLD) {
    return (
      "The user's most recent check-in reported a low mood. Respond gently and supportively — " +
      "acknowledge that today has been difficult, and consider offering a short breathing exercise " +
      "or a chance to talk about what's bothering them."
    );
  }
  if (mood >= HIGH_MOOD_THRESHOLD) {
    return (
      "The user's most recent check-in reported a positive mood. Match that energy and, where " +
      "relevant, encourage keeping up today's wellness momentum."
    );
  }
  return "The user's most recent check-in reported a neutral mood. Respond warmly, at a normal, even-keeled tone.";
}

/**
 * The spec's own two worked examples (§8), verbatim, used as a fixed opener
 * when the last-resort scripted fallback is active (no AI provider
 * reachable) or as a proactive greeting. Returns null for a neutral mood or
 * no check-in — there's no scripted opener for "fine," on purpose.
 */
export function moodOpener(mood: number | undefined): string | null {
  if (mood === undefined) {
    return null;
  }
  if (mood <= LOW_MOOD_THRESHOLD) {
    return "It sounds like today has been difficult. Would you like to do a short breathing exercise or talk about what's bothering you?";
  }
  if (mood >= HIGH_MOOD_THRESHOLD) {
    return "That's great to hear! Would you like to keep your momentum going with today's wellness goals?";
  }
  return null;
}
