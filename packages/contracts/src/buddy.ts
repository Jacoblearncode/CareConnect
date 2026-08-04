import { z } from "zod";

/** Kept in sync with packages/core's human module by convention. */
export const inviteStatusSchema = z.enum(["PENDING", "ACCEPTED", "DECLINED", "CANCELED"]);
export type InviteStatus = z.infer<typeof inviteStatusSchema>;

export const buddyMessageTypeSchema = z.enum(["MESSAGE", "ENCOURAGEMENT", "CHECKIN_REQUEST"]);
export type BuddyMessageType = z.infer<typeof buddyMessageTypeSchema>;

export const goalStatusSchema = z.enum(["ACTIVE", "COMPLETED", "ABANDONED"]);
export type GoalStatus = z.infer<typeof goalStatusSchema>;

// --- Invites (§9) -----------------------------------------------------------

/** Either an existing user (toUserId) or an email not yet on the platform (toEmail). */
export const createBuddyInviteRequestSchema = z
  .object({
    toUserId: z.string().uuid().optional(),
    toEmail: z.string().email().optional(),
  })
  .refine((v) => Boolean(v.toUserId) !== Boolean(v.toEmail), {
    message: "Provide exactly one of toUserId or toEmail.",
  });
export type CreateBuddyInviteRequest = z.infer<typeof createBuddyInviteRequestSchema>;

export const buddyInviteSchema = z.object({
  id: z.string().uuid(),
  fromUserId: z.string().uuid(),
  fromUserDisplayName: z.string().optional(),
  toUserId: z.string().uuid().nullable(),
  toEmail: z.string().nullable(),
  status: inviteStatusSchema,
  createdAt: z.string().datetime(),
  respondedAt: z.string().datetime().nullable(),
});
export type BuddyInvite = z.infer<typeof buddyInviteSchema>;

// --- Links -------------------------------------------------------------------

export const buddyLinkSchema = z.object({
  id: z.string().uuid(),
  buddyUserId: z.string().uuid(),
  buddyDisplayName: z.string(),
  status: z.enum(["ACTIVE", "REMOVED"]),
  createdAt: z.string().datetime(),
});
export type BuddyLink = z.infer<typeof buddyLinkSchema>;

// --- Messages (§9) -------------------------------------------------------------

export const sendBuddyMessageRequestSchema = z.object({
  type: buddyMessageTypeSchema.default("MESSAGE"),
  body: z.string().min(1).max(2000),
});
export type SendBuddyMessageRequest = z.infer<typeof sendBuddyMessageRequestSchema>;

export const buddyMessageSchema = z.object({
  id: z.string().uuid(),
  buddyLinkId: z.string().uuid(),
  senderId: z.string().uuid(),
  senderDisplayName: z.string().optional(),
  type: buddyMessageTypeSchema,
  body: z.string(),
  createdAt: z.string().datetime(),
});
export type BuddyMessage = z.infer<typeof buddyMessageSchema>;

// --- Accountability goals (§9) --------------------------------------------

export const createAccountabilityGoalRequestSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  targetDate: z.string().datetime().optional(),
});
export type CreateAccountabilityGoalRequest = z.infer<typeof createAccountabilityGoalRequestSchema>;

export const updateAccountabilityGoalRequestSchema = z.object({
  status: goalStatusSchema,
});
export type UpdateAccountabilityGoalRequest = z.infer<typeof updateAccountabilityGoalRequestSchema>;

export const accountabilityGoalSchema = z.object({
  id: z.string().uuid(),
  buddyLinkId: z.string().uuid(),
  createdByUserId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  targetDate: z.string().datetime().nullable(),
  status: goalStatusSchema,
  createdAt: z.string().datetime(),
});
export type AccountabilityGoal = z.infer<typeof accountabilityGoalSchema>;
