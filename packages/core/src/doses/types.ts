/**
 * Mirrors the `DoseStatus` enum in apps/api/prisma/schema.prisma. Duplicated
 * for the same reason as packages/core/src/policy/types.ts: core has no
 * @prisma/client dependency. apps/api/src/doses/status-sync.test.ts guards
 * against drift.
 */
export const DOSE_STATUSES = ["PENDING", "TAKEN", "SKIPPED", "SNOOZED", "MISSED", "UNKNOWN"] as const;
export type DoseStatus = (typeof DOSE_STATUSES)[number];

/** Statuses a user can record directly. MISSED is always time-derived, never user-set. */
export const RECORDABLE_STATUSES = ["TAKEN", "SKIPPED", "SNOOZED", "UNKNOWN"] as const;
export type RecordableStatus = (typeof RECORDABLE_STATUSES)[number];

/** Once set, a dose's outcome doesn't change — this is what makes adherence history trustworthy. */
export const TERMINAL_STATUSES = ["TAKEN", "SKIPPED"] as const;
