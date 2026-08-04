import { z } from "zod";

export const metricTypeSchema = z.enum([
  "HEART_RATE",
  "BLOOD_PRESSURE",
  "BLOOD_GLUCOSE",
  "WEIGHT",
  "TEMPERATURE",
  "SLEEP_HOURS",
  "STEPS",
  "EXERCISE_MINUTES",
  "HYDRATION_ML",
  "MOOD",
  "PAIN_LEVEL",
]);
export type MetricType = z.infer<typeof metricTypeSchema>;

/** §6: user-entered data must be visibly separate from device-generated data. */
export const metricSourceSchema = z.enum(["SELF_REPORTED", "DEVICE"]);
export type MetricSource = z.infer<typeof metricSourceSchema>;

export const createMetricRequestSchema = z.object({
  type: metricTypeSchema,
  value: z.number(),
  valueSecondary: z.number().optional(),
  unit: z.string().max(20).optional(),
  source: metricSourceSchema,
  recordedAt: z.string().datetime().optional(),
});
export type CreateMetricRequest = z.infer<typeof createMetricRequestSchema>;

export const healthMetricSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  type: metricTypeSchema,
  value: z.number(),
  valueSecondary: z.number().nullable(),
  unit: z.string(),
  source: metricSourceSchema,
  recordedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});
export type HealthMetric = z.infer<typeof healthMetricSchema>;

// --- Daily check-in: adaptive, one question at a time (§7) ----------------

export const checkInFieldSchema = z.enum([
  "mood",
  "energy",
  "sleepQuality",
  "stress",
  "pain",
  "medicationAdherence",
  "physicalActivity",
  "generalWellbeing",
]);
export type CheckInField = z.infer<typeof checkInFieldSchema>;

export const answerCheckInRequestSchema = z.object({
  field: checkInFieldSchema,
  value: z.number().int().min(1).max(5),
});
export type AnswerCheckInRequest = z.infer<typeof answerCheckInRequestSchema>;

export const checkInSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  date: z.string(), // YYYY-MM-DD
  mood: z.number().nullable(),
  energy: z.number().nullable(),
  sleepQuality: z.number().nullable(),
  stress: z.number().nullable(),
  pain: z.number().nullable(),
  medicationAdherence: z.number().nullable(),
  physicalActivity: z.number().nullable(),
  generalWellbeing: z.number().nullable(),
  createdAt: z.string().datetime(),
});
export type CheckIn = z.infer<typeof checkInSchema>;

export const checkInTodayResponseSchema = z.object({
  checkIn: checkInSchema.nullable(),
  /** The next question the client should ask, or null when the check-in is complete. */
  nextQuestion: checkInFieldSchema.nullable(),
});
export type CheckInTodayResponse = z.infer<typeof checkInTodayResponseSchema>;
