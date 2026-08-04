import { z } from "zod";

/** Kept in sync with packages/core's DATA_CATEGORIES / ACCESS_LEVELS by convention. */
export const dataCategorySchema = z.enum([
  "MEDICATIONS",
  "ADHERENCE",
  "WELLNESS_METRICS",
  "CHECKINS",
  "MOOD",
  "APPOINTMENTS",
]);
export type DataCategory = z.infer<typeof dataCategorySchema>;

export const accessLevelSchema = z.enum(["NONE", "VIEW"]);
export type AccessLevel = z.infer<typeof accessLevelSchema>;

export const upsertGrantRequestSchema = z.object({
  granteeId: z.string().uuid(),
  category: dataCategorySchema,
  level: accessLevelSchema,
});
export type UpsertGrantRequest = z.infer<typeof upsertGrantRequestSchema>;

export const revokeGrantRequestSchema = z.object({
  granteeId: z.string().uuid(),
  category: dataCategorySchema,
});
export type RevokeGrantRequest = z.infer<typeof revokeGrantRequestSchema>;

/** A grant this user has given, or one they've received — same shape either way. */
export const grantSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  ownerDisplayName: z.string().optional(),
  granteeId: z.string().uuid(),
  granteeDisplayName: z.string().optional(),
  category: dataCategorySchema,
  level: accessLevelSchema,
  updatedAt: z.string().datetime(),
});
export type Grant = z.infer<typeof grantSchema>;
