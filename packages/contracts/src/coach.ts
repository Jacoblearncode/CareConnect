import { z } from "zod";
import { goalStatusSchema } from "./buddy.js";

export const coachLinkStatusSchema = z.enum(["PENDING", "ACTIVE", "ENDED"]);
export type CoachLinkStatus = z.infer<typeof coachLinkStatusSchema>;

// --- Coach profile (§10) ------------------------------------------------------

export const upsertCoachProfileRequestSchema = z.object({
  bio: z.string().max(2000).optional(),
  credentials: z.string().max(500).optional(),
});
export type UpsertCoachProfileRequest = z.infer<typeof upsertCoachProfileRequestSchema>;

export const coachProfileSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  displayName: z.string(),
  bio: z.string().nullable(),
  credentials: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type CoachProfile = z.infer<typeof coachProfileSchema>;

// --- Coach links ---------------------------------------------------------------

/** Either side can initiate: a patient requesting a coach, or a coach inviting a patient. */
export const createCoachLinkRequestSchema = z.object({
  counterpartUserId: z.string().uuid(),
});
export type CreateCoachLinkRequest = z.infer<typeof createCoachLinkRequestSchema>;

export const coachLinkSchema = z.object({
  id: z.string().uuid(),
  coachUserId: z.string().uuid(),
  coachDisplayName: z.string().optional(),
  patientUserId: z.string().uuid(),
  patientDisplayName: z.string().optional(),
  status: coachLinkStatusSchema,
  createdAt: z.string().datetime(),
});
export type CoachLink = z.infer<typeof coachLinkSchema>;

// --- Coach notes (§10) ---------------------------------------------------------

export const createCoachNoteRequestSchema = z.object({
  body: z.string().min(1).max(4000),
});
export type CreateCoachNoteRequest = z.infer<typeof createCoachNoteRequestSchema>;

export const coachNoteSchema = z.object({
  id: z.string().uuid(),
  coachLinkId: z.string().uuid(),
  authorUserId: z.string().uuid(),
  authorDisplayName: z.string().optional(),
  body: z.string(),
  createdAt: z.string().datetime(),
});
export type CoachNote = z.infer<typeof coachNoteSchema>;

// --- Coach goals — non-medical wellness goals only (§10) -----------------------

export const createCoachGoalRequestSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  targetDate: z.string().datetime().optional(),
});
export type CreateCoachGoalRequest = z.infer<typeof createCoachGoalRequestSchema>;

export const updateCoachGoalRequestSchema = z.object({
  status: goalStatusSchema,
});
export type UpdateCoachGoalRequest = z.infer<typeof updateCoachGoalRequestSchema>;

export const coachGoalSchema = z.object({
  id: z.string().uuid(),
  coachLinkId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  targetDate: z.string().datetime().nullable(),
  status: goalStatusSchema,
  createdAt: z.string().datetime(),
});
export type CoachGoal = z.infer<typeof coachGoalSchema>;
