import { moodOpener } from "./tone.js";

/**
 * The companion's last-resort reply (docs/AI_PROVIDERS.md "last resort"
 * column) when no AI provider is reachable. Deliberately not routed through
 * `ai.callWithFallback` alongside the real providers: it isn't a provider
 * call at all, it's a fixed, pre-reviewed template, which is what makes it
 * safe as a last resort rather than one more thing that could fail or say
 * something unsafe. It tells the user plainly that it's in a limited mode
 * rather than silently pretending to be a full conversation.
 */
export function scriptedCompanionResponse(mood: number | undefined): string {
  const opener = moodOpener(mood);
  const limitedModeNote =
    "I'm running in a limited offline mode right now, so I can't have a full conversation, but I'm still here.";

  if (opener) {
    return `${opener} ${limitedModeNote}`;
  }
  return (
    `Thanks for sharing that with me. ${limitedModeNote} ` +
    "In the meantime, your logs and reminders are all still working as normal."
  );
}
