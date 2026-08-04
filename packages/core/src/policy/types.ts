/**
 * Mirrors the `DataCategory` and `AccessLevel` enums in
 * apps/api/prisma/schema.prisma. Duplicated deliberately, not imported from
 * @prisma/client: packages/core has no I/O dependencies (Build Plan §2) and
 * is shared with the mobile app, which can't carry a generated Prisma client
 * into a React Native bundle. apps/api/src/policy/category-sync.test.ts
 * guards against these two lists drifting apart.
 */

export const DATA_CATEGORIES = [
  "MEDICATIONS",
  "ADHERENCE",
  "WELLNESS_METRICS",
  "CHECKINS",
  "MOOD",
  "APPOINTMENTS",
] as const;
export type DataCategory = (typeof DATA_CATEGORIES)[number];

export const ACCESS_LEVELS = ["NONE", "VIEW"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];
