/**
 * Mirrors `MetricType` / `MetricSource` in apps/api/prisma/schema.prisma.
 * Hand-copied for the same reason as policy/types.ts and doses/types.ts —
 * core has no @prisma/client dependency. apps/api/src/wellness's drift test
 * guards against these lists diverging from the schema.
 */

export const METRIC_TYPES = [
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
] as const;
export type MetricType = (typeof METRIC_TYPES)[number];

export const METRIC_SOURCES = ["SELF_REPORTED", "DEVICE"] as const;
export type MetricSource = (typeof METRIC_SOURCES)[number];

/**
 * §10's four access tiers are per data *category*, and the schema's
 * DataCategory enum deliberately separates MOOD from WELLNESS_METRICS —
 * someone can grant a buddy visibility into heart rate and sleep without
 * granting insight into emotional state, or the reverse. So a metric's
 * required permission category depends on its type, not on it being a
 * HealthMetric row in general.
 */
export function metricCategoryFor(type: MetricType): "MOOD" | "WELLNESS_METRICS" {
  return type === "MOOD" ? "MOOD" : "WELLNESS_METRICS";
}

/** Sensible default unit per type, used when a client doesn't supply one. */
export function defaultUnitFor(type: MetricType): string {
  switch (type) {
    case "HEART_RATE":
      return "bpm";
    case "BLOOD_PRESSURE":
      return "mmHg";
    case "BLOOD_GLUCOSE":
      return "mg/dL";
    case "WEIGHT":
      return "kg";
    case "TEMPERATURE":
      return "°C";
    case "SLEEP_HOURS":
      return "hours";
    case "STEPS":
      return "steps";
    case "EXERCISE_MINUTES":
      return "minutes";
    case "HYDRATION_ML":
      return "ml";
    case "MOOD":
      return "1-5";
    case "PAIN_LEVEL":
      return "1-5";
  }
}
