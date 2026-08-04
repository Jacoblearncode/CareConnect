import type { DataCategory } from "../policy/types.js";

/**
 * Build Plan §3.1: the default grant for a newly accepted buddy is clinical
 * detail — medication names, adherence events, and wellness metrics — not
 * just an engagement signal. Deliberately excludes CHECKINS and MOOD: those
 * stay private until the owner explicitly widens the grant, since §9's own
 * worked example ("Alex hasn't completed today's check-in") is narrower than
 * this default and check-in content can include free-text answers the user
 * never intended for a buddy.
 *
 * A `BuddyLink` has no inherent "patient" vs. "buddy" role (`userA`/`userB`
 * are symmetric — see schema.prisma), so acceptance grants both directions
 * by default. Either side can narrow or revoke their own grant afterward
 * through the existing PUT/DELETE /permissions/grants routes (Phase 1);
 * nothing here is a special buddy-only permission path.
 */
export const DEFAULT_BUDDY_GRANT_CATEGORIES: readonly DataCategory[] = [
  "MEDICATIONS",
  "ADHERENCE",
  "WELLNESS_METRICS",
];

/**
 * A coach relationship is directional (patient grants a coach visibility,
 * not the reverse — a coach has no medication list of their own to share
 * back), and its default is one category wider than a buddy's: CHECKINS,
 * because a wellness coach's job (§10) is explicitly to review check-in
 * trends. MOOD stays out of the default for the same reason as buddies —
 * free-text emotional content isn't assumed shared until the patient opts
 * in.
 */
export const DEFAULT_COACH_GRANT_CATEGORIES: readonly DataCategory[] = [
  "ADHERENCE",
  "WELLNESS_METRICS",
  "CHECKINS",
];
