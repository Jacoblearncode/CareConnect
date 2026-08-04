import { z } from "zod";

export const doseStatusSchema = z.enum(["PENDING", "TAKEN", "SKIPPED", "SNOOZED", "MISSED", "UNKNOWN"]);
export type DoseStatus = z.infer<typeof doseStatusSchema>;

/** MISSED is always time-derived (Build Plan §3.2) — never something a client can set directly. */
export const recordableStatusSchema = z.enum(["TAKEN", "SKIPPED", "SNOOZED", "UNKNOWN"]);
export type RecordableStatus = z.infer<typeof recordableStatusSchema>;

export const scheduleRuleInputSchema = z.object({
  timesOfDay: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM.")).min(1),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).default([]),
  timezone: z.string().default("UTC"),
  windowMinutes: z.number().int().min(5).max(24 * 60).default(60),
});
export type ScheduleRuleInput = z.infer<typeof scheduleRuleInputSchema>;

export const createMedicationRequestSchema = z.object({
  name: z.string().min(1).max(200),
  strength: z.string().max(100).optional(),
  form: z.string().max(100).optional(),
  instructions: z.string().max(1000).optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  schedule: scheduleRuleInputSchema,
});
export type CreateMedicationRequest = z.infer<typeof createMedicationRequestSchema>;

export const updateMedicationRequestSchema = z.object({
  strength: z.string().max(100).optional(),
  form: z.string().max(100).optional(),
  instructions: z.string().max(1000).optional(),
  endDate: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateMedicationRequest = z.infer<typeof updateMedicationRequestSchema>;

export const medicationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string(),
  strength: z.string().nullable(),
  form: z.string().nullable(),
  instructions: z.string().nullable(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
});
export type Medication = z.infer<typeof medicationSchema>;

export const doseInstanceSchema = z.object({
  id: z.string().uuid(),
  medicationId: z.string().uuid(),
  medicationName: z.string().optional(),
  scheduledAt: z.string().datetime(),
  windowEndsAt: z.string().datetime(),
  status: doseStatusSchema,
  recordedAt: z.string().datetime().nullable(),
  note: z.string().nullable(),
});
export type DoseInstance = z.infer<typeof doseInstanceSchema>;

export const recordDoseRequestSchema = z.object({
  status: recordableStatusSchema,
  note: z.string().max(500).optional(),
});
export type RecordDoseRequest = z.infer<typeof recordDoseRequestSchema>;

export const adherenceSummarySchema = z.object({
  taken: z.number(),
  skipped: z.number(),
  missed: z.number(),
  unknown: z.number(),
  pending: z.number(),
  snoozed: z.number(),
  ratePercent: z.number().nullable(),
});
export type AdherenceSummary = z.infer<typeof adherenceSummarySchema>;

export const adherenceReportSchema = z.object({
  today: adherenceSummarySchema,
  week: adherenceSummarySchema,
  month: adherenceSummarySchema,
});
export type AdherenceReport = z.infer<typeof adherenceReportSchema>;

// --- Medication drafts: the OCR verification gate (Build Plan §3.3) -------

export const createDraftRequestSchema = z.object({
  sourceImageRef: z.string().max(500).optional(),
  extractedName: z.string().max(200).optional(),
  extractedStrength: z.string().max(100).optional(),
  extractedInstructions: z.string().max(1000).optional(),
  aiConfidence: z.number().min(0).max(1).optional(),
  rawOcrText: z.string().max(5000).optional(),
});
export type CreateDraftRequest = z.infer<typeof createDraftRequestSchema>;

/**
 * Confirming a draft requires the *same* full payload as creating a
 * medication from scratch — the server never copies a draft's extracted*
 * fields into a Medication on its own. The client pre-fills a form with the
 * extracted values so the user can review and edit them, but what actually
 * gets persisted is only ever what's in this request body.
 */
export const confirmDraftRequestSchema = createMedicationRequestSchema;
export type ConfirmDraftRequest = z.infer<typeof confirmDraftRequestSchema>;

export const medicationDraftStatusSchema = z.enum(["PENDING_REVIEW", "CONFIRMED", "DISCARDED"]);

export const medicationDraftSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  sourceImageRef: z.string().nullable(),
  extractedName: z.string().nullable(),
  extractedStrength: z.string().nullable(),
  extractedInstructions: z.string().nullable(),
  aiConfidence: z.number().nullable(),
  status: medicationDraftStatusSchema,
  confirmedMedicationId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  reviewedAt: z.string().datetime().nullable(),
});
export type MedicationDraft = z.infer<typeof medicationDraftSchema>;
