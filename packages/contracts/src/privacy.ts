import { z } from "zod";

export const consentTypeSchema = z.enum(["TERMS_AND_PRIVACY", "AI_PROCESSING", "DATA_SHARING_RESEARCH"]);
export type ConsentType = z.infer<typeof consentTypeSchema>;

export const setConsentRequestSchema = z.object({
  type: consentTypeSchema,
  granted: z.boolean(),
});
export type SetConsentRequest = z.infer<typeof setConsentRequestSchema>;

export const consentRecordSchema = z.object({
  type: consentTypeSchema,
  granted: z.boolean(),
  updatedAt: z.string().datetime(),
});
export type ConsentRecord = z.infer<typeof consentRecordSchema>;

export const auditLogEntrySchema = z.object({
  id: z.string().uuid(),
  action: z.string(),
  actorUserId: z.string().uuid().nullable(),
  targetUserId: z.string().uuid().nullable(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;

export const accountDeletionRequestSchema = z.object({
  // A lightweight confirmation gate, not a security boundary — the request
  // is already authenticated. Requiring the user to type this out mirrors
  // §12's "confirmation dialogs for important actions" for a destructive,
  // irreversible action.
  confirm: z.literal("DELETE"),
});
export type AccountDeletionRequest = z.infer<typeof accountDeletionRequestSchema>;
