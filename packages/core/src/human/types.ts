/**
 * Mirrors `InviteStatus` / `BuddyLinkStatus` / `BuddyMessageType` /
 * `GoalStatus` / `CoachLinkStatus` in apps/api/prisma/schema.prisma.
 * Hand-copied for the same reason as policy/types.ts, doses/types.ts, and
 * wellness/types.ts — core has no @prisma/client dependency.
 * apps/api/src/human's drift test guards against these lists diverging from
 * the schema.
 */

export const INVITE_STATUSES = ["PENDING", "ACCEPTED", "DECLINED", "CANCELED"] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

export const BUDDY_LINK_STATUSES = ["ACTIVE", "REMOVED"] as const;
export type BuddyLinkStatus = (typeof BUDDY_LINK_STATUSES)[number];

export const BUDDY_MESSAGE_TYPES = ["MESSAGE", "ENCOURAGEMENT", "CHECKIN_REQUEST"] as const;
export type BuddyMessageType = (typeof BUDDY_MESSAGE_TYPES)[number];

export const GOAL_STATUSES = ["ACTIVE", "COMPLETED", "ABANDONED"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const COACH_LINK_STATUSES = ["PENDING", "ACTIVE", "ENDED"] as const;
export type CoachLinkStatus = (typeof COACH_LINK_STATUSES)[number];
